'use client';
/**
 * Player profile: ENS identity, chip bankroll, poker stats, daily chip
 * claim, and the $ENS holdings / DAO panel. Every number is live —
 * profile stats come from D1, $ENS figures from on-chain reads.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSignMessage } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { api } from '@/lib/api';
import { ensureAuth } from '@/lib/auth';
import { useEnsIdentity, useEnsHoldings } from '@/lib/ens';
import { displayName, formatChips } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EnsBadge } from '@/components/EnsBadge';
import { HoldingsBanner } from '@/components/HoldingsBanner';

export default function ProfilePage() {
  const { open } = useAppKit();
  const { address, isConnected, ensName, avatar } = useEnsIdentity();
  const { signMessageAsync } = useSignMessage();
  const holdings = useEnsHoldings();
  const queryClient = useQueryClient();

  const [claiming, setClaiming] = useState(false);
  const [claimMsg, setClaimMsg] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['profile', address],
    queryFn: () => api.profile(address!),
    enabled: !!address,
    refetchInterval: 15000,
  });
  const profile = data?.profile ?? null;

  const claim = async () => {
    if (!address) return;
    setClaiming(true);
    setClaimMsg(null);
    try {
      const sig = await ensureAuth(address, signMessageAsync);
      const res = await api.claim({ address: address.toLowerCase(), sig });
      setClaimMsg(`+${formatChips(res.claimed)} chips claimed! 🎉`);
      void queryClient.invalidateQueries({ queryKey: ['profile', address] });
    } catch (err) {
      setClaimMsg(err instanceof Error ? err.message : 'Claim failed');
    } finally {
      setClaiming(false);
    }
  };

  if (!isConnected || !address) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
        <p className="text-slate-400">Connect your wallet to view your profile.</p>
        <Button onClick={() => open()}>Connect Wallet</Button>
      </div>
    );
  }

  const winRate = profile && profile.handsPlayed > 0
    ? Math.round((profile.handsWon / profile.handsPlayed) * 100)
    : 0;
  const canClaim = !profile || Date.now() - profile.lastClaim > 24 * 3600 * 1000;

  return (
    <div className="mx-auto max-w-4xl px-4 py-14 sm:px-7">
      {/* Identity */}
      <div className="flex flex-wrap items-center gap-5">
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatar}
            alt=""
            className="h-[76px] w-[76px] rounded-[20px] object-cover shadow-gold ring-2 ring-gold-500/40"
          />
        ) : (
          <span className="gold-fill flex h-[76px] w-[76px] items-center justify-center rounded-[20px] font-display text-[34px] font-bold text-ink shadow-gold ring-2 ring-gold-500/40">
            {displayName(ensName, address).slice(0, 1).toUpperCase()}
          </span>
        )}
        <div>
          <h1 className="flex flex-wrap items-center gap-3 font-display text-3xl font-bold text-cream sm:text-[34px]">
            {displayName(ensName, address)}
            {holdings.isVerifiedHolder && <EnsBadge />}
          </h1>
          <p className="mt-2 break-all font-mono text-[13px] text-slate-500">
            {address.toLowerCase()}
          </p>
        </div>
      </div>

      <div className="mt-7"><HoldingsBanner /></div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {/* Chips & claim */}
        <Card className="border-gold-500/25">
          <CardContent className="p-7">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Bankroll</p>
            <p className="gold-text mt-2 font-display text-[52px] font-bold leading-none">
              {profile ? formatChips(profile.bankroll) : '—'}
            </p>
            {!profile && (
              <p className="mt-2 text-xs text-slate-600">
                Your bankroll is created (10,000 chips) the first time you sit at a table.
              </p>
            )}
            <Button onClick={claim} disabled={claiming || !canClaim} className="mt-6 w-full">
              {claiming
                ? 'Claiming…'
                : canClaim
                  ? 'Claim daily chips · +5,000'
                  : 'Daily chips already claimed'}
            </Button>
            {claimMsg && <p className="mt-3 text-center text-xs text-slate-400">{claimMsg}</p>}
            {/* FUTURE ENS INTEGRATION POINT:
                when the official ENS distribution contract ships, this claim
                becomes tiered — verified $ENS holders (and delegated voters)
                receive boosted amounts, matching worker/src/index.ts. */}
            <p className="mt-3.5 text-center text-[11.5px] text-slate-600">
              ENS holders will receive boosted claims once official rewards launch.
            </p>
          </CardContent>
        </Card>

        {/* Poker stats */}
        <Card>
          <CardContent className="p-7">
            <h3 className="mb-5 font-display text-xl font-semibold text-cream">Poker Record</h3>
            <dl className="grid grid-cols-2 gap-6">
              <Stat
                label="Net profit"
                value={profile ? `${profile.netProfit >= 0 ? '+' : ''}${formatChips(profile.netProfit)}` : '—'}
                tone={profile && profile.netProfit < 0 ? 'text-red-400' : 'text-green-400'}
              />
              <Stat label="Hands played" value={profile ? formatChips(profile.handsPlayed) : '—'} />
              <Stat label="Hands won" value={profile ? `${formatChips(profile.handsWon)} · ${winRate}%` : '—'} />
              <Stat label="Biggest pot" value={profile ? formatChips(profile.biggestPot) : '—'} tone="text-gold-400" />
            </dl>
          </CardContent>
        </Card>

        {/* ENS & DAO snapshot */}
        <Card className="border-ens-400/20 md:col-span-2">
          <CardContent className="p-7">
            <h3 className="mb-5 flex items-center gap-2.5 font-display text-xl font-semibold text-cream">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/ens-logo.jpg" alt="ENS" className="h-[22px] w-[22px] rounded-[5px]" />
              $ENS &amp; DAO
            </h3>
            <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              <Stat
                label="$ENS balance"
                value={holdings.balance.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                tone="text-ens-300"
              />
              <Stat
                label="Peak held"
                value={holdings.peak.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              />
              <Stat
                label="Safe to sell"
                value={holdings.safeToSell.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                tone="text-gold-400"
              />
              <Stat
                label="Delegated"
                value={holdings.delegated ? 'Yes ✓' : 'Not yet'}
                tone={holdings.delegated ? 'text-green-400' : 'text-gold-400'}
              />
            </dl>
            {!holdings.delegated && holdings.isVerifiedHolder && (
              <p className="mt-5 text-xs text-slate-500">
                Your $ENS isn’t voting yet — delegate it (to yourself or a delegate you trust) at{' '}
                <a
                  href="https://agora.ensdao.org/delegates"
                  target="_blank"
                  rel="noreferrer"
                  className="text-ens-300 underline"
                >
                  agora.ensdao.org
                </a>{' '}
                to activate your DAO voice. It never leaves your wallet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = 'text-slate-100' }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{label}</dt>
      <dd className={`mt-1.5 font-mono text-[21px] font-semibold tabular-nums ${tone}`}>{value}</dd>
    </div>
  );
}
