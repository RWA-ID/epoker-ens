'use client';
/**
 * Player profile: identity, chip bankroll, poker stats, daily chip claim,
 * and the handle picker for wallets holding more than one hoodfi name.
 * Every number is live — stats come from D1.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useConnect, useWallet } from '@/lib/wallet';
import { api } from '@/lib/api';
import { ensureAuth } from '@/lib/auth';
import { useIdentity } from '@/lib/identity';
import { HOODFI_MINT_URL } from '@/lib/config';
import { displayName, formatChips, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar } from '@/components/Avatar';

export default function ProfilePage() {
  const open = useConnect();
  const {
    address,
    handle,
    avatar,
    hoodfiNames,
    ensName,
    isConnected,
    isRestoring,
    isLoadingHandle,
    setHandle,
  } = useIdentity();
  const { signMessage } = useWallet();
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
      const sig = await ensureAuth(address, signMessage);
      const res = await api.claim({ address: address.toLowerCase(), sig });
      setClaimMsg(`+${formatChips(res.claimed)} chips claimed! 🎉`);
      void queryClient.invalidateQueries({ queryKey: ['profile', address] });
    } catch (err) {
      setClaimMsg(err instanceof Error ? err.message : 'Claim failed');
    } finally {
      setClaiming(false);
    }
  };

  // 'reconnecting' is not 'disconnected' — telling a connected player to
  // connect is the bug this branch exists to avoid.
  if (isRestoring) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
        <span className="h-2 w-2 animate-pulse rounded-full bg-acid-400" />
        <p className="text-muted">Reconnecting your wallet…</p>
      </div>
    );
  }

  if (!isConnected || !address) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
        <p className="text-muted">Connect your wallet to view your profile.</p>
        <Button onClick={() => open()}>Sign in</Button>
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
        <Avatar
          record={avatar}
          handle={handle}
          address={address}
          size={76}
          className="h-[76px] w-[76px] rounded-[20px] shadow-cta ring-2 ring-acid-400/40"
          monogramClassName="rounded-[20px] text-[34px]"
        />
        <div className="min-w-0">
          <h1 className="hp-display hp-w80 text-3xl text-cream sm:text-[34px]">
            {isLoadingHandle && !handle ? 'Loading…' : displayName(handle, address)}
          </h1>
          <p className="mt-2 break-all font-mono text-[13px] text-dim">
            {address.toLowerCase()}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {/* Chips & claim */}
        <Card className="border-acid-400/25">
          <CardContent className="p-7">
            <p className="text-[11px] uppercase tracking-[0.2em] text-dim">Bankroll</p>
            <p className="text-acid mt-2 hp-display hp-w80 text-[52px] leading-none">
              {profile ? formatChips(profile.bankroll) : '—'}
            </p>
            {!profile && (
              <p className="mt-2 text-xs text-faint">
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
            {claimMsg && <p className="mt-3 text-center text-xs text-muted">{claimMsg}</p>}
            <p className="mt-3.5 text-center text-[11.5px] text-faint">
              Play chips have no cash value and can’t be bought, sold or withdrawn.
            </p>
          </CardContent>
        </Card>

        {/* Poker stats */}
        <Card>
          <CardContent className="p-7">
            <h3 className="mb-5 hp-display hp-w85 text-xl text-cream">Poker Record</h3>
            <dl className="grid grid-cols-2 gap-6">
              <Stat
                label="Net chips"
                value={profile ? `${profile.netProfit >= 0 ? '+' : ''}${formatChips(profile.netProfit)}` : '—'}
                tone={profile && profile.netProfit < 0 ? 'text-red-400' : 'text-acid-400'}
              />
              <Stat label="Hands played" value={profile ? formatChips(profile.handsPlayed) : '—'} />
              <Stat label="Hands won" value={profile ? `${formatChips(profile.handsWon)} · ${winRate}%` : '—'} />
              <Stat label="Biggest pot" value={profile ? formatChips(profile.biggestPot) : '—'} tone="text-acid" />
            </dl>
          </CardContent>
        </Card>

        {/* Handle picker */}
        <Card className="md:col-span-2">
          <CardContent className="p-7">
            <h3 className="hp-display hp-w85 text-xl text-cream">Your table name</h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
              Names you hold on Robinhood Chain. Pick which one you play under — it shows
              on your seat, in chat and on the leaderboard.
            </p>

            {isLoadingHandle ? (
              <p className="mt-5 text-sm text-dim">Checking the registry…</p>
            ) : hoodfiNames.length > 0 ? (
              <div className="mt-5 flex flex-wrap gap-2">
                {hoodfiNames.map((n) => {
                  const active = handle === n.name;
                  return (
                    <button
                      key={n.name}
                      onClick={() => setHandle(n.name)}
                      className={cn(
                        'flex items-center gap-2 rounded-full border py-1 pl-1 pr-3.5 text-[13px] transition-colors',
                        active
                          ? 'border-acid-400/60 bg-acid-400/15 text-acid'
                          : 'border-white/10 text-muted hover:border-acid-400/40 hover:text-acid',
                      )}
                    >
                      <Avatar
                        record={n.avatar}
                        handle={n.name}
                        address={address}
                        size={26}
                        className="h-[26px] w-[26px]"
                        monogramClassName="text-[11px]"
                      />
                      {n.name}
                      {active && <span className="text-[11px]">✓</span>}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="mt-5 text-sm text-dim">
                No hoodfi.eth name on this wallet yet.{' '}
                <a
                  href={HOODFI_MINT_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="text-acid underline"
                >
                  Mint one at hoodfi.name
                </a>{' '}
                — or keep playing under {ensName ? ensName : 'your address'}.
              </p>
            )}

            {ensName && hoodfiNames.length > 0 && (
              <button
                onClick={() => setHandle(null)}
                className="mt-4 text-[12.5px] text-dim underline transition-colors hover:text-muted"
              >
                Use my mainnet name ({ensName}) instead
              </button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = 'text-cream' }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-[0.14em] text-dim">{label}</dt>
      <dd className={`mt-1.5 font-mono text-[21px] font-semibold tabular-nums ${tone}`}>{value}</dd>
    </div>
  );
}
