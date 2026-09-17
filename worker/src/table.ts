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
  ChatMessage, HandResultShare, WhitelistEntry, HandLogEntry,
  MIN_PLAYERS, MAX_PLAYERS, ACTION_SECONDS, INTERHAND_MS, BUYIN_BB,
  PRACTICE_TABLE_ID, DISCONNECT_GRACE_MS,
} from './poker/types';
import { BOT_NAMES, decideBotAction } from './poker/bot';
import { freshDeck, shuffle } from './poker/deck';
import { evaluate7 } from './poker/evaluator';
import { settlePots, Contributor } from './poker/pots';
import type { Env } from './env';
import { sanitizeChat } from './chat';
import { cleanAvatar, verifyHandle, type VerifiedHandle } from './handle';

/** How long a table may sit empty before it is closed and delisted. */
const EMPTY_TABLE_CLOSE_MS = 60_000;

/** Sockets per table (players + spectators). Past this, new upgrades get a 503. */
const MAX_SOCKETS = 150;
/** Largest client frame worth parsing; every legal message is far smaller. */
const MAX_FRAME_BYTES = 1024;
/**
 * Per-socket rate limits, on the real clock. Exported so the simulation test
 * (which compresses timers 200x) can relax them.
 */
export const SOCKET_LIMITS = {
  /** Any message. A client this chatty is broken or hostile → closed. */
  flood: { max: 40, windowMs: 5_000 },
  /** Chat lines. Over it the line is dropped with a notice. */
  chat: { max: 5, windowMs: 10_000 },
};
/** Hand log lines kept in memory and replayed to a new connection. */
const LOG_KEEP = 80;
const LOG_REPLAY = 40;

/** Seat order bots take on the practice table — spread around the felt. */
const BOT_SEAT_ORDER = [4, 2, 6, 0, 8, 3, 5, 1, 7];

interface Player {
  seat: number;
  address: string; // lowercase 0x…
  handle: string | null;
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
  /** House bot — practice table only; never touches D1. */
  bot?: boolean;
  /** Left (or timed out) mid-hand: cashed out once the hand ends. */
  leaving?: boolean;
}

interface Session {
  address: string;
  handle: string | null;
  avatar: string | null;
  /** Recent message / chat timestamps, for the per-socket rate limits. */
  msgTimes?: number[];
  chatTimes?: number[];
}

/** Sliding-window limiter: records `now` and says whether it fits. */
function allow(times: number[], limit: { max: number; windowMs: number }, now: number): boolean {
  while (times.length && now - times[0] > limit.windowMs) times.shift();
  if (times.length >= limit.max) return false;
  times.push(now);
  return true;
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
  /** Practice table: bots fill seats, free stacks, nothing persisted. */
  practice?: boolean;
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
  private handLog: HandLogEntry[] = [];
  private actionTimer: ReturnType<typeof setTimeout> | null = null;
  private nextHandTimer: ReturnType<typeof setTimeout> | null = null;
  private botTimer: ReturnType<typeof setTimeout> | null = null;
  /** Dropped players still holding their seat, by address. */
  private graceTimers = new Map<string, ReturnType<typeof setTimeout>>();

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

    // The practice table has no creator — the router calls this before every
    // request to it, so it (re)initializes itself after being closed.
    if (url.pathname.endsWith('/ensure-practice') && request.method === 'POST') {
      if (!this.config) {
        this.config = {
          id: PRACTICE_TABLE_ID, name: 'Practice Table', smallBlind: 10, practice: true,
        };
        await this.state.storage.put('config', this.config);
      }
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
      if (this.sockets.size >= MAX_SOCKETS) {
        return new Response('table is at capacity', { status: 503 });
      }
      // Set by the router from the verified session token — not client input.
      const address = (url.searchParams.get('address') ?? '').toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(address)) {
        return new Response('bad address', { status: 400 });
      }
      // The signature proves the wallet, not the name. A hoodfi handle is
      // checked against the registry before anyone sits down under it;
      // an unverified claim simply falls back to the address.
      //
      // The result is cached in D1 so this costs one eth_call the first time a
      // player uses a name, not one on every table join — the public Robinhood
      // RPC throttles Workers, and a throttled read would otherwise silently
      // demote a legitimate player to a raw address.
      //
      // The avatar comes back from that same check, read on-chain for the
      // verified name. A client-sent `avatar` param is ignored.
      const claimed = url.searchParams.get('name');
      const verified = claimed ? await this.resolveHandle(address, claimed) : null;
      const session: Session = {
        address,
        handle: verified?.handle ?? null,
        avatar: verified?.avatar ?? null,
      };
      const pair = new WebSocketPair();
      this.acceptSocket(pair[1], session);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    return new Response('not found', { status: 404 });
  }

  /**
   * Verify a claimed handle, reusing a recent successful verification.
   *
   * Re-verification matters: names are transferable, so a cached pass has a
   * TTL rather than being permanent.
   */
  private async resolveHandle(address: string, claimed: string): Promise<VerifiedHandle | null> {
    const name = claimed.trim().toLowerCase();
    if (!name) return null;

    const TTL = 6 * 3600 * 1000;
    try {
      const row = await this.env.DB.prepare(
        'SELECT handle, avatar, handle_checked AS checked FROM players WHERE address = ?',
      ).bind(address).first<{ handle: string | null; avatar: string | null; checked: number | null }>();

      if (
        row?.handle === name &&
        typeof row.checked === 'number' &&
        Date.now() - row.checked < TTL
      ) {
        return { handle: name, avatar: cleanAvatar(row.avatar) };
      }
    } catch {
      // Cache miss or pre-migration schema — fall through to the live check.
    }

    const verified = await verifyHandle(address, name, { mainnet: this.env.MAINNET_RPC });
    if (verified) {
      await this.env.DB.prepare(
        `INSERT INTO players (address, handle, avatar, handle_checked, created_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(address) DO UPDATE SET handle = excluded.handle, avatar = excluded.avatar,
           handle_checked = excluded.handle_checked`,
      ).bind(address, verified.handle, verified.avatar, Date.now(), Date.now())
        .run().catch(() => { /* best-effort */ });
    }
    return verified;
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
      this.clearGrace(session.address);
      player.connected = true;
      player.handle = session.handle ?? player.handle;
      player.avatar = session.handle ? session.avatar : player.avatar;
    }

    ws.addEventListener('message', (evt) => {
      this.onMessage(ws, session, evt).catch((err) => {
        this.send(ws, { type: 'error', error: `internal: ${String(err)}` });
      });
    });
    const drop = () => this.onDisconnect(ws, session);
    ws.addEventListener('close', drop);
    ws.addEventListener('error', drop);

    // Greet with chat history, the recent hand log and current state.
    for (const message of this.chatLog.slice(-30)) this.send(ws, { type: 'chat', message });
    for (const entry of this.handLog.slice(-LOG_REPLAY)) this.send(ws, { type: 'log', entry });
    if (player) {
      // A returning player un-greys for everyone, and may be the one the
      // next hand was waiting on.
      this.broadcast();
      this.maybeStartHand();
    } else {
      this.send(ws, { type: 'state', state: this.buildView(session.address) });
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Message handling                                                   */
  /* ------------------------------------------------------------------ */

  private async onMessage(ws: WebSocket, session: Session, evt: MessageEvent) {
    const now = Date.now();
    if (!allow((session.msgTimes ??= []), SOCKET_LIMITS.flood, now)) {
      try { ws.close(1008, 'rate limited'); } catch { /* noop */ }
      return;
    }
    if (typeof evt.data !== 'string' || evt.data.length > MAX_FRAME_BYTES) {
      return this.send(ws, { type: 'error', error: 'message too large' });
    }
    let msg: ClientMessage;
    try {
      msg = JSON.parse(evt.data);
    } catch {
      return this.send(ws, { type: 'error', error: 'invalid JSON' });
    }
    if (!msg || typeof msg !== 'object') return;

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
        // Open to everyone connected — seated players and spectators alike —
        // so the server is the authority on what may be said. Plain text
        // only: links are stripped here, not just hidden in the client.
        const text = sanitizeChat(msg.text);
        if (!text) return;
        if (!allow((session.chatTimes ??= []), SOCKET_LIMITS.chat, now)) {
          return this.send(ws, { type: 'error', error: 'Slow down — too many messages.' });
        }
        const message: ChatMessage = {
          address: session.address, handle: session.handle, text, ts: Date.now(),
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
    // Phones drop the socket whenever the browser is backgrounded — switching
    // to a wallet app, a notification, another tab. Hold the seat for a grace
    // window instead of cashing out on the spot; a reconnect cancels it.
    // Meanwhile they're dealt out of new hands, and in a live hand the action
    // timer checks/folds for them.
    //
    // The window stays under the ~70s a Durable Object may sit idle before
    // eviction, which would lose the in-memory stacks.
    this.clearGrace(session.address);
    this.graceTimers.set(session.address, setTimeout(() => {
      this.graceTimers.delete(session.address);
      if (this.players.get(session.address)?.connected === false) {
        void this.handleLeave(session.address);
      }
    }, DISCONNECT_GRACE_MS));
    this.broadcast();
  }

  private clearGrace(address: string) {
    const t = this.graceTimers.get(address);
    if (t) clearTimeout(t);
    this.graceTimers.delete(address);
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
    if (this.config?.practice) return MIN_PLAYERS;
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

    // Practice stacks are free — the bankroll is never touched.
    if (!this.config!.practice && !(await this.debitBuyIn(ws, session))) return;

    // The socket can close (or the seat fill) while D1 was answering. Seating
    // them anyway leaves a "connected" player with no connection, who is then
    // never cleaned up — refund and bail instead.
    const gone = this.sockets.get(ws) !== session;
    if (gone || this.players.has(session.address) || this.playerAtSeat(seat)) {
      if (!this.config!.practice) {
        await this.env.DB.prepare('UPDATE players SET bankroll = bankroll + ? WHERE address = ?')
          .bind(this.buyIn, session.address).run().catch(() => { /* best-effort */ });
      }
      if (!gone) this.send(ws, { type: 'error', error: 'seat taken' });
      return;
    }

    this.players.set(session.address, {
      seat,
      address: session.address,
      handle: session.handle,
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
    this.rebalanceBots();
    await this.syncLobbyCount();
    this.broadcast();
    this.maybeStartHand();
  }

  /** Debit the buy-in from the player's persistent bankroll in D1. */
  private async debitBuyIn(ws: WebSocket, session: Session): Promise<boolean> {
    // New wallets are auto-provisioned with the starting bankroll.
    const db = this.env.DB;
    await db.prepare(
      `INSERT INTO players (address, handle, avatar, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(address) DO UPDATE SET
         handle = COALESCE(excluded.handle, players.handle),
         avatar = COALESCE(excluded.avatar, players.avatar)`,
    ).bind(session.address, session.handle, session.avatar, Date.now()).run();

    const debit = await db.prepare(
      'UPDATE players SET bankroll = bankroll - ? WHERE address = ? AND bankroll >= ?',
    ).bind(this.buyIn, session.address, this.buyIn).run();
    if (!debit.meta.changes) {
      this.send(ws, {
        type: 'error',
        error: `Not enough chips for the ${this.buyIn.toLocaleString()} buy-in — claim your daily chips from your profile.`,
      });
      return false;
    }
    return true;
  }

  private async handleLeave(address: string) {
    const player = this.players.get(address);
    if (!player) return;
    this.clearGrace(address);

    if (player.inHand && this.stage !== 'waiting' && this.stage !== 'showdown') {
      // Leaving mid-hand forfeits the hand: fold now, cash out after.
      player.leaving = true;
      if (!player.folded) {
        const wasActing = this.actingSeat === player.seat;
        this.applyFold(player);
        this.log(player, 'leaves · folds');
        // Only move the turn if it was theirs — afterAction() hands the turn
        // to the next seat, which would skip whoever is actually deciding.
        if (wasActing) { this.afterAction(); return; }
        const live = this.seatedPlayers().filter((p) => p.inHand && !p.folded);
        if (live.length === 1) { this.afterAction(); return; }
      }
      this.broadcast();
      return;
    }

    this.players.delete(address);
    // Return remaining stack to the persistent bankroll; net profit is the
    // difference vs. every buy-in, tracked per-hand in finishHand().
    if (!this.config?.practice && !player.bot) {
      await this.env.DB.prepare('UPDATE players SET bankroll = bankroll + ? WHERE address = ?')
        .bind(player.stack, address).run().catch(() => { /* stats are best-effort */ });
    }
    this.rebalanceBots();

    if (this.humanCount() === 0) {
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
    if (!this.config || this.humanCount() > 0) return;
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
      this.humanCount(), this.stage === 'waiting' ? 'waiting' : 'playing', Date.now(),
    ).run().catch(() => { /* best-effort */ });
  }

  /* ------------------------------------------------------------------ */
  /*  Hand lifecycle                                                     */
  /* ------------------------------------------------------------------ */

  /** Seats currently occupied, in clockwise order. */
  private seatedPlayers(): Player[] {
    return [...this.players.values()].sort((a, b) => a.seat - b.seat);
  }

  /** Players who get dealt in: chips, a live connection, not on their way out. */
  private readyPlayers(): Player[] {
    return this.seatedPlayers().filter((p) => p.stack > 0 && p.connected && !p.leaving);
  }

  /** A hand needs enough ready players — and at the practice table, a human. */
  private canStart(): boolean {
    const ready = this.readyPlayers();
    if (ready.length < this.minToStart) return false;
    return !this.config?.practice || ready.some((p) => !p.bot);
  }

  private humanCount(): number {
    let n = 0;
    for (const p of this.players.values()) if (!p.bot) n++;
    return n;
  }

  /**
   * Practice table: keep enough bots seated that a lone player gets a game,
   * and step them aside as humans arrive. Only between hands — a bot never
   * vanishes mid-hand. A player who dropped but is still inside the grace
   * window counts as present, so bots don't churn while someone switches apps.
   */
  private rebalanceBots() {
    if (!this.config?.practice || this.stage !== 'waiting') return;
    const humans = this.humanCount();
    const bots = this.seatedPlayers().filter((p) => p.bot);
    const want = humans === 0 ? 0 : Math.max(0, MIN_PLAYERS - humans);

    for (const bot of bots.slice(want)) this.players.delete(bot.address);
    for (const bot of bots.slice(0, want)) {
      if (bot.stack < this.bigBlind) bot.stack = this.buyIn; // house rebuy
    }

    for (let i = bots.length; i < want; i++) {
      const taken = new Set([...this.players.values()].map((p) => p.seat));
      const seat = BOT_SEAT_ORDER.find((s) => s < this.maxSeats && !taken.has(s));
      if (seat === undefined) return;
      const names = new Set([...this.players.values()].map((p) => p.handle));
      const name = BOT_NAMES.find((n) => !names.has(n)) ?? `Bot ${seat + 1}`;
      this.players.set(`bot:${seat}`, {
        seat,
        address: `bot:${seat}`,
        handle: name,
        avatar: null,
        stack: this.buyIn,
        streetBet: 0,
        committed: 0,
        folded: false,
        allIn: false,
        inHand: false,
        holeCards: [],
        acted: false,
        connected: true,
        bot: true,
      });
    }
  }

  private maybeStartHand() {
    if (this.stage !== 'waiting' || this.nextHandTimer) return;
    // PRODUCT RULE: public hands only start with 4+ seated players.
    // Private tables start once their (possibly smaller) size is met.
    if (!this.canStart()) return;
    this.nextHandTimer = setTimeout(() => {
      this.nextHandTimer = null;
      this.startHand();
    }, 3000);
  }

  private startHand() {
    const ready = this.readyPlayers();
    if (!this.canStart() || this.stage !== 'waiting') {
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
      const playing = ready.includes(p);
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
    this.log(null, `Hand #${this.handNumber}`);
    this.commit(sb, Math.min(this.config!.smallBlind, sb.stack));
    this.log(sb, 'posts SB', sb.streetBet);
    this.commit(bb, Math.min(this.bigBlind, bb.stack));
    this.log(bb, 'posts BB', bb.streetBet);
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
    if (this.botTimer) { clearTimeout(this.botTimer); this.botTimer = null; }
    this.actingSeat = seat;
    if (seat === null) { this.actionDeadline = null; return; }
    this.actionDeadline = Date.now() + ACTION_SECONDS * 1000;
    if (this.playerAtSeat(seat)?.bot) {
      // A short, human-ish think before acting.
      this.botTimer = setTimeout(() => this.botAct(seat), 900 + Math.random() * 1400);
    }
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
    const betBefore = this.currentBet;
    let line = '';

    switch (action) {
      case 'fold':
        this.applyFold(p);
        line = 'folds';
        break;

      case 'check':
        if (toCall > 0) return 'cannot check facing a bet';
        p.acted = true;
        line = 'checks';
        break;

      case 'call': {
        if (toCall <= 0) { p.acted = true; line = 'checks'; break; } // nothing to call → check
        this.commit(p, toCall); // commit() caps at stack (call all-in for less)
        p.acted = true;
        line = p.allIn ? 'calls all-in' : 'calls';
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
          line = 'all-in';
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
        line = isAllIn ? 'all-in' : betBefore === 0 ? 'bets' : 'raises to';
        break;
      }

      default:
        return 'unknown action';
    }

    const shown = line === 'folds' || line === 'checks' ? null : p.streetBet;
    this.log(p, forced ? `times out · ${line}` : line, shown);

    if (!forced) this.pokeSound(); // (reserved hook — sounds are client-side)
    this.afterAction();
    return null;
  }

  private botAct(seat: number) {
    this.botTimer = null;
    const p = this.playerAtSeat(seat);
    if (!p?.bot || this.actingSeat !== seat || !p.inHand || p.folded || p.allIn) return;
    const decision = decideBotAction({
      hole: p.holeCards,
      board: this.community,
      stack: p.stack,
      streetBet: p.streetBet,
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      pot: [...this.players.values()].reduce((s, x) => s + x.committed, 0),
      bigBlind: this.bigBlind,
      opponents: this.seatedPlayers().filter((x) => x !== p && x.inHand && !x.folded).length,
    });
    // The table is the authority: an illegal pick falls back to check/fold.
    if (this.performAction(p, decision.action, decision.amount, false)) {
      this.performAction(p, p.streetBet === this.currentBet ? 'check' : 'fold', undefined, true);
    }
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
      this.log(null, 'Flop', null, this.community.slice(0, 3));
    } else if (this.stage === 'flop') {
      this.stage = 'turn';
      this.deck.pop();
      this.community.push(this.deck.pop()!);
      this.log(null, 'Turn', null, this.community.slice(3, 4));
    } else if (this.stage === 'turn') {
      this.stage = 'river';
      this.deck.pop();
      this.community.push(this.deck.pop()!);
      this.log(null, 'River', null, this.community.slice(4, 5));
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
        seat: p.seat, address: p.address, handle: p.handle,
        amount: share.amount, handName: hand?.name ?? null,
        cards: uncontested ? undefined : p.holeCards,
      });
      this.log(p, hand ? `wins with ${hand.name}` : 'wins', share.amount, uncontested ? undefined : p.holeCards);
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
    if (this.config?.practice) return; // practice hands never reach the leaderboard
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
      if (p.bot) continue; // rebalanceBots() rebuys or retires them
      if (this.config?.practice && p.stack === 0 && !p.leaving) {
        p.stack = this.buyIn; // practice chips are free — top up instead of busting out
        continue;
      }
      if (p.leaving || p.stack === 0) await this.handleLeave(p.address);
    }
    this.rebalanceBots();
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
      handle: p.handle,
      avatar: p.avatar,
      stack: p.stack,
      bet: p.streetBet,
      folded: p.folded,
      allIn: p.allIn,
      connected: p.connected,
      acting: this.actingSeat === p.seat,
      isButton: this.buttonSeat === p.seat,
      bot: p.bot || undefined,
      shownCards: reveals?.get(p.seat),
    }));
    const pot = [...this.players.values()].reduce((s, p) => s + p.committed, 0);
    const readyCount = this.readyPlayers().length;
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
      // Clamped to what THIS player can actually put in. A short stack can't
      // reach the table's min raise; its only legal aggression is all-in, and
      // performAction() accepts that target as a raise-for-less. Unclamped,
      // a client that offers `minRaiseTo` as its min-raise button sends an
      // amount the server then rejects as 'not enough chips'.
      minRaiseTo: me
        ? Math.min(this.currentBet + this.minRaise, me.streetBet + me.stack)
        : this.currentBet + this.minRaise,
      seats,
      holeCards: me?.inHand ? me.holeCards : [],
      yourSeat: me ? me.seat : null,
      actionDeadline: this.actionDeadline,
      waitingFor: this.stage === 'waiting' ? Math.max(0, this.minToStart - readyCount) : 0,
      isPrivate: !!cfg.isPrivate,
      canSit: forAddress ? this.isAllowedToSit(forAddress) : !cfg.isPrivate,
      whitelist: cfg.isPrivate ? cfg.whitelist : undefined,
      practice: !!cfg.practice,
    };
  }

  /** Append a hand-log line and push it to everyone watching. */
  private log(p: Player | null, text: string, amount: number | null = null, cards?: Card[]) {
    const entry: HandLogEntry = {
      hand: this.handNumber,
      address: p?.address ?? null,
      handle: p?.handle ?? null,
      text,
      amount,
      cards,
      ts: Date.now(),
    };
    this.handLog.push(entry);
    if (this.handLog.length > LOG_KEEP) this.handLog.shift();
    for (const sock of this.sockets.keys()) this.send(sock, { type: 'log', entry });
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
