/**
 * House Pass whitelist: 2,222 free-mint spots, one per wallet AND one per X
 * handle, plus a 1,111 waitlist behind them.
 *
 * v2 (2026-10-04): sign-up is an X handle + a pasted wallet, no wallet
 * connection. v1 proved the wallet with a SIWE signature, which proved nothing
 * useful — wallets are free, and a script signed up 1,999 of them in 12
 * minutes. The handle is the scarce thing now. Entry rule: repost the pinned
 * post on @hoodpokercasino; that is checked at the snapshot against the
 * reposters list, not here — the site can't read reposts without X's paid API.
 * Here we only stop the cheap abuse: Turnstile (in index.ts), one row per
 * handle, one per wallet, a per-IP limit.
 *
 * CCFF00 holders may sign up. Only 3,333 of ~4,316 holders are picked for the
 * CCFF00 stage (longest holders, decided at the snapshot), and the ones left
 * out deserve a way in. But nobody knows who is picked until the snapshot, so
 * the snapshot drops picked holders from this list and fills the 2,222 spots
 * in sign-up order from the wallets that remain — the waitlist backfills every
 * spot a picked holder vacates. This table is the sign-up record, not the
 * allowlist; `worker/scripts/house-pass-snapshot.mjs` builds that.
 *
 * Order is (created_at, address), here and in the snapshot, so a position
 * shown at sign-up is the position the snapshot uses.
 *
 * The limit and the no-repeat rules live in ONE statement — the INSERT only
 * fires while the count is under the limit, and the primary key / unique
 * handle index drop a repeat — so two sign-ups racing for the last place can't
 * both land. The count itself is a trigger-maintained row (migration 004):
 * COUNT(*) read every row on every 15s poll.
 */
import { createPublicClient, http, parseAbi } from 'viem';
import type { Env } from './env';

/** Whitelist spots on the allowlist. */
export const WHITELIST_CAP = 2222;
/** Sign-ups accepted past the cap, to backfill spots picked CCFF00 holders vacate. */
export const WAITLIST = 1111;
export const SIGNUP_LIMIT = WHITELIST_CAP + WAITLIST;

/** Our own account — the handle people paste when they copy the pinned post's link. */
export const OWN_HANDLE = 'hoodpokercasino';

/** CCFF00 on Robinhood Chain — same contract as frontend/components/PassChecker.tsx. */
export const CCFF00_CONTRACT = '0x505A22Ffed8d37ebE580FfD98d2Cdb0021189146' as const;

const ROBINHOOD_RPC = 'https://rpc.mainnet.chain.robinhood.com';
const BALANCE_ABI = parseAbi(['function balanceOf(address owner) view returns (uint256)']);

const robinhood = {
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [ROBINHOOD_RPC] } },
} as const;

/**
 * Three answers, not two: a throttled RPC is `unavailable`, never "holds none".
 * Informational only — it decides what the page tells a holder, never whether
 * they get in — so a failed read costs nothing but the hint.
 */
export type HolderCheck = 'holder' | 'not-holder' | 'unavailable';

export async function holdsCcff00(address: string, rpcUrl = ROBINHOOD_RPC): Promise<HolderCheck> {
  const client = createPublicClient({ chain: robinhood, transport: http(rpcUrl) });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const balance = await client.readContract({
        address: CCFF00_CONTRACT,
        abi: BALANCE_ABI,
        functionName: 'balanceOf',
        args: [address as `0x${string}`],
      });
      return balance > 0n ? 'holder' : 'not-holder';
    } catch {
      if (attempt < 2) await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }
  return 'unavailable';
}

/** A pasted wallet, lowercased, or null if it isn't one. */
export function parseWallet(raw: unknown): string | null {
  const s = String(raw ?? '').trim().toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(s) ? s : null;
}

/** x.com paths that are pages, not accounts. */
const NOT_HANDLES = new Set([
  'home', 'i', 'intent', 'search', 'explore', 'notifications', 'messages', 'settings',
  'share', 'hashtag', 'login', 'signup', 'tos', 'privacy',
]);

/**
 * Whatever people paste, reduced to a lowercase handle: `@name`, `name`,
 * `x.com/name`, a profile URL, or a status URL (`x.com/name/status/123…`,
 * twitter.com too). null if no handle can be read from it. Our own handle
 * comes back as-is so the caller can say "that's our post, not yours".
 */
export function parseHandle(raw: unknown): string | null {
  let s = String(raw ?? '').trim();
  const url = s.match(/^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/([^/?#\s]+)/i);
  if (url) s = url[1];
  s = s.replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_]{1,15}$/.test(s) || NOT_HANDLES.has(s)) return null;
  return s;
}

export interface WhitelistStatus {
  /** Sign-ups so far, waitlist included. */
  count: number;
  cap: number;
  waitlist: number;
  open: boolean;
  /** Only present when the caller asked about an address. */
  joined?: boolean;
  /** 1-based sign-up order; above `cap` means waitlisted. Only when joined. */
  position?: number;
}

export function isOpen(env: Pick<Env, 'WHITELIST_OPEN'>): boolean {
  return env.WHITELIST_OPEN === '1';
}

async function signupCount(env: Pick<Env, 'DB'>): Promise<number> {
  const row = await env.DB.prepare("SELECT v AS n FROM whitelist_meta WHERE k = 'count'").first<{ n: number }>();
  return Number(row?.n ?? 0);
}

export async function whitelistStatus(
  env: Pick<Env, 'DB' | 'WHITELIST_OPEN'>,
  address?: string,
): Promise<WhitelistStatus> {
  const status: WhitelistStatus = {
    count: await signupCount(env), cap: WHITELIST_CAP, waitlist: WAITLIST, open: isOpen(env),
  };
  if (address) {
    const mine = await env.DB.prepare('SELECT created_at AS t FROM whitelist WHERE address = ?')
      .bind(address).first<{ t: number }>();
    status.joined = !!mine;
    if (mine) {
      const ahead = await env.DB.prepare(
        'SELECT COUNT(*) AS n FROM whitelist WHERE created_at < ? OR (created_at = ? AND address <= ?)',
      ).bind(mine.t, mine.t, address).first<{ n: number }>();
      status.position = Number(ahead?.n ?? 0);
    }
  }
  return status;
}

export type JoinResult =
  | { ok: true; already: boolean; count: number; cap: number; waitlist: number; position: number;
      /** null when the chain didn't answer — the page just skips the hint. */
      holdsCcff00: boolean | null }
  | { ok: false; reason: 'closed' | 'full' | 'handle-taken'; count: number; cap: number; waitlist: number };

async function handleOwner(env: Pick<Env, 'DB'>, handle: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT address FROM whitelist WHERE x_handle = ?')
    .bind(handle).first<{ address: string }>();
  return row?.address ?? null;
}

/**
 * Add a wallet under an X handle. Both arrive already parsed (parseWallet /
 * parseHandle). `checkHolder` is injectable so tests don't touch the chain.
 * A wallet already signed up gets its position back, whatever handle it sends
 * now, and never costs an RPC call. A handle already used by another wallet
 * is refused — one spot per person, which is the whole point of v2.
 */
export async function joinWhitelist(
  env: Pick<Env, 'DB' | 'WHITELIST_OPEN'>,
  address: string,
  handle: string,
  checkHolder: (address: string) => Promise<HolderCheck> = holdsCcff00,
): Promise<JoinResult> {
  const sizes = { cap: WHITELIST_CAP, waitlist: WAITLIST };
  const before = await whitelistStatus(env, address);
  if (before.joined) {
    return { ok: true, already: true, count: before.count, ...sizes, position: before.position!, holdsCcff00: null };
  }
  if (!before.open) return { ok: false, reason: 'closed', count: before.count, ...sizes };
  if (await handleOwner(env, handle)) return { ok: false, reason: 'handle-taken', count: before.count, ...sizes };
  if (before.count >= SIGNUP_LIMIT) return { ok: false, reason: 'full', count: before.count, ...sizes };

  // OR IGNORE covers both unique rules: a repeat wallet (primary key) and a
  // repeat handle (whitelist_x_handle) each insert nothing.
  const res = await env.DB.prepare(
    `INSERT OR IGNORE INTO whitelist (address, created_at, x_handle)
     SELECT ?, ?, ? WHERE (SELECT v FROM whitelist_meta WHERE k = 'count') < ?`,
  ).bind(address, Date.now(), handle, SIGNUP_LIMIT).run();

  const after = await whitelistStatus(env, address);
  if (!after.joined) {
    // Nothing inserted: another wallet took this handle a moment ago, or the
    // last place went to someone else.
    const reason = (await handleOwner(env, handle)) ? 'handle-taken' : 'full';
    return { ok: false, reason, count: after.count, ...sizes };
  }

  const holder = res.meta.changes ? await checkHolder(address) : 'unavailable';
  return {
    ok: true,
    already: !res.meta.changes, // a second tab of the same wallet won the race
    count: after.count,
    ...sizes,
    position: after.position!,
    holdsCcff00: holder === 'unavailable' ? null : holder === 'holder',
  };
}
