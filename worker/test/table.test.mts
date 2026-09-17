/**
 * TableDO simulation: the real Durable Object class against fake sockets, a
 * fake D1 and compressed timers (every setTimeout runs 200x faster).
 *
 *   npm run test:table
 */
import { TableDO, SOCKET_LIMITS } from '../src/table';
import { DISCONNECT_GRACE_MS, BUYIN_BB } from '../src/poker/types';

const SPEED = 200;
// The bots below fire an action every 2ms of REAL time; the flood guard would
// (rightly) cut them off. Limits get their own test at the end.
const realLimits = structuredClone(SOCKET_LIMITS);
SOCKET_LIMITS.flood.max = Infinity;
SOCKET_LIMITS.chat.max = Infinity;
const realSetTimeout = globalThis.setTimeout;
const realSetInterval = globalThis.setInterval;
(globalThis as any).setTimeout = (fn: () => void, ms = 0) => realSetTimeout(fn, ms / SPEED);
(globalThis as any).setInterval = (fn: () => void, ms = 0) => realSetInterval(fn, ms / SPEED);
const wait = (ms: number) => new Promise((r) => realSetTimeout(r, ms / SPEED));

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
}

/* ---------------- fakes ---------------- */

function fakeDb() {
  const bankroll = new Map<string, number>();
  const statRows: string[] = [];
  const db = {
    bankroll,
    statRows,
    prepare(sql: string) {
      let args: unknown[] = [];
      const stmt = {
        bind(...a: unknown[]) { args = a; return stmt; },
        async run() {
          if (sql.includes('bankroll = bankroll - ?')) {
            const [amt, addr] = args as [number, string];
            const have = bankroll.get(addr) ?? 20_000;
            if (have < amt) return { meta: { changes: 0 } };
            bankroll.set(addr, have - amt);
          } else if (sql.includes('bankroll = bankroll + ?')) {
            const [amt, addr] = args as [number, string];
            bankroll.set(addr, (bankroll.get(addr) ?? 20_000) + amt);
          } else if (sql.includes('hands_played')) {
            statRows.push(String(args[3]));
          }
          return { meta: { changes: 1 } };
        },
        async first() { return null; },
        async all() { return { results: [] }; },
      };
      return stmt;
    },
    async batch(stmts: { run(): Promise<unknown> }[]) { for (const s of stmts) await s.run(); },
  };
  return db;
}

function fakeState() {
  const store = new Map<string, unknown>();
  let alarm: number | null = null;
  return {
    get alarm() { return alarm; },
    blockConcurrencyWhile: (fn: () => Promise<void>) => fn(),
    storage: {
      get: async (k: string) => store.get(k),
      put: async (k: string, v: unknown) => { store.set(k, v); },
      setAlarm: async (t: number) => { alarm = t; },
      deleteAlarm: async () => { alarm = null; },
      deleteAll: async () => { store.clear(); },
    },
  };
}

type Listener = (evt: any) => void;
class FakeSocket {
  sent: any[] = [];
  listeners = new Map<string, Listener[]>();
  closed = false;
  accept() {}
  send(data: string) { if (!this.closed) this.sent.push(JSON.parse(data)); }
  close() { this.closed = true; }
  addEventListener(type: string, fn: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  /** The client going away (phone backgrounded). */
  drop() { this.closed = true; for (const fn of this.listeners.get('close') ?? []) fn({}); }
  lastState() { return [...this.sent].reverse().find((m) => m.type === 'state')?.state; }
  errors() { return this.sent.filter((m) => m.type === 'error').map((m) => m.error); }
}

async function makeTable(config: object) {
  const state = fakeState();
  const db = fakeDb();
  const table: any = new TableDO(state as any, { DB: db, TABLES: null } as any);
  await table.fetch(new Request('https://do/init', { method: 'POST', body: JSON.stringify(config) }));
  return { table, state, db };
}

function connect(table: any, address: string) {
  const ws = new FakeSocket();
  table.acceptSocket(ws, { address, handle: null, avatar: null });
  return ws;
}

const send = (ws: FakeSocket, msg: object) =>
  ws.listeners.get('message')![0]({ data: JSON.stringify(msg) });

const addr = (n: number) => `0x${String(n).repeat(40).slice(0, 40)}`;

/** A human who plays whenever it is their turn. */
function autoPlay(ws: FakeSocket, pick: (s: any) => object) {
  let stop = false;
  const tick = () => {
    if (stop) return;
    const s = ws.lastState();
    const me = s?.seats.find((x: any) => x.seat === s.yourSeat);
    if (me?.acting) send(ws, { type: 'action', ...pick(s) });
    realSetTimeout(tick, 2);
  };
  tick();
  return () => { stop = true; };
}

/* ---------------- 1. practice table: a lone player gets a game ---------------- */
{
  const { table, db } = await makeTable({ id: 'practice', name: 'Practice Table', smallBlind: 10, practice: true });
  const buyIn = 20 * BUYIN_BB;
  const me = addr(1);
  const ws = connect(table, me);
  send(ws, { type: 'sit', seat: 0 });
  await wait(10);

  let s = ws.lastState();
  check('practice: 3 bots join a lone player', s.seats.filter((x: any) => x.bot).length === 3);
  check('practice: flagged in the view', s.practice === true);
  check('practice: bankroll untouched on sit', !db.bankroll.has(me));

  const actions = ['call', 'check', 'fold', 'raise', 'allin'];
  let i = 0;
  const stop = autoPlay(ws, (st) => {
    const a = actions[i++ % actions.length];
    return a === 'raise' ? { action: 'raise', amount: st.minRaiseTo } : { action: a };
  });

  const handsBefore = ws.lastState().handNumber;
  await wait(400_000); // ~2s real
  stop();
  s = ws.lastState();
  check('practice: hands keep being dealt', s.handNumber - handsBefore >= 8, `only ${s.handNumber - handsBefore} hands`);
  const badErrors = ws.errors().filter((e) => !/not your turn|cannot check|minimum|must exceed/.test(e));
  check('practice: no unexpected errors', badErrors.length === 0, badErrors.join(' | '));
  check('practice: nothing written to the leaderboard', db.statRows.length === 0);

  // Chips are conserved at every waiting state: 4 stacks, no pot outstanding.
  const players = [...table.players.values()];
  check('practice: every stack is non-negative', players.every((p: any) => p.stack >= 0));

  // A second human arrives: one bot steps aside between hands.
  const ws2 = connect(table, addr(2));
  const free = [0, 1, 2, 3, 4, 5, 6, 7, 8].find((n) => !ws2.lastState().seats.some((x: any) => x.seat === n));
  send(ws2, { type: 'sit', seat: free });
  const stop1 = autoPlay(ws, () => ({ action: 'fold' }));
  const stop2 = autoPlay(ws2, () => ({ action: 'fold' }));
  await wait(40_000);
  s = ws.lastState();
  check('practice: a bot steps aside for a second human', s.seats.filter((x: any) => x.bot).length === 2,
    `${s.seats.filter((x: any) => x.bot).length} bots`);

  // Both humans leave: bots go too, and the empty-table close is armed.
  stop1(); stop2();
  send(ws, { type: 'leave' });
  send(ws2, { type: 'leave' });
  await wait(40_000);
  check('practice: bots leave with the last human', table.players.size === 0, `${table.players.size} seated`);
  ws.drop(); ws2.drop();
}

/* ---------------- 2. a dropped socket keeps its seat for the grace window ---------------- */
{
  const { table, db } = await makeTable({ id: 't1', name: 'Public', smallBlind: 10 });
  const [a, b, c] = [addr(1), addr(2), addr(3)];
  const wsA = connect(table, a);
  const wsB = connect(table, b);
  const wsC = connect(table, c);
  send(wsA, { type: 'sit', seat: 0 });
  send(wsB, { type: 'sit', seat: 1 });
  send(wsC, { type: 'sit', seat: 2 });
  await wait(10);
  check('grace: three players seated', table.players.size === 3);

  wsA.drop(); // switching to another wallet app
  await wait(DISCONNECT_GRACE_MS / 2);
  check('grace: dropped player still seated mid-window', table.players.has(a));
  check('grace: shown as disconnected', wsB.lastState().seats.find((x: any) => x.address === a)?.connected === false);

  const wsA2 = connect(table, a); // back from the wallet app
  await wait(DISCONNECT_GRACE_MS);
  check('grace: reconnect cancels the cash-out', table.players.has(a));
  check('grace: reconnected socket sees its seat', wsA2.lastState().yourSeat === 0);

  wsB.drop();
  await wait(DISCONNECT_GRACE_MS * 1.5);
  check('grace: gone after the window expires', !table.players.has(b));
  check('grace: stack returned to bankroll', db.bankroll.get(b) === 20_000, String(db.bankroll.get(b)));
}

/* ---------------- 3. a disconnected player isn't dealt into new hands ---------------- */
{
  const { table } = await makeTable({ id: 't2', name: 'Public', smallBlind: 10 });
  const sockets = [1, 2, 3].map((n) => connect(table, addr(n)));
  sockets.forEach((ws, i) => send(ws, { type: 'sit', seat: i }));
  // Seat #4 sits, then drops before the deal.
  const ws4 = connect(table, addr(4));
  send(ws4, { type: 'sit', seat: 3 });
  await wait(1);
  ws4.drop();
  await wait(5000);
  check('deal: no hand with a dropped 4th player', table.stage === 'waiting', table.stage);
  connect(table, addr(4));
  await wait(5000);
  check('deal: hand starts once they return', table.stage === 'preflop', table.stage);
}

/* ---------------- 3b. a socket that closes while its sit is in flight ---------------- */
{
  const { table, db } = await makeTable({ id: 't2b', name: 'Public', smallBlind: 10 });
  const ws = connect(table, addr(7));
  send(ws, { type: 'sit', seat: 0 }); // awaiting D1…
  ws.drop();                           // …when the phone backgrounds
  await wait(10);
  check('race: no ghost seat for a closed socket', table.players.size === 0, `${table.players.size} seated`);
  check('race: buy-in refunded', db.bankroll.get(addr(7)) === 20_000, String(db.bankroll.get(addr(7))));
}

/* ---------------- 4. leaving out of turn doesn't skip the player who is deciding ---------------- */
{
  const { table } = await makeTable({ id: 't3', name: 'Public', smallBlind: 10 });
  const sockets = [1, 2, 3, 4, 5].map((n) => connect(table, addr(n)));
  sockets.forEach((ws, i) => send(ws, { type: 'sit', seat: i }));
  await wait(5000);
  const acting = table.actingSeat;
  const other = [0, 1, 2, 3, 4].find((n) => n !== acting && table.playerAtSeat(n).inHand)!;
  send(sockets[other], { type: 'leave' });
  check('leave: turn stays with the acting player', table.actingSeat === acting, `${acting} -> ${table.actingSeat}`);
  check('leave: leaver is folded', table.playerAtSeat(other).folded === true);
}

/* ---------------- 5. hand log ---------------- */
{
  const { table } = await makeTable({ id: 't4', name: 'Public', smallBlind: 10 });
  const sockets = [1, 2, 3, 4].map((n) => connect(table, addr(n)));
  sockets.forEach((ws, i) => send(ws, { type: 'sit', seat: i }));
  await wait(5000);
  const acting = table.actingSeat;
  send(sockets[acting], { type: 'action', action: 'fold' });
  const lines = sockets[0].sent.filter((m) => m.type === 'log').map((m) => m.entry);
  check('log: new hand line', lines.some((l) => l.address === null && /^Hand #1$/.test(l.text)));
  check('log: blinds posted with amounts',
    lines.some((l) => l.text === 'posts SB' && l.amount === 10) && lines.some((l) => l.text === 'posts BB' && l.amount === 20));
  check('log: the fold is recorded', lines.some((l) => l.text === 'folds' && l.address === addr(acting + 1)));
  const late = connect(table, addr(9));
  check('log: replayed to a new connection', late.sent.filter((m) => m.type === 'log').length === lines.length);
  check('log: no hole cards in any line', lines.every((l) => l.cards === undefined));
}

/* ---------------- 6. per-socket limits ---------------- */
{
  Object.assign(SOCKET_LIMITS.flood, realLimits.flood);
  Object.assign(SOCKET_LIMITS.chat, realLimits.chat);
  const { table } = await makeTable({ id: 't5', name: 'Public', smallBlind: 10 });
  const ws = connect(table, addr(1));
  for (let i = 0; i < 8; i++) send(ws, { type: 'chat', text: `hello ${i}` });
  await wait(0);
  const chats = ws.sent.filter((m) => m.type === 'chat').length;
  check('limits: chat capped per window', chats === realLimits.chat.max, `${chats} delivered`);
  check('limits: sender told to slow down', ws.errors().some((e) => /slow down/i.test(e)));

  send(ws, { type: 'chat', text: 'x'.repeat(5000) });
  await wait(0);
  check('limits: oversized frame refused', ws.errors().includes('message too large'));

  const spam = connect(table, addr(2));
  for (let i = 0; i < realLimits.flood.max + 5; i++) send(spam, { type: 'ping' });
  await wait(0);
  check('limits: flooding socket is closed', spam.closed === true);
}

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
