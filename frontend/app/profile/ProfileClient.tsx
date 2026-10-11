'use client';
/**
 * Player profile: identity, chip bankroll, poker stats, daily chip claim,
 * the HoodFi bonuses (worker/src/bonus.ts), and the handle picker for wallets holding more than one hoodfi name.
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
  const [claimMsg, setClaimMsg] = useState<Msg | null>(null);
  // Brief glow on the bankroll after a successful claim, so the number moving is noticed.
  const [flash, setFlash] = useState(false);
  const celebrate = () => {
    setFlash(true);
    setTimeout(() => setFlash(false), 2400);
  };

  const { data } = useQuery({
    queryKey: ['profile', address],
    queryFn: () => api.profile(address!),
    enabled: !!address,
    refetchInterval: 15000,
  });
  const profile = data?.profile ?? null;

  const { data: bonus } = useQuery({
    queryKey: ['bonus', address],
    queryFn: () => api.bonus(address!),
    enabled: !!address,
  });
  const [bonusBusy, setBonusBusy] = useState<'weekly' | 'widget' | null>(null);
  const [bonusMsg, setBonusMsg] = useState<Msg | null>(null);
  // Direct names only: subnames don't earn the weekly bonus. The table name
  // goes first so that's the one the week is paid against.
  const directNames = hoodfiNames
    .map((n) => n.name)
    .filter((n) => /^[a-z0-9-]+\.hoodfi\.eth$/.test(n))
    .sort((a, b) => Number(b === handle) - Number(a === handle));

  const claimBonus = async (kind: 'weekly' | 'widget') => {
    if (!address) return;
    setBonusBusy(kind);
    setBonusMsg(null);
    try {
      const { token } = await ensureAuth(address, signMessage);
      const res = kind === 'weekly'
        ? await api.claimWeekly({ address, token }, directNames)
        : await api.claimWidget({ address, token });
      setBonusMsg({ ok: true, text: `+${formatChips(res.claimed)} chips added to your bankroll` });
      celebrate();
      void queryClient.invalidateQueries({ queryKey: ['profile', address] });
      void queryClient.invalidateQueries({ queryKey: ['bonus', address] });
    } catch (err) {
      setBonusMsg({ ok: false, text: err instanceof Error ? err.message : 'Claim failed' });
    } finally {
      setBonusBusy(null);
    }
  };

  const claim = async () => {
    if (!address) return;
    setClaiming(true);
    setClaimMsg(null);
    try {
      const { token } = await ensureAuth(address, signMessage);
      const res = await api.claim({ address, token });
      setClaimMsg({ ok: true, text: `+${formatChips(res.claimed)} chips added to your bankroll` });
      celebrate();
      void queryClient.invalidateQueries({ queryKey: ['profile', address] });
    } catch (err) {
      setClaimMsg({ ok: false, text: err instanceof Error ? err.message : 'Claim failed' });
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
            <p
              className={cn(
                'text-acid mt-2 hp-display hp-w80 text-[52px] leading-none transition-[text-shadow] duration-700',
                flash && '[text-shadow:0_0_28px_rgba(204,255,0,0.75)]',
              )}
            >
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
            {claimMsg && <Notice msg={claimMsg} />}
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

        {/* HoodFi bonuses */}
        <Card className="md:col-span-2">
          <CardContent className="p-7">
            <h3 className="hp-display hp-w85 text-xl text-cream">HoodFi bonuses</h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
              For hoodfi.eth name owners, House Pass or not. The weekly bonus resets every Friday at
              midnight AST, and each name pays one wallet a week.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Button
                onClick={() => claimBonus('weekly')}
                disabled={!!bonusBusy || !bonus || bonus.weekly.claimed || directNames.length === 0}
                className="w-full"
              >
                {bonusBusy === 'weekly'
                  ? 'Claiming…'
                  : !bonus
                    ? 'Weekly bonus'
                    : bonus.weekly.claimed
                      ? `Claimed · next ${new Date(bonus.weekly.nextAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`
                      : directNames.length === 0
                        ? 'Weekly bonus needs a hoodfi.eth name'
                        : `Claim weekly · +${formatChips(bonus.weekly.amount)}`}
              </Button>
              <Button
                variant="outline"
                onClick={() => claimBonus('widget')}
                disabled={!!bonusBusy || !bonus || bonus.widget.claimed}
                className="w-full"
              >
                {bonusBusy === 'widget'
                  ? 'Checking the chain…'
                  : !bonus
                    ? 'Widget bonus'
                    : bonus.widget.claimed
                      ? 'Widget bonus claimed'
                      : `Bought a name here? · +${formatChips(bonus.widget.amount)}`}
              </Button>
            </div>
            {bonusMsg && <Notice msg={bonusMsg} />}
            <p className="mt-3.5 text-[11.5px] text-faint">
              The one-time {bonus ? formatChips(bonus.widget.amount) : '100,000'} goes to a wallet that
              registered a hoodfi.eth name through the widget on HoodPoker.
            </p>
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

type Msg = { ok: boolean; text: string };

/** Claim result: a green banner for chips landed, red for a refusal — never mistakable. */
function Notice({ msg }: { msg: Msg }) {
  return (
    <div
      role={msg.ok ? 'status' : 'alert'}
      className={cn(
        'mt-4 flex items-center justify-center gap-2 rounded-btn border px-4 py-3 text-center text-[14px] font-semibold',
        msg.ok
          ? 'border-acid/50 bg-acid/[0.12] text-acid'
          : 'border-red-400/40 bg-red-400/10 text-red-300',
      )}
    >
      <span aria-hidden>{msg.ok ? '✓' : '!'}</span>
      {msg.text}
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
