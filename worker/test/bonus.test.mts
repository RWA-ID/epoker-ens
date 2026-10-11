/**
 * HoodFi bonuses (src/bonus.ts) against REAL SQLite (node:sqlite), wrapped to
 * look like D1 — "pays once" lives in the SQL, so a fake would prove nothing.
 * Chain reads are not exercised here; only the week math and the ledger.
 *
 *   npm run test:bonus
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { payBonus, bonusStatus, weekKey, nextWeekAt, isDirectHoodfiName } from '../src/bonus';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
}

function sqliteD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE players (address TEXT PRIMARY KEY, bankroll INTEGER NOT NULL DEFAULT 10000, created_at INTEGER NOT NULL)`);
  db.exec(readFileSync('migrations/006_bonus_claims.sql', 'utf8'));
  const prepare = (sql: string) => {
    let args: any[] = [];
    const stmt = {
      bind(...a: any[]) { args = a; return stmt; },
      async first() { return db.prepare(sql).get(...args) ?? null; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
      async run() { return { meta: { changes: Number(db.prepare(sql).run(...args).changes) } }; },
      _run() { return { meta: { changes: Number(db.prepare(sql).run(...args).changes) } }; },
    };
    return stmt;
  };
  return {
    raw: db,
    prepare,
    // D1 batch = one transaction.
    async batch(stmts: any[]) {
      db.exec('BEGIN');
      try { const out = stmts.map((s) => s._run()); db.exec('COMMIT'); return out; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}

const bankroll = (env: any, a: string) => Number((env.DB.raw.prepare('SELECT bankroll FROM players WHERE address = ?').get(a) as any)?.bankroll ?? 0);
const A = '0x' + 'a'.repeat(40);
const B = '0x' + 'b'.repeat(40);

// Week math. 2026-10-16 is a Friday.
const at = (iso: string) => Date.parse(iso);
check('week: Friday 00:00 AST opens a new week', weekKey(at('2026-10-16T04:00:00Z')) === '2026-10-16');
check('week: one minute before is still last week', weekKey(at('2026-10-16T03:59:00Z')) === '2026-10-09');
check('week: Thursday night AST belongs to the week before', weekKey(at('2026-10-23T03:00:00Z')) === '2026-10-16');
check('week: today (Sat Oct 10) is the Oct 9 week', weekKey(at('2026-10-10T19:00:00Z')) === '2026-10-09');
check('week: next opens Friday 00:00 AST', nextWeekAt(at('2026-10-10T19:00:00Z')) === at('2026-10-16T04:00:00Z'));

check('names: a direct name counts', isDirectHoodfiName('safe.hoodfi.eth'));
check('names: a subname does not', !isDirectHoodfiName('nft.gm.hoodfi.eth'));
check('names: another parent does not', !isDirectHoodfiName('safe.eth'));

{
  const env: any = { DB: sqliteD1() };
  check('weekly: first claim pays', await payBonus(env, A, 'hoodfi-weekly', '2026-10-09', 'safe.hoodfi.eth', 50_000));
  check('weekly: bankroll created at 10,000 then +50,000', bankroll(env, A) === 60_000, String(bankroll(env, A)));
  check('weekly: same wallet, other name, same week — refused', !(await payBonus(env, A, 'hoodfi-weekly', '2026-10-09', 'trust.hoodfi.eth', 50_000)));
  check('weekly: same name, other wallet, same week — refused', !(await payBonus(env, B, 'hoodfi-weekly', '2026-10-09', 'safe.hoodfi.eth', 50_000)));
  check('weekly: refusals credited nothing', bankroll(env, A) === 60_000 && bankroll(env, B) === 10_000);
  check('weekly: other wallet, other name — pays', await payBonus(env, B, 'hoodfi-weekly', '2026-10-09', 'trust.hoodfi.eth', 50_000));
  check('weekly: next week pays again', await payBonus(env, A, 'hoodfi-weekly', '2026-10-16', 'safe.hoodfi.eth', 50_000));

  check('widget: pays once', await payBonus(env, A, 'widget', 'once', null, 100_000));
  check('widget: never twice', !(await payBonus(env, A, 'widget', 'once', null, 100_000)));
  check('widget: a null name never blocks another wallet', await payBonus(env, B, 'widget', 'once', null, 100_000));
  check('ledger: A = 10k + 2×50k + 100k', bankroll(env, A) === 210_000, String(bankroll(env, A)));

  const s = await bonusStatus(env, A, at('2026-10-10T19:00:00Z'));
  check('status: week + widget both claimed', s.weekly.claimed && s.widget.claimed && s.weekly.week === '2026-10-09');
  const s2 = await bonusStatus(env, '0x' + 'c'.repeat(40), at('2026-10-10T19:00:00Z'));
  check('status: a stranger has claimed nothing', !s2.weekly.claimed && !s2.widget.claimed);
}

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
