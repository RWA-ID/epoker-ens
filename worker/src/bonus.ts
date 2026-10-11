/**
 * HoodFi bonuses — for name owners, pass or no pass.
 *
 *   hoodfi-weekly  50,000 chips once per week to a wallet that owns a direct
 *                  hoodfi.eth name (`label.hoodfi.eth`). Weeks open Friday
 *                  00:00 AST (UTC-4). Keyed by wallet AND by name, so one name
 *                  handed between wallets pays once a week, not once per wallet.
 *                  Subnames don't count: a name owner can mint those for free.
 *   widget         100,000 chips, once per wallet, for registering a name
 *                  through the HoodPoker widget — proven by the router's
 *                  PartnerRegistration log with our partner address and this
 *                  wallet as buyer, never by anything the client says.
 *
 * Both answer in three states like src/handle.ts: a throttled RPC is
 * `unavailable` (try again), never a "no".
 *
 * Paying is one D1 batch (a transaction): credit the bankroll only if no claim
 * row exists, then write the row. Two racing requests serialize; one pays.
 */
import { createPublicClient, http, parseAbiItem } from 'viem';
import type { Env } from './env';
import { ownsHoodfiName } from './handle';

export const HOODFI_WEEKLY_CHIPS = 50_000;
export const WIDGET_BONUS_CHIPS = 100_000;

/** HoodfiPartnerRouter, and HoodPoker's partner address in it (frontend/components/HoodfiWidget.tsx). */
const ROUTER = '0xB7Bd5F2c7c445dDc5d55eBD9b8F6A20C2e6e4b5d' as const;
const PARTNER = '0x5f11a48230f7CdaB91A2361576239091E4b1165b' as const;
/** Router deploy block (hoodfi-eth gateway/wrangler.toml PARTNER_ROUTER_DEPLOY_BLOCK). */
const ROUTER_DEPLOY_BLOCK = 68_081_151n;
/** The RPC refuses log ranges over 10M blocks — same window as frontend/lib/logs.ts. */
const LOG_WINDOW = 9_000_000n;

const PARTNER_REGISTRATION = parseAbiItem(
  'event PartnerRegistration(address indexed partner, address indexed buyer, bytes32 indexed node, string label, uint256 pricePaid, uint256 baseFee, uint256 partnerShare, uint256 platformCut)',
);

const robinhood = {
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.chain.robinhood.com'] } },
} as const;

const DAY = 86_400_000;
const AST_OFFSET = 4 * 3600_000;

/**
 * The Friday (AST) whose week `now` falls in, as YYYY-MM-DD. Day 0 of the
 * epoch was a Thursday, so Fridays are the days where (day - 1) % 7 == 0.
 */
export function weekKey(now: number): string {
  const day = Math.floor((now - AST_OFFSET) / DAY);
  const friday = day - (((day - 1) % 7) + 7) % 7;
  return new Date(friday * DAY).toISOString().slice(0, 10);
}

/** When the next week opens (ms), for the profile's "next Friday" line. */
export function nextWeekAt(now: number): number {
  return Date.parse(`${weekKey(now)}T00:00:00Z`) + AST_OFFSET + 7 * DAY;
}

/** `label.hoodfi.eth` only — one label, no subnames. */
export function isDirectHoodfiName(name: string): boolean {
  return /^[a-z0-9-]{1,63}\.hoodfi\.eth$/.test(name);
}

/**
 * HoodFi's own gateway serves the partner's sales from its dedicated archive
 * RPC. From a Worker, the public RPC's getLogs fails often enough that this is
 * the first source; it's our infrastructure, and the rows are the same public
 * PartnerRegistration logs.
 */
const SALES_URL = `https://ccip.hoodfi-mcp.com/partner/${PARTNER}/sales`;

/**
 * Did this wallet buy a name through the HoodPoker widget? Gateway first;
 * if it doesn't list the wallet (its response is CDN-cached, so a sale from
 * minutes ago may be missing) or doesn't answer, ask the chain directly.
 */
export async function boughtViaWidget(address: string): Promise<'yes' | 'no' | 'unavailable'> {
  try {
    const res = await fetch(SALES_URL, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = (await res.json()) as { sales?: { buyer?: string }[] };
      if (data.sales?.some((s) => String(s.buyer).toLowerCase() === address)) return 'yes';
    }
  } catch (err) {
    console.error('widget sales gateway failed', String(err).slice(0, 200));
  }
  return boughtViaWidgetOnChain(address);
}

async function boughtViaWidgetOnChain(address: string): Promise<'yes' | 'no' | 'unavailable'> {
  const client = createPublicClient({ chain: robinhood, transport: http() });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const latest = await client.getBlockNumber();
      for (let from = ROUTER_DEPLOY_BLOCK; from <= latest; from += LOG_WINDOW) {
        const to = from + LOG_WINDOW - 1n < latest ? from + LOG_WINDOW - 1n : latest;
        const logs = await client.getLogs({
          address: ROUTER,
          event: PARTNER_REGISTRATION,
          args: { partner: PARTNER, buyer: address as `0x${string}` },
          fromBlock: from,
          toBlock: to,
        });
        if (logs.length) return 'yes';
      }
      return 'no';
    } catch (err) {
      if (attempt === 2) console.error('boughtViaWidget unavailable', String(err).slice(0, 200));
      else await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }
  return 'unavailable';
}

/**
 * Credit `amount` once for (kind, period, address) — and, when `name` is set,
 * once for (kind, period, name). Returns false if either was already paid.
 */
export async function payBonus(
  env: Env, address: string, kind: string, period: string, name: string | null, amount: number,
): Promise<boolean> {
  const now = Date.now();
  const unpaid = `NOT EXISTS (SELECT 1 FROM bonus_claims WHERE kind = ?1 AND period = ?2
                   AND (address = ?3 OR (?4 IS NOT NULL AND name = ?4)))`;
  const [, credit] = await env.DB.batch([
    env.DB.prepare(`INSERT INTO players (address, created_at) VALUES (?1, ?2) ON CONFLICT(address) DO NOTHING`)
      .bind(address, now),
    env.DB.prepare(`UPDATE players SET bankroll = bankroll + ?5 WHERE address = ?3 AND ${unpaid}`)
      .bind(kind, period, address, name, amount),
    env.DB.prepare(
      `INSERT INTO bonus_claims (kind, period, address, name, amount, created_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE ${unpaid}`,
    ).bind(kind, period, address, name, amount, now),
  ]);
  return credit.meta.changes > 0;
}

/** What this wallet has collected: the current week, and the widget bonus. */
export async function bonusStatus(env: Env, address: string, now = Date.now()) {
  const week = weekKey(now);
  const { results } = await env.DB.prepare(
    `SELECT kind, period FROM bonus_claims WHERE address = ? AND ((kind = 'hoodfi-weekly' AND period = ?) OR kind = 'widget')`,
  ).bind(address, week).all<{ kind: string; period: string }>();
  return {
    weekly: { amount: HOODFI_WEEKLY_CHIPS, claimed: results.some((r) => r.kind === 'hoodfi-weekly'), week, nextAt: nextWeekAt(now) },
    widget: { amount: WIDGET_BONUS_CHIPS, claimed: results.some((r) => r.kind === 'widget') },
  };
}

/**
 * Weekly claim: try the wallet's direct names (client-supplied, each verified
 * on-chain) until one owned name hasn't paid this week. At most 5 RPC reads.
 */
export async function claimWeekly(
  env: Env, address: string, names: unknown,
): Promise<{ ok: true; claimed: number; name: string } | { ok: false; status: number; error: string }> {
  const week = weekKey(Date.now());
  const list = (Array.isArray(names) ? names : [])
    .map((n) => String(n).toLowerCase().trim())
    .filter(isDirectHoodfiName)
    .slice(0, 50);
  if (!list.length) return { ok: false, status: 400, error: 'This wallet needs a hoodfi.eth name (not a subname) to claim.' };

  const mine = await env.DB.prepare(
    `SELECT 1 FROM bonus_claims WHERE kind = 'hoodfi-weekly' AND period = ? AND address = ?`,
  ).bind(week, address).first();
  if (mine) return { ok: false, status: 429, error: 'Already claimed this week — the next one opens Friday.' };

  // Skip names another wallet already used this week before spending RPC calls.
  const { results: used } = await env.DB.prepare(
    `SELECT name FROM bonus_claims WHERE kind = 'hoodfi-weekly' AND period = ? AND name IS NOT NULL`,
  ).bind(week).all<{ name: string }>();
  const taken = new Set(used.map((r) => r.name));

  let unavailable = false;
  let checked = 0;
  for (const name of list) {
    if (taken.has(name)) continue;
    if (checked++ >= 5) break;
    const owned = await ownsHoodfiName(address, name);
    if (owned === 'unavailable') { unavailable = true; continue; }
    if (owned !== 'owned') continue;
    if (await payBonus(env, address, 'hoodfi-weekly', week, name, HOODFI_WEEKLY_CHIPS)) {
      return { ok: true, claimed: HOODFI_WEEKLY_CHIPS, name };
    }
    taken.add(name); // lost a race for this name; try the next one
  }
  if (unavailable) return { ok: false, status: 503, error: 'Robinhood Chain didn’t answer — try again.' };
  return { ok: false, status: 409, error: 'No name on this wallet is free to claim this week (each name pays one wallet a week).' };
}
