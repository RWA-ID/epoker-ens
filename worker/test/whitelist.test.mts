/**
 * House Pass whitelist (src/whitelist.ts) against REAL SQLite (node:sqlite),
 * wrapped to look like D1 — the limit and the no-repeat rule live in the SQL,
 * so a string-matching fake would prove nothing.
 *
 *   npm run test:whitelist
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import {
  joinWhitelist, whitelistStatus, parseHandle, parseWallet, OWN_HANDLE,
  WHITELIST_CAP, WAITLIST, SIGNUP_LIMIT, type HolderCheck,
} from '../src/whitelist';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
}

/** The slice of D1 the module uses, over a real SQLite database. */
function sqliteD1() {
  const db = new DatabaseSync(':memory:');
  // npm runs this from worker/; the bundle itself lives in node_modules/.cache.
  db.exec(readFileSync('migrations/003_whitelist.sql', 'utf8'));
  db.exec(readFileSync('migrations/004_whitelist_x_handle.sql', 'utf8'));
  return {
    raw: db,
    prepare(sql: string) {
      let args: any[] = [];
      const stmt = {
        bind(...a: any[]) { args = a; return stmt; },
        async first() { return db.prepare(sql).get(...args) ?? null; },
        async run() { return { meta: { changes: Number(db.prepare(sql).run(...args).changes) } }; },
      };
      return stmt;
    },
  };
}

const addr = (n: number) => `0x${n.toString(16).padStart(40, '0')}`;
const xh = (n: number) => `player_${n}`;
const notHolder = async (): Promise<HolderCheck> => 'not-holder';
const seed = (env: any, n: number, offset = 1000) => {
  const insert = env.DB.raw.prepare('INSERT INTO whitelist (address, created_at) VALUES (?, ?)');
  for (let i = 0; i < n; i++) insert.run(addr(offset + i), i);
};

check('sizes: 2,222 spots + 1,111 waitlist = 3,333 sign-ups', WHITELIST_CAP === 2222 && WAITLIST === 1111 && SIGNUP_LIMIT === 3333);

{
  const env: any = { DB: sqliteD1(), WHITELIST_OPEN: '1' };
  const a = await joinWhitelist(env, addr(1), xh(1), notHolder);
  check('join: a new wallet signs up at position 1', a.ok && !a.already && a.position === 1 && a.count === 1, JSON.stringify(a));
  const again = await joinWhitelist(env, addr(1), xh(1), notHolder);
  check('join: the same wallet again is "already", same position, no second row', again.ok && again.already && again.position === 1 && again.count === 1, JSON.stringify(again));

  const s = await whitelistStatus(env, addr(1));
  check('status: joined + position + live count', s.joined === true && s.position === 1 && s.count === 1 && s.cap === WHITELIST_CAP && s.waitlist === WAITLIST && s.open);
  check('status: a stranger is not joined and has no position', (await whitelistStatus(env, addr(2))).joined === false && (await whitelistStatus(env, addr(2))).position === undefined);

  const h = await joinWhitelist(env, addr(3), xh(3), async () => 'holder');
  check('join: a CCFF00 holder CAN sign up, and is told so', h.ok && !h.already && h.holdsCcff00 === true && h.position === 2, JSON.stringify(h));
  const u = await joinWhitelist(env, addr(4), xh(4), async () => 'unavailable');
  check('join: an unreachable chain still lets them in (hint is just null)', u.ok && u.holdsCcff00 === null);

  let rpcCalls = 0;
  await joinWhitelist(env, addr(1), xh(1), async () => { rpcCalls++; return 'holder'; });
  check('join: an existing member never costs an RPC call', rpcCalls === 0);
}

{
  const env: any = { DB: sqliteD1(), WHITELIST_OPEN: '1' };
  await joinWhitelist(env, addr(1), xh(1), notHolder);
  env.WHITELIST_OPEN = '0';
  const c = await joinWhitelist(env, addr(2), xh(2), notHolder);
  check('closed: a new wallet is refused', !c.ok && c.reason === 'closed');
  const m = await joinWhitelist(env, addr(1), xh(1), notHolder);
  check('closed: an existing member still gets their position', m.ok && m.already && m.position === 1);
  env.WHITELIST_OPEN = undefined;
  check('closed: a missing flag means closed', !(await whitelistStatus(env)).open);
}

{
  const env: any = { DB: sqliteD1(), WHITELIST_OPEN: '1' };
  seed(env, WHITELIST_CAP);
  const w = await joinWhitelist(env, addr(1), xh(1), notHolder);
  check('waitlist: sign-up #2,223 is accepted, past the cap', w.ok && w.position === WHITELIST_CAP + 1, JSON.stringify(w));
}

{
  const env: any = { DB: sqliteD1(), WHITELIST_OPEN: '1' };
  seed(env, SIGNUP_LIMIT - 1);
  check('limit: seeded to one below 3,333', (await whitelistStatus(env)).count === SIGNUP_LIMIT - 1);

  // Two wallets pass every pre-check together, then race the last place.
  const [x, y] = await Promise.all([joinWhitelist(env, addr(1), xh(1), notHolder), joinWhitelist(env, addr(2), xh(2), notHolder)]);
  check('limit: two wallets racing the last place — exactly one gets it', [x, y].filter((r) => r.ok).length === 1, JSON.stringify([x, y]));
  check('limit: the loser is told "full"', [x, y].some((r) => !r.ok && r.reason === 'full'));
  check('limit: the count stops at 3,333', (await whitelistStatus(env)).count === SIGNUP_LIMIT);
  const late = await joinWhitelist(env, addr(3), xh(3), notHolder);
  check('limit: a full list refuses', !late.ok && late.reason === 'full');
}

{
  const env: any = { DB: sqliteD1(), WHITELIST_OPEN: '1' };
  const both = await Promise.all([joinWhitelist(env, addr(7), xh(7), notHolder), joinWhitelist(env, addr(7), xh(7), notHolder)]);
  check('repeat: one wallet in two tabs at once — both told "in", one row', both.every((r) => r.ok) && (await whitelistStatus(env)).count === 1, JSON.stringify(both));
}

{
  // Same millisecond: order falls back to address, matching the snapshot's ORDER BY.
  const env: any = { DB: sqliteD1(), WHITELIST_OPEN: '1' };
  const insert = env.DB.raw.prepare('INSERT INTO whitelist (address, created_at) VALUES (?, ?)');
  insert.run(addr(9), 5); insert.run(addr(8), 5); insert.run(addr(1), 4);
  const p = await Promise.all([addr(1), addr(8), addr(9)].map((a) => whitelistStatus(env, a)));
  check('order: (created_at, address) — positions 1, 2, 3', p.map((s) => s.position).join() === '1,2,3', p.map((s) => s.position).join());
}

{
  // v2: one spot per X handle.
  const env: any = { DB: sqliteD1(), WHITELIST_OPEN: '1' };
  await joinWhitelist(env, addr(1), 'alice', notHolder);
  const dup = await joinWhitelist(env, addr(2), 'alice', notHolder);
  check('handle: a second wallet under the same handle is refused', !dup.ok && dup.reason === 'handle-taken' && dup.count === 1, JSON.stringify(dup));
  const race = await Promise.all([joinWhitelist(env, addr(3), 'bob', notHolder), joinWhitelist(env, addr(4), 'bob', notHolder)]);
  check('handle: two wallets racing one handle — exactly one row', race.filter((r) => r.ok).length === 1 && race.some((r) => !r.ok && r.reason === 'handle-taken'), JSON.stringify(race));
  const back = await joinWhitelist(env, addr(1), 'someone_else', notHolder);
  check('handle: a joined wallet sending a new handle just gets its position back', back.ok && back.already && back.position === 1);
}

{
  // Rows from before v2 have no handle, and must coexist.
  const env: any = { DB: sqliteD1(), WHITELIST_OPEN: '1' };
  const insert = env.DB.raw.prepare('INSERT INTO whitelist (address, created_at) VALUES (?, ?)');
  insert.run(addr(50), 1); insert.run(addr(51), 2);
  const j = await joinWhitelist(env, addr(52), 'carol', notHolder);
  check('legacy: NULL-handle rows keep their places; a new sign-up queues behind them', j.ok && j.position === 3 && j.count === 3, JSON.stringify(j));
  env.DB.raw.prepare('DELETE FROM whitelist WHERE address = ?').run(addr(50));
  check('count: the trigger keeps the stored count exact across a delete', (await whitelistStatus(env)).count === 2);
}

{
  const ok = (raw: string, want: string | null) => {
    const got = parseHandle(raw);
    check(`parseHandle(${JSON.stringify(raw)}) = ${want}`, got === want, String(got));
  };
  ok('@Alice_01', 'alice_01');
  ok('alice', 'alice');
  ok('https://x.com/Alice/status/2106784743563923583?s=46', 'alice');
  ok('x.com/alice', 'alice');
  ok('https://twitter.com/alice/status/1', 'alice');
  ok('https://mobile.twitter.com/alice', 'alice');
  ok(`https://x.com/${OWN_HANDLE}/status/2106784743563923583?s=46`, OWN_HANDLE);
  ok('https://x.com/i/status/123', null);
  ok('https://x.com/home', null);
  ok('this_handle_is_too_long', null);
  ok('has space', null);
  ok('', null);
  check('parseWallet: mixed case is lowercased', parseWallet(' 0xABCDEF0123456789abcdef0123456789ABCDEF01 ') === '0xabcdef0123456789abcdef0123456789abcdef01');
  check('parseWallet: an ENS name or short hex is refused', parseWallet('alice.eth') === null && parseWallet('0x1234') === null);
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
