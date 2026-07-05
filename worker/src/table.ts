/**
 * TableDO — one Durable Object instance per poker table.
 *
 * ALL game-critical logic lives here, server-side: shuffling, dealing,
 * betting validation, pot management, hand evaluation and payouts.
 * Clients only ever send intents ("raise to 400") over WebSocket and
 * receive sanitized snapshots back — a client never sees another
 * player's hole cards before showdown.
 */
import {
  Card, Stage, ClientMessage, ServerMessage, TableView, SeatView,
  ChatMessage, HandResultShare, WhitelistEntry,
  MIN_PLAYERS, MAX_PLAYERS, ACTION_SECONDS, INTERHAND_MS, BUYIN_BB,
} from './poker/types';
import { freshDeck, shuffle } from './poker/deck';
import { evaluate7 } from './poker/evaluator';
import { settlePots, Contributor } from './poker/pots';
import type { Env } from './env';

/** How long a table may sit empty before it is closed and delisted. */
const EMPTY_TABLE_CLOSE_MS = 60_000;

interface Player {
  seat: number;
  address: string; // lowercase 0x…
  ensName: string | null;
  avatar: string | null;
  stack: number;
  /** Chips committed on the current street only (display + bet math). */
  streetBet: number;
  /** Total chips committed across the whole hand (drives side pots). */
  committed: number;
  folded: boolean;
  allIn: boolean;
  /** Was dealt into the current hand. */
  inHand: boolean;
  holeCards: Card[];
  /** Has acted since the last full raise on this street. */
  acted: boolean;
  connected: boolean;
}

interface Session {
  address: string;
  ensName: string | null;
  avatar: string | null;
}

interface TableConfig {
  id: string;
  name: string;
  smallBlind: number;
  /** Private = unlisted + whitelist-only seating. Absent on legacy tables. */
  isPrivate?: boolean;
  /** Creator-chosen table size (2–9). Absent on legacy tables → MAX_PLAYERS. */
  maxPlayers?: number;
  /** Invited players (private tables only). Always includes the creator. */
  whitelist?: WhitelistEntry[];
}

export class TableDO implements DurableObject {
  private state: DurableObjectState;
  private env: Env;

  private config: TableConfig | null = null;
  private sockets = new Map<WebSocket, Session>();
  private players = new Map<string, Player>(); // keyed by lowercase address

  private stage: Stage = 'waiting';
  private handNumber = 0;
  private deck: Card[] = [];
  private community: Card[] = [];
  private buttonSeat = -1;
  private actingSeat: number | null = null;
  private actionDeadline: number | null = null;
  private currentBet = 0;
  /** Size of the last full bet/raise — the minimum legal raise increment. */
  private minRaise = 0;

  private chatLog: ChatMessage[] = [];
  private actionTimer: ReturnType<typeof setTimeout> | null = null;
  private nextHandTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    // Restore table config after an eviction so links keep working.
    this.state.blockConcurrencyWhile(async () => {
      this.config = (await this.state.storage.get<TableConfig>('config')) ?? null;
    });
  }

  /* ------------------------------------------------------------------ */
  /*  HTTP entry points (routed here by src/index.ts)                    */
  /* ------------------------------------------------------------------ */

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // One-time initialization when the table is created via the lobby API.
    if (url.pathname.endsWith('/init') && request.method === 'POST') {
      const cfg = (await request.json()) as TableConfig;
      this.config = cfg;
      await this.state.storage.put('config', cfg);
      return Response.json({ ok: true });
    }

    if (!this.config) return Response.json({ error: 'table not found' }, { status: 404 });

    // Read-only snapshot for the lobby / SEO-less previews.
    if (url.pathname.endsWith('/state')) {
      return Response.json(this.buildView(null));
    }

    // WebSocket upgrade. The router has already verified the wallet
    // signature; identity arrives via query params.
    if (url.pathname.endsWith('/ws')) {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('expected websocket', { status: 426 });
      }
      const address = (url.searchParams.get('address') ?? '').toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(address)) {
        return new Response('bad address', { status: 400 });
      }
      const session: Session = {
        address,
        ensName: url.searchParams.get('name') || null,
        avatar: url.searchParams.get('avatar') || null,
      };
      const pair = new WebSocketPair();
      this.acceptSocket(pair[1], session);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    return new Response('not found', { status: 404 });
  }

  private acceptSocket(ws: WebSocket, session: Session) {
    ws.accept();

    // One live socket per address: kick the previous one (e.g. refresh).
    for (const [sock, s] of this.sockets) {
      if (s.address === session.address) {
        try { sock.close(4000, 'replaced by new connection'); } catch { /* noop */ }
        this.sockets.delete(sock);
      }
    }
    this.sockets.set(ws, session);

    const player = this.players.get(session.address);
    if (player) {
      player.connected = true;
      player.ensName = session.ensName ?? player.ensName;
      player.avatar = session.avatar ?? player.avatar;
    }

    ws.addEventListener('message', (evt) => {
      this.onMessage(ws, session, evt).catch((err) => {
        this.send(ws, { type: 'error', error: `internal: ${String(err)}` });
      });
    });
    const drop = () => this.onDisconnect(ws, session);
    ws.addEventListener('close', drop);
    ws.addEventListener('error', drop);

    // Greet with chat history + current state.
    for (const message of this.chatLog.slice(-30)) this.send(ws, { type: 'chat', message });
    this.send(ws, { type: 'state', state: this.buildView(session.address) });
  }

  /* ------------------------------------------------------------------ */
  /*  Message handling                                                   */
  /* ------------------------------------------------------------------ */

  private async onMessage(ws: WebSocket, session: Session, evt: MessageEvent) {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(evt.data as string);
    } catch {
      return this.send(ws, { type: 'error', error: 'invalid JSON' });
    }

    switch (msg.type) {
      case 'ping':
        return this.send(ws, { type: 'pong' });
      case 'sit':
        return this.handleSit(ws, session, msg.seat);
      case 'leave':
        return this.handleLeave(session.address);
      case 'action':
        return this.handleAction(ws, session.address, msg.action, msg.amount);
      case 'chat': {
        const text = String(msg.text ?? '').slice(0, 280).trim();
        if (!text) return;
        const message: ChatMessage = {
          address: session.address, ensName: session.ensName, text, ts: Date.now(),
        };
        this.chatLog.push(message);
        if (this.chatLog.length > 100) this.chatLog.shift();
        for (const sock of this.sockets.keys()) this.send(sock, { type: 'chat', message });
        return;
      }
    }
  }

  private onDisconnect(ws: WebSocket, session: Session) {
    if (this.sockets.get(ws) !== session) return; // stale socket already replaced
    this.sockets.delete(ws);
    const player = this.players.get(session.address);
    if (!player) return;
    player.connected = false;
    if (!player.inHand || this.stage === 'waiting' || this.stage === 'showdown') {
      // Not in a live hand — cash them out immediately.
      void this.handleLeave(session.address);
    }
    // Otherwise they stay seated; the action timer will auto-fold them and
    // they are cashed out at the end of the hand (see finishHand()).
    this.broadcast();
  }

  /* ------------------------------------------------------------------ */
  /*  Seating & bankroll (Cloudflare D1)                                 */
  /* ------------------------------------------------------------------ */

  private get bigBlind() { return this.config!.smallBlind * 2; }
  private get buyIn() { return this.bigBlind * BUYIN_BB; }
  /** Seats at this table (creator-chosen on private tables). */
  private get maxSeats() { return this.config?.maxPlayers ?? MAX_PLAYERS; }
  /**
   * Players needed for a hand. Public tables keep the 4-player product
   * rule; private tables start once the (smaller) table fills up to its
   * size — down to heads-up for a 2-seat game between friends.
   */
  private get minToStart() {
    return this.config?.isPrivate ? Math.min(MIN_PLAYERS, this.maxSeats) : MIN_PLAYERS;
  }

  /** Whitelist check — public tables admit everyone. */
  private isAllowedToSit(address: string): boolean {
    if (!this.config?.isPrivate) return true;
    return (this.config.whitelist ?? []).some((w) => w.address === address);
  }

  private async handleSit(ws: WebSocket, session: Session, seat: number) {
    if (!Number.isInteger(seat) || seat < 0 || seat >= this.maxSeats) {
      return this.send(ws, { type: 'error', error: 'invalid seat' });
    }
    if (!this.isAllowedToSit(session.address)) {
      return this.send(ws, {
        type: 'error',
        error: 'This is a private table — only players on the guest list can sit.',
      });
    }
    if (this.players.has(session.address)) {
      return this.send(ws, { type: 'error', error: 'already seated' });
    }
    if ([...this.players.values()].some((p) => p.seat === seat)) {
      return this.send(ws, { type: 'error', error: 'seat taken' });
    }
    if (this.players.size >= this.maxSeats) {
      return this.send(ws, { type: 'error', error: 'table full' });
    }

    // Debit the buy-in from the player's persistent bankroll in D1.
    // New wallets are auto-provisioned with the starting bankroll.
    const db = this.env.DB;
    await db.prepare(
      `INSERT INTO players (address, ens_name, created_at) VALUES (?, ?, ?)
       ON CONFLICT(address) DO UPDATE SET ens_name = COALESCE(excluded.ens_name, players.ens_name)`,
    ).bind(session.address, session.ensName, Date.now()).run();

    const debit = await db.prepare(
      'UPDATE players SET bankroll = bankroll - ? WHERE address = ? AND bankroll >= ?',
    ).bind(this.buyIn, session.address, this.buyIn).run();
    if (!debit.meta.changes) {
      return this.send(ws, {
        type: 'error',
        error: `Not enough chips for the ${this.buyIn.toLocaleString()} buy-in — claim your daily chips from your profile.`,
      });
    }

    this.players.set(session.address, {
      seat,
      address: session.address,
      ensName: session.ensName,
      avatar: session.avatar,
      stack: this.buyIn,
      streetBet: 0,
      committed: 0,
      folded: false,
      allIn: false,
      inHand: false,
      holeCards: [],
      acted: false,
      connected: true,
    });

    // Someone sat down — cancel any pending empty-table close.
    await this.state.storage.deleteAlarm().catch(() => { /* noop */ });
    await this.syncLobbyCount();
    this.broadcast();
    this.maybeStartHand();
  }

  private async handleLeave(address: string) {
    const player = this.players.get(address);
    if (!player) return;

    if (player.inHand && this.stage !== 'waiting' && this.stage !== 'showdown') {
      // Leaving mid-hand forfeits the hand: fold now, cash out after.
      if (!player.folded) this.applyFold(player);
      player.connected = false;
      this.broadcast();
      this.afterAction();
      return;
    }

    this.players.delete(address);
    // Return remaining stack to the persistent bankroll; net profit is the
    // difference vs. every buy-in, tracked per-hand in finishHand().
    await this.env.DB.prepare('UPDATE players SET bankroll = bankroll + ? WHERE address = ?')
      .bind(player.stack, address).run().catch(() => { /* stats are best-effort */ });

    if (this.players.size === 0) {
      // Last player gone — close the table after a grace window (so a quick
      // refresh or re-sit doesn't kill it). A DO alarm survives eviction,
      // unlike setTimeout.
      await this.state.storage.setAlarm(Date.now() + EMPTY_TABLE_CLOSE_MS)
        .catch(() => { /* best-effort */ });
    }

    await this.syncLobbyCount();
    this.broadcast();
  }

  /** Alarm = the empty-table grace window elapsed. Close the table for good. */
  async alarm() {
    if (!this.config || this.players.size > 0) return;
    await this.env.DB.prepare('DELETE FROM tables WHERE id = ?')
      .bind(this.config.id).run().catch(() => { /* re-swept by the lobby */ });
    // Tell any remaining spectators, then close without triggering the
    // client's auto-reconnect (it skips reconnection on code 4000).
    for (const sock of this.sockets.keys()) {
      this.send(sock, { type: 'error', error: 'Table closed — everyone left.' });
      try { sock.close(4000, 'table closed'); } catch { /* noop */ }
    }
    this.sockets.clear();
    await this.state.storage.deleteAll();
    this.config = null;
  }

  /** Keep the lobby's seat count fresh for the table list. */
  private async syncLobbyCount() {
    // Private tables are unlisted — never (re-)register them in the lobby.
    if (!this.config || this.config.isPrivate) return;
    // Upsert (not update) so a table swept from the lobby while momentarily
    // empty re-registers itself if players come back before the alarm fires.
    await this.env.DB.prepare(
      `INSERT INTO tables (id, name, small_blind, seats, status, created_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET seats = excluded.seats, status = excluded.status`,
    ).bind(
      this.config.id, this.config.name, this.config.smallBlind,
      this.players.size, this.stage === 'waiting' ? 'waiting' : 'playing', Date.now(),
    ).run().catch(() => { /* best-effort */ });
  }

  /* ------------------------------------------------------------------ */
  /*  Hand lifecycle                                                     */
  /* ------------------------------------------------------------------ */

  /** Seats currently occupied, in clockwise order. */
  private seatedPlayers(): Player[] {
    return [...this.players.values()].sort((a, b) => a.seat - b.seat);
  }

  private maybeStartHand() {
    if (this.stage !== 'waiting' || this.nextHandTimer) return;
    const ready = this.seatedPlayers().filter((p) => p.stack > 0);
    // PRODUCT RULE: public hands only start with 4+ seated players.
    // Private tables start once their (possibly smaller) size is met.
    if (ready.length < this.minToStart) return;
    this.nextHandTimer = setTimeout(() => {
      this.nextHandTimer = null;
      this.startHand();
    }, 3000);
  }

  private startHand() {
    const ready = this.seatedPlayers().filter((p) => p.stack > 0);
    if (ready.length < this.minToStart || this.stage !== 'waiting') {
      this.broadcast();
      return;
    }

    this.handNumber++;
    this.stage = 'preflop';
    this.community = [];
    this.deck = shuffle(freshDeck());
    this.currentBet = 0;
    this.minRaise = this.bigBlind;

    for (const p of this.players.values()) {
      const playing = p.stack > 0;
      p.inHand = playing;
      p.folded = false;
      p.allIn = false;
      p.streetBet = 0;
      p.committed = 0;
      p.acted = false;
      p.holeCards = [];
    }

    // Advance the dealer button to the next occupied seat.
    this.buttonSeat = this.nextSeat(this.buttonSeat, ready)!.seat;

    // Post blinds (short stacks post all-in for less).
    const sb = this.nextSeat(this.buttonSeat, ready)!;
    const bb = this.nextSeat(sb.seat, ready)!;
    this.commit(sb, Math.min(this.config!.smallBlind, sb.stack));
    this.commit(bb, Math.min(this.bigBlind, bb.stack));
    this.currentBet = this.bigBlind;

    // Two hole cards each, starting left of the button.
    for (let round = 0; round < 2; round++) {
      let p = this.nextSeat(this.buttonSeat, ready)!;
      for (let i = 0; i < ready.length; i++) {
        p.holeCards.push(this.deck.pop()!);
        p = this.nextSeat(p.seat, ready)!;
      }
    }

    void this.syncLobbyCount();
    // First to act pre-flop: left of the big blind (UTG).
    this.setActing(this.nextActiveSeat(bb.seat));
    this.broadcast();
  }

  /** Next occupied seat clockwise after `seat` within `pool`. */
  private nextSeat(seat: number, pool: Player[]): Player | null {
    if (pool.length === 0) return null;
    const sorted = [...pool].sort((a, b) => a.seat - b.seat);
    return sorted.find((p) => p.seat > seat) ?? sorted[0];
  }

  /** Next player still able to act (in hand, not folded, not all-in). */
  private nextActiveSeat(after: number): number | null {
    const active = this.seatedPlayers().filter((p) => p.inHand && !p.folded && !p.allIn);
    const next = this.nextSeat(after, active);
    return next ? next.seat : null;
  }

  private playerAtSeat(seat: number): Player | undefined {
    return [...this.players.values()].find((p) => p.seat === seat);
  }

  /** Move chips from a player's stack into the pot. */
  private commit(p: Player, chips: number) {
    const amount = Math.min(chips, p.stack);
    p.stack -= amount;
    p.streetBet += amount;
    p.committed += amount;
    if (p.stack === 0) p.allIn = true;
  }

  /* ------------------------------------------------------------------ */
  /*  Betting                                                            */
  /* ------------------------------------------------------------------ */

  private setActing(seat: number | null) {
    if (this.actionTimer) { clearTimeout(this.actionTimer); this.actionTimer = null; }
    this.actingSeat = seat;
    if (seat === null) { this.actionDeadline = null; return; }
    this.actionDeadline = Date.now() + ACTION_SECONDS * 1000;
    // Auto-act on timeout: check when free, otherwise fold. Keeps games
    // moving when someone disconnects or falls asleep.
    this.actionTimer = setTimeout(() => {
      const p = this.playerAtSeat(seat);
      if (!p || this.actingSeat !== seat) return;
      const canCheck = p.streetBet === this.currentBet;
      this.performAction(p, canCheck ? 'check' : 'fold', undefined, true);
    }, ACTION_SECONDS * 1000);
  }

  private handleAction(ws: WebSocket, address: string, action: string, amount?: number) {
    const p = this.players.get(address);
    if (!p || !p.inHand || p.folded || p.allIn) {
      return this.send(ws, { type: 'error', error: 'not in hand' });
    }
    if (this.actingSeat !== p.seat) {
      return this.send(ws, { type: 'error', error: 'not your turn' });
    }
    const err = this.performAction(p, action, amount, false);
    if (err) this.send(ws, { type: 'error', error: err });
  }

  /**
   * Validate and apply a betting action. Returns an error string for
   * illegal actions (nothing is mutated in that case).
   * `amount` for bet/raise is the TOTAL street bet to raise TO.
   */
  private performAction(p: Player, action: string, amount: number | undefined, forced: boolean): string | null {
    const toCall = this.currentBet - p.streetBet;

    switch (action) {
      case 'fold':
        this.applyFold(p);
        break;

      case 'check':
        if (toCall > 0) return 'cannot check facing a bet';
        p.acted = true;
        break;

      case 'call': {
        if (toCall <= 0) { p.acted = true; break; } // nothing to call → check
        this.commit(p, toCall); // commit() caps at stack (call all-in for less)
        p.acted = true;
        break;
      }

      case 'allin':
      case 'bet':
      case 'raise': {
        const target = action === 'allin' ? p.streetBet + p.stack : Math.floor(amount ?? 0);
        const chips = target - p.streetBet;
        if (!Number.isFinite(target) || chips <= 0) return 'invalid amount';
        if (chips > p.stack) return 'not enough chips';

        const isAllIn = chips === p.stack;
        if (target <= this.currentBet) {
          // Only legal as an all-in for less than a call/raise.
          if (!isAllIn) return 'must exceed current bet';
          this.commit(p, chips);
          p.acted = true;
          break;
        }

        const minTarget = this.currentBet + this.minRaise;
        if (target < minTarget && !isAllIn) {
          return `minimum ${this.currentBet === 0 ? 'bet' : 'raise to'} is ${minTarget}`;
        }

        const isFullRaise = target >= minTarget;
        this.commit(p, chips);
        if (isFullRaise) {
          // A full raise reopens the action for everyone else.
          this.minRaise = target - this.currentBet;
          for (const other of this.players.values()) {
            if (other !== p && other.inHand && !other.folded && !other.allIn) other.acted = false;
          }
        }
        // A short all-in raise does NOT reopen action (standard rule),
        // so other players' `acted` flags are left untouched.
        this.currentBet = target;
        p.acted = true;
        break;
      }

      default:
        return 'unknown action';
    }

    if (!forced) this.pokeSound(); // (reserved hook — sounds are client-side)
    this.afterAction();
    return null;
  }

  private applyFold(p: Player) {
    p.folded = true;
    p.acted = true;
  }

  private pokeSound() { /* intentionally empty — clients derive sounds from state diffs */ }

  /** After every action: detect hand/street completion and move the turn. */
  private afterAction() {
    const live = this.seatedPlayers().filter((p) => p.inHand && !p.folded);

    // Everyone folded to one player → uncontested pot, no showdown.
    if (live.length === 1) {
      this.finishHand([{ ...this.contributorFor(live[0]), score: 1 }], true);
      return;
    }

    const canAct = live.filter((p) => !p.allIn);
    const streetDone = canAct.every((p) => p.acted && p.streetBet === this.currentBet);

    if (!streetDone) {
      this.setActing(this.nextActiveSeat(this.actingSeat ?? this.buttonSeat));
      this.broadcast();
      return;
    }

    // Street complete — reset per-street state and deal the next card(s).
    for (const p of this.players.values()) { p.streetBet = 0; p.acted = false; }
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    this.setActing(null);

    // If betting can no longer happen (≤1 player with chips), run the
    // board out to the river and go straight to showdown.
    const bettingPossible = canAct.length >= 2;
    this.dealNextStreet();

    if (this.stage === 'showdown') return; // dealNextStreet reached showdown

    if (!bettingPossible) {
      this.broadcast();
      // Reveal remaining streets with a short pause for drama.
      const timer = setInterval(() => {
        this.dealNextStreet();
        this.broadcast();
        if (this.stage === 'showdown') clearInterval(timer);
      }, 1500);
      return;
    }

    // Post-flop action starts left of the button.
    this.setActing(this.nextActiveSeat(this.buttonSeat));
    this.broadcast();
  }

  /** Advance flop → turn → river → showdown, dealing community cards. */
  private dealNextStreet() {
    if (this.stage === 'preflop') {
      this.stage = 'flop';
      this.deck.pop(); // burn card (tradition — cosmetic with a CSPRNG shuffle)
      this.community.push(this.deck.pop()!, this.deck.pop()!, this.deck.pop()!);
    } else if (this.stage === 'flop') {
      this.stage = 'turn';
      this.deck.pop();
      this.community.push(this.deck.pop()!);
    } else if (this.stage === 'turn') {
      this.stage = 'river';
      this.deck.pop();
      this.community.push(this.deck.pop()!);
    } else if (this.stage === 'river') {
      this.showdown();
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Showdown & payouts                                                 */
  /* ------------------------------------------------------------------ */

  private contributorFor(p: Player): Contributor {
    return { seat: p.seat, committed: p.committed, folded: p.folded };
  }

  private showdown() {
    this.stage = 'showdown';
    const contributors: Contributor[] = [];
    for (const p of this.players.values()) {
      if (!p.inHand) continue;
      const c = this.contributorFor(p);
      if (!p.folded) c.score = evaluate7([...p.holeCards, ...this.community]).score;
      contributors.push(c);
    }
    this.finishHand(contributors, false);
  }

  /**
   * Pay out pots, persist stats to D1 and schedule the next hand.
   * `uncontested` skips card reveals (winner mucks).
   */
  private finishHand(contributors: Contributor[], uncontested: boolean) {
    this.setActing(null);
    this.stage = 'showdown';

    const shares = settlePots(contributors);
    const winners: HandResultShare[] = [];
    const revealed = new Map<number, Card[]>();

    for (const share of shares) {
      const p = this.playerAtSeat(share.seat)!;
      p.stack += share.amount;
      const hand = uncontested ? null : evaluate7([...p.holeCards, ...this.community]);
      winners.push({
        seat: p.seat, address: p.address, ensName: p.ensName,
        amount: share.amount, handName: hand?.name ?? null,
        cards: uncontested ? undefined : p.holeCards,
      });
    }
    if (!uncontested) {
      // At showdown every unfolded player reveals.
      for (const p of this.players.values()) {
        if (p.inHand && !p.folded) revealed.set(p.seat, p.holeCards);
      }
    }

    void this.persistHandStats(shares);

    // Broadcast the result, revealing showdown hands on the final state.
    const board = [...this.community];
    for (const [sock] of this.sockets) {
      this.send(sock, { type: 'handResult', winners, board });
    }
    this.broadcastWithReveals(revealed);

    this.nextHandTimer = setTimeout(() => {
      this.nextHandTimer = null;
      void this.cleanupBetweenHands();
    }, INTERHAND_MS);
  }

  /** Update leaderboard stats in D1 — best-effort, never blocks gameplay. */
  private async persistHandStats(shares: { seat: number; amount: number }[]) {
    try {
      const potTotal = shares.reduce((s, x) => s + x.amount, 0);
      const stmts = [];
      for (const p of this.players.values()) {
        if (!p.inHand) continue;
        const won = shares.find((s) => s.seat === p.seat)?.amount ?? 0;
        const delta = won - p.committed;
        stmts.push(
          this.env.DB.prepare(
            `UPDATE players SET
               net_profit = net_profit + ?,
               hands_played = hands_played + 1,
               hands_won = hands_won + ?,
               biggest_pot = MAX(biggest_pot, ?)
             WHERE address = ?`,
          ).bind(delta, won > 0 ? 1 : 0, won > 0 ? potTotal : 0, p.address),
        );
      }
      if (stmts.length) await this.env.DB.batch(stmts);
    } catch { /* leaderboard is best-effort */ }
  }

  /** Between hands: cash out busted/disconnected players, then restart. */
  private async cleanupBetweenHands() {
    this.stage = 'waiting';
    this.community = [];
    this.currentBet = 0;
    for (const p of [...this.players.values()]) {
      p.inHand = false;
      p.holeCards = [];
      p.streetBet = 0;
      p.committed = 0;
      p.folded = false;
      p.allIn = false;
      if (!p.connected || p.stack === 0) await this.handleLeave(p.address);
    }
    this.broadcast();
    this.maybeStartHand();
  }

  /* ------------------------------------------------------------------ */
  /*  State broadcasting (sanitized per player)                          */
  /* ------------------------------------------------------------------ */

  private buildView(forAddress: string | null, reveals?: Map<number, Card[]>): TableView {
    const cfg = this.config!;
    const me = forAddress ? this.players.get(forAddress) : undefined;
    const seats: SeatView[] = this.seatedPlayers().map((p) => ({
      seat: p.seat,
      address: p.address,
      ensName: p.ensName,
      avatar: p.avatar,
      stack: p.stack,
      bet: p.streetBet,
      folded: p.folded,
      allIn: p.allIn,
      connected: p.connected,
      acting: this.actingSeat === p.seat,
      isButton: this.buttonSeat === p.seat,
      shownCards: reveals?.get(p.seat),
    }));
    const pot = [...this.players.values()].reduce((s, p) => s + p.committed, 0);
    const readyCount = this.seatedPlayers().filter((p) => p.stack > 0).length;
    return {
      id: cfg.id,
      name: cfg.name,
      smallBlind: cfg.smallBlind,
      bigBlind: this.bigBlind,
      buyIn: this.buyIn,
      minPlayers: this.minToStart,
      maxPlayers: this.maxSeats,
      stage: this.stage,
      handNumber: this.handNumber,
      community: this.community,
      pot,
      currentBet: this.currentBet,
      minRaiseTo: this.currentBet + this.minRaise,
      seats,
      holeCards: me?.inHand ? me.holeCards : [],
      yourSeat: me ? me.seat : null,
      actionDeadline: this.actionDeadline,
      waitingFor: this.stage === 'waiting' ? Math.max(0, this.minToStart - readyCount) : 0,
      isPrivate: !!cfg.isPrivate,
      canSit: forAddress ? this.isAllowedToSit(forAddress) : !cfg.isPrivate,
      whitelist: cfg.isPrivate ? cfg.whitelist : undefined,
    };
  }

  private broadcast() { this.broadcastWithReveals(undefined); }

  private broadcastWithReveals(reveals?: Map<number, Card[]>) {
    for (const [sock, session] of this.sockets) {
      this.send(sock, { type: 'state', state: this.buildView(session.address, reveals) });
    }
  }

  private send(ws: WebSocket, msg: ServerMessage) {
    try { ws.send(JSON.stringify(msg)); } catch { /* socket already closed */ }
  }
}
