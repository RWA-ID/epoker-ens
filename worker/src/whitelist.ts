/**
 * House Pass whitelist: 2,222 free-mint spots, one per wallet, plus a 1,111
 * waitlist behind them.
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
 * The limit and the no-repeat rule live in ONE statement — the INSERT only
 * fires while the count is under the limit, and the primary key drops a repeat
 * — so two sign-ups racing for the last place can't both land. D1 runs a
 * statement atomically; a count-then-insert in two statements could overshoot.
 */
import { createPublicClient, http, parseAbi } from 'viem';
import type { Env } from './env';

/** Whitelist spots on the allowlist. */
export const WHITELIST_CAP = 2222;
/** Sign-ups accepted past the cap, to backfill spots picked CCFF00 holders vacate. */
export const WAITLIST = 1111;
export const SIGNUP_LIMIT = WHITELIST_CAP + WAITLIST;

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
 * Informational only now — it decides what the page tells a holder, never
 * whether they get in — so a failed read costs nothing but the hint.
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

export async function whitelistStatus(
  env: Pick<Env, 'DB' | 'WHITELIST_OPEN'>,
  address?: string,
): Promise<WhitelistStatus> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM whitelist').first<{ n: number }>();
  const status: WhitelistStatus = {
    count: Number(row?.n ?? 0), cap: WHITELIST_CAP, waitlist: WAITLIST, open: isOpen(env),
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
  | { ok: false; reason: 'closed' | 'full'; count: number; cap: number; waitlist: number };

/**
 * Add a verified address. `checkHolder` is injectable so tests don't touch the
 * chain. Someone already signed up gets their position even after sign-ups
 * close or fill, and never costs an RPC call.
 */
export async function joinWhitelist(
  env: Pick<Env, 'DB' | 'WHITELIST_OPEN'>,
  address: string,
  checkHolder: (address: string) => Promise<HolderCheck> = holdsCcff00,
): Promise<JoinResult> {
  const sizes = { cap: WHITELIST_CAP, waitlist: WAITLIST };
  const before = await whitelistStatus(env, address);
  if (before.joined) {
    return { ok: true, already: true, count: before.count, ...sizes, position: before.position!, holdsCcff00: null };
  }
  if (!before.open) return { ok: false, reason: 'closed', count: before.count, ...sizes };
  if (before.count >= SIGNUP_LIMIT) return { ok: false, reason: 'full', count: before.count, ...sizes };

  const res = await env.DB.prepare(
    `INSERT INTO whitelist (address, created_at)
     SELECT ?, ? WHERE (SELECT COUNT(*) FROM whitelist) < ?
     ON CONFLICT(address) DO NOTHING`,
  ).bind(address, Date.now(), SIGNUP_LIMIT).run();

  const after = await whitelistStatus(env, address);
  // Nothing inserted and not on the list: the last place went to someone else.
  if (!after.joined) return { ok: false, reason: 'full', count: after.count, ...sizes };

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
