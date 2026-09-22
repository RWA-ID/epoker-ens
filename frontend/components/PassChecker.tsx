'use client';
/**
 * House Pass eligibility check for CCFF00 holders.
 *
 * One `balanceOf` against the CCFF00 collection on Robinhood Chain — the same
 * chain (and the same RPC already in the CSP) the HoodFi name lookups use.
 * Read-only: it proves nothing on its own and reserves nothing. The real
 * allowlist is drawn at the snapshot, whenever the mint is scheduled, so the
 * copy says "as of right now" rather than promising a number.
 *
 * That RPC refuses a share of calls (it is what demoted players to a bare
 * address at the table), so a failure says "couldn't reach the chain" and
 * offers a retry instead of reporting zero — reading a throttle as "you hold
 * none" is the same bug in a friendlier place.
 */
import { useState } from 'react';
import { createPublicClient, http, parseAbi, type Address } from 'viem';
import { robinhood } from '@/lib/chains';
import { ROBINHOOD_RPC_URL } from '@/lib/config';
import { useIdentity } from '@/lib/identity';
import { useConnect } from '@/lib/wallet';
import { Button } from '@/components/ui/button';

/** CCFF00 on Robinhood Chain (verified on-chain: name/symbol CCFF00). */
export const CCFF00_CONTRACT = '0x505A22Ffed8d37ebE580FfD98d2Cdb0021189146' as const;

const BALANCE_ABI = parseAbi(['function balanceOf(address owner) view returns (uint256)']);

const client = createPublicClient({ chain: robinhood, transport: http(ROBINHOOD_RPC_URL) });

type Result =
  | { kind: 'held'; count: number }
  | { kind: 'none' }
  | { kind: 'error' };

export function PassChecker() {
  const { address, isConnected } = useIdentity();
  const open = useConnect();
  const [result, setResult] = useState<Result | null>(null);
  const [checking, setChecking] = useState(false);

  const check = async () => {
    if (!address) return open();
    setChecking(true);
    setResult(null);
    try {
      // Two attempts: this RPC drops calls intermittently.
      let balance: bigint | null = null;
      for (let i = 0; i < 2 && balance === null; i++) {
        try {
          balance = await client.readContract({
            address: CCFF00_CONTRACT,
            abi: BALANCE_ABI,
            functionName: 'balanceOf',
            args: [address as Address],
          });
        } catch {
          if (i === 0) await new Promise((r) => setTimeout(r, 400));
        }
      }
      if (balance === null) setResult({ kind: 'error' });
      else setResult(Number(balance) > 0 ? { kind: 'held', count: Number(balance) } : { kind: 'none' });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="mt-4 rounded-card border border-acid/25 bg-acid/[0.05] p-4">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="h-5 w-5 shrink-0 rounded-[3px] border border-acid/40"
          style={{ backgroundColor: '#CCFF00' }}
        />
        <p className="text-[14px] leading-[1.5] text-cream">
          <span className="font-semibold text-acid">CCFF00 holders mint free.</span>{' '}
          <span className="text-muted">One pass per CCFF00 held.</span>
        </p>
      </div>

      <Button
        variant="outline"
        className="mt-3.5 w-full"
        onClick={check}
        disabled={checking}
      >
        {checking ? 'Checking…' : isConnected ? 'Check my wallet' : 'Connect to check'}
      </Button>

      {result && (
        <p
          className={
            result.kind === 'held'
              ? 'mt-3 text-[14px] leading-[1.5] text-acid'
              : 'mt-3 text-[14px] leading-[1.5] text-muted'
          }
          role="status"
        >
          {result.kind === 'held' && (
            <>
              <span className="font-semibold">
                {result.count} CCFF00 {result.count === 1 ? 'NFT' : 'NFTs'} in this wallet
              </span>
              {' — '}
              <span className="text-muted">
                that&rsquo;s {result.count} free {result.count === 1 ? 'pass' : 'passes'} at the
                snapshot, as things stand today.
              </span>
            </>
          )}
          {result.kind === 'none' && (
            <>No CCFF00 found in this wallet. Holding one before the snapshot earns a free pass.</>
          )}
          {result.kind === 'error' && (
            <>Couldn&rsquo;t reach Robinhood Chain just now — that RPC drops calls. Try again.</>
          )}
        </p>
      )}
    </div>
  );
}
