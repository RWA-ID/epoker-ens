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
 *
 * All numbers are live on-chain reads — nothing here is mocked.
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
  const mono = 'font-mono text-gold-400';

  const config = {
    healthy: {
      tone: 'border-ens-400/25 bg-gradient-to-r from-ens-400/10 to-night-800/40',
      iconTone: 'bg-ens-400/15 text-ens-300',
      icon: '◈',
      title: `Full holder benefits active — ${fmt(h.balance)} $ENS${h.delegated ? ', delegated' : ''}.`,
      body: (
        <>
          Keeping ≥ 50% of your peak. Safe to sell{' '}
          <span className={mono}>{fmt(h.safeToSell)} $ENS</span> before perks are at risk
          {!h.delegated && (
            <>
              {' '}·{' '}
              <a
                className="underline"
                href="https://agora.ensdao.org/delegates"
                target="_blank"
                rel="noreferrer"
              >
                delegate to vote
              </a>
            </>
          )}
          .
        </>
      ),
    },
    reduced: {
      tone: 'border-gold-500/30 bg-gradient-to-r from-gold-500/10 to-night-800/40',
      iconTone: 'bg-gold-500/15 text-gold-400',
      icon: '⚠',
      title: `Your $ENS dropped to ${fmt(h.balance)} (peak ${fmt(h.peak)}).`,
      body: (
        <>
          Holding below <span className={mono}>{fmt(h.threshold)} $ENS</span> puts your holder
          benefits at risk — consider keeping your stake to preserve DAO voting power.
        </>
      ),
    },
    'sold-all': {
      tone: 'border-red-400/30 bg-gradient-to-r from-red-400/10 to-night-800/40',
      iconTone: 'bg-red-400/15 text-red-300',
      icon: '✕',
      title: 'You sold all of your $ENS — holder benefits are suspended.',
      body: (
        <>
          Reduced daily chips, no “ENS Verified” badge, and you gave up your DAO vote.
          Re-acquire $ENS to restore full benefits.
        </>
      ),
    },
    none: {
      tone: 'border-white/10 bg-night-850/60',
      iconTone: 'bg-white/5 text-slate-400',
      icon: '✦',
      title: 'Hold $ENS to unlock holder perks.',
      body: (
        <>
          The “ENS Verified” badge, bonus daily chips, and a voice in ENS DAO governance.{' '}
          <Link href="/dao/" className="underline">
            Learn why it matters →
          </Link>
        </>
      ),
    },
  }[h.status];

  return (
    <div
      className={cn(
        'flex items-center gap-4 rounded-2xl border',
        compact ? 'px-4 py-3' : 'px-6 py-5',
        config.tone,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex shrink-0 items-center justify-center rounded-xl text-lg',
          compact ? 'h-9 w-9' : 'h-11 w-11',
          config.iconTone,
        )}
      >
        {config.icon}
      </span>
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-slate-100">{config.title}</p>
        <p className={cn('mt-1 leading-relaxed text-slate-400', compact && 'text-[13px]')}>
          {config.body}
        </p>
      </div>
    </div>
  );
}
