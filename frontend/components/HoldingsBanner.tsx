'use client';
/**
 * The $ENS holding notification system (product requirement #5).
 *
 * Reads the DAO-encouragement state machine from useEnsHoldings and
 * renders the matching banner:
 *   healthy  → celebrate voting power + show the safe-to-sell amount
 *   reduced  → warn that benefits are at risk
 *   sold-all → penalty notice (reduced in-game benefits)
 *   none     → invitation to join the DAO
 */
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { useEnsHoldings } from '@/lib/ens';
import { cn } from '@/lib/utils';

export function HoldingsBanner({ compact = false }: { compact?: boolean }) {
  const { isConnected } = useAccount();
  const h = useEnsHoldings();
  if (!isConnected || h.status === 'loading') return null;

  const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

  const config = {
    healthy: {
      tone: 'border-ens-400/40 bg-ens-950/50 text-ens-200',
      icon: '🗳️',
      text: (
        <>
          <strong>{fmt(h.balance)} $ENS</strong> — your DAO voting power is active
          {h.delegated ? ' and delegated' : ''}. You could sell up to{' '}
          <strong>{fmt(h.safeToSell)} $ENS</strong> and keep full player benefits
          {!h.delegated && (
            <> · <a className="underline" href="https://agora.ensdao.org/delegates" target="_blank" rel="noreferrer">delegate to vote</a></>
          )}.
        </>
      ),
    },
    reduced: {
      tone: 'border-gold-500/40 bg-gold-500/10 text-gold-300',
      icon: '⚠️',
      text: (
        <>
          Your $ENS dropped to <strong>{fmt(h.balance)}</strong> (peak {fmt(h.peak)}).
          Holding below {fmt(h.threshold)} $ENS puts your holder benefits at risk —
          consider keeping your stake to preserve DAO voting power.
        </>
      ),
    },
    'sold-all': {
      tone: 'border-red-500/40 bg-red-950/40 text-red-300',
      icon: '🚫',
      text: (
        <>
          You sold all of your $ENS. <strong>Holder benefits are suspended</strong>:
          reduced daily chips and no “ENS Verified” badge, and you gave up your DAO
          vote. Re-acquire $ENS to restore full benefits.
        </>
      ),
    },
    none: {
      tone: 'border-white/10 bg-night-900/60 text-slate-300',
      icon: '✨',
      text: (
        <>
          Hold $ENS to unlock the “ENS Verified” badge, bonus daily chips, and a
          voice in ENS DAO governance. <Link href="/dao/" className="underline">Learn why it matters →</Link>
        </>
      ),
    },
  }[h.status];

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl border px-4 text-sm',
        compact ? 'py-2' : 'py-3',
        config.tone,
      )}
    >
      <span aria-hidden>{config.icon}</span>
      <p className="leading-relaxed">{config.text}</p>
    </div>
  );
}
