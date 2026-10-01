/**
 * House Pass whitelist: 1,111 free-mint spots, one per wallet.
 *
 * CCFF00 holders can't take a spot — they have their own stage. The check runs
 * here at sign-up, but a wallet can buy a CCFF00 *after* joining, so the final
 * mint list must filter again at the snapshot. This table is the sign-up
 * record, not the allowlist.
 *
 * The cap and the no-repeat rule live in ONE statement — the INSERT only fires
 * while the count is under the cap, and the primary key drops a repeat — so two
 * sign-ups racing for the last spot can't both land. D1 runs a statement
 * atomically; a count-then-insert in two statements could overshoot.
 */
import { createPublicClient, http, parseAbi } from 'viem';
import type { Env } from './env';

export const WHITELIST_CAP = 1111;

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
 * Reading a refused call as zero would let any CCFF00 holder onto the list on a
 * bad second — the same trap handle.ts documents for name ownership.
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
  count: number;
  cap: number;
  open: boolean;
  /** Only present when the caller asked about an address. */
  joined?: boolean;
}

export function isOpen(env: Pick<Env, 'WHITELIST_OPEN'>): boolean {
  return env.WHITELIST_OPEN === '1';
}

export async function whitelistStatus(
  env: Pick<Env, 'DB' | 'WHITELIST_OPEN'>,
  address?: string,
): Promise<WhitelistStatus> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM whitelist').first<{ n: number }>();
  const status: WhitelistStatus = { count: Number(row?.n ?? 0), cap: WHITELIST_CAP, open: isOpen(env) };
  if (address) {
    const hit = await env.DB.prepare('SELECT 1 AS x FROM whitelist WHERE address = ?').bind(address).first();
    status.joined = !!hit;
  }
  return status;
}

export type JoinResult =
  | { ok: true; already: boolean; count: number; cap: number }
  | { ok: false; reason: 'closed' | 'full' | 'ccff00' | 'unavailable'; count: number; cap: number };

/**
 * Add a verified address. `checkHolder` is injectable so tests don't touch the
 * chain. Order matters: someone already on the list gets "you're in" even
 * after it closes or fills, and never costs an RPC call.
 */
export async function joinWhitelist(
  env: Pick<Env, 'DB' | 'WHITELIST_OPEN'>,
  address: string,
  checkHolder: (address: string) => Promise<HolderCheck> = holdsCcff00,
): Promise<JoinResult> {
  const before = await whitelistStatus(env, address);
  const base = { count: before.count, cap: WHITELIST_CAP };
  if (before.joined) return { ok: true, already: true, ...base };
  if (!before.open) return { ok: false, reason: 'closed', ...base };
  if (before.count >= WHITELIST_CAP) return { ok: false, reason: 'full', ...base };

  const holder = await checkHolder(address);
  if (holder === 'holder') return { ok: false, reason: 'ccff00', ...base };
  if (holder === 'unavailable') return { ok: false, reason: 'unavailable', ...base };

  const res = await env.DB.prepare(
    `INSERT INTO whitelist (address, created_at)
     SELECT ?, ? WHERE (SELECT COUNT(*) FROM whitelist) < ?
     ON CONFLICT(address) DO NOTHING`,
  ).bind(address, Date.now(), WHITELIST_CAP).run();

  const after = await whitelistStatus(env, address);
  const now = { count: after.count, cap: WHITELIST_CAP };
  if (res.meta.changes) return { ok: true, already: false, ...now };
  // Nothing inserted: either a second tab of the same wallet won the race, or
  // the last spot went while the chain check ran.
  if (after.joined) return { ok: true, already: true, ...now };
  return { ok: false, reason: 'full', ...now };
}
