/**
 * House Pass whitelist (src/whitelist.ts) against REAL SQLite (node:sqlite),
 * wrapped to look like D1 — the cap and the no-repeat rule live in the SQL, so
 * a string-matching fake would prove nothing.
 *
 *   npm run test:whitelist
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { joinWhitelist, whitelistStatus, WHITELIST_CAP, type HolderCheck } from '../src/whitelist';

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
const notHolder = async (): Promise<HolderCheck> => 'not-holder';

{
  const env: any = { DB: sqliteD1(), WHITELIST_OPEN: '1' };
  const a = await joinWhitelist(env, addr(1), notHolder);
  check('join: a new wallet gets a spot', a.ok && !a.already && a.count === 1, JSON.stringify(a));
  const again = await joinWhitelist(env, addr(1), notHolder);
  check('join: the same wallet again is "already", not a second spot', again.ok && again.already && again.count === 1, JSON.stringify(again));

  const s = await whitelistStatus(env, addr(1));
  check('status: joined + live count', s.joined === true && s.count === 1 && s.cap === WHITELIST_CAP && s.open);
  check('status: a stranger is not joined', (await whitelistStatus(env, addr(2))).joined === false);

  const h = await joinWhitelist(env, addr(3), async () => 'holder');
  check('join: a CCFF00 holder is refused', !h.ok && h.reason === 'ccff00');
  const u = await joinWhitelist(env, addr(4), async () => 'unavailable');
  check('join: an unreachable chain refuses (never lets a holder slip in)', !u.ok && u.reason === 'unavailable');
  check('join: refused wallets were not written', (await whitelistStatus(env)).count === 1);

  let rpcCalls = 0;
  const counting = async (): Promise<HolderCheck> => { rpcCalls++; return 'holder'; };
  await joinWhitelist(env, addr(1), counting);
  check('join: an existing member never costs an RPC call', rpcCalls === 0);
}

{
  const env: any = { DB: sqliteD1(), WHITELIST_OPEN: '1' };
  await joinWhitelist(env, addr(1), notHolder);
  env.WHITELIST_OPEN = '0';
  const c = await joinWhitelist(env, addr(2), notHolder);
  check('closed: a new wallet is refused', !c.ok && c.reason === 'closed');
  const m = await joinWhitelist(env, addr(1), notHolder);
  check('closed: an existing member still sees "you\'re in"', m.ok && m.already);
  env.WHITELIST_OPEN = undefined;
  check('closed: a missing flag means closed', !(await whitelistStatus(env)).open);
}

{
  const env: any = { DB: sqliteD1(), WHITELIST_OPEN: '1' };
  const insert = env.DB.raw.prepare('INSERT INTO whitelist (address, created_at) VALUES (?, 0)');
  for (let i = 0; i < WHITELIST_CAP - 1; i++) insert.run(addr(1000 + i));
  check('cap: seeded to one below the cap', (await whitelistStatus(env)).count === WHITELIST_CAP - 1);

  // Two wallets pass every pre-check together, then race the last spot. A slow
  // chain check makes sure both are past the count check before either inserts.
  const slow = async (): Promise<HolderCheck> => { await new Promise((r) => setTimeout(r, 20)); return 'not-holder'; };
  const [x, y] = await Promise.all([joinWhitelist(env, addr(1), slow), joinWhitelist(env, addr(2), slow)]);
  const winners = [x, y].filter((r) => r.ok).length;
  check('cap: two wallets racing the last spot — exactly one gets it', winners === 1, JSON.stringify([x, y]));
  check('cap: the loser is told "full"', [x, y].some((r) => !r.ok && r.reason === 'full'));
  check('cap: the count stops at the cap', (await whitelistStatus(env)).count === WHITELIST_CAP);

  const late = await joinWhitelist(env, addr(3), notHolder);
  check('cap: a full list refuses before calling the chain', !late.ok && late.reason === 'full');
}

{
  const env: any = { DB: sqliteD1(), WHITELIST_OPEN: '1' };
  const slow = async (): Promise<HolderCheck> => { await new Promise((r) => setTimeout(r, 20)); return 'not-holder'; };
  const both = await Promise.all([joinWhitelist(env, addr(7), slow), joinWhitelist(env, addr(7), slow)]);
  check('repeat: one wallet in two tabs at once — both told "in", one row', both.every((r) => r.ok) && (await whitelistStatus(env)).count === 1, JSON.stringify(both));
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
