'use client';
/** Top navigation: gold-gradient brand, active-link underline, ENS-aware connect pill. */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAppKit } from '@reown/appkit/react';
import { useEnsIdentity, useEnsHoldings } from '@/lib/ens';
import { displayName, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const NAV = [
  { href: '/', label: 'Lobby' },
  { href: '/leaderboard/', label: 'Leaderboard' },
  { href: '/profile/', label: 'Profile' },
  { href: '/dao/', label: 'ENS & DAO' },
];

export function Header() {
  const pathname = usePathname();
  const { open } = useAppKit();
  const { address, isConnected, ensName, avatar } = useEnsIdentity();
  const holdings = useEnsHoldings();

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname?.startsWith(href.replace(/\/$/, ''));

  return (
    <header className="sticky top-0 z-40 border-b border-gold-500/15 bg-night-950/80 backdrop-blur-md">
      <div className="mx-auto flex h-[70px] max-w-6xl items-center justify-between gap-4 px-4 sm:px-7">
        <Link href="/" className="flex items-baseline gap-3">
          <span className="gold-text font-display text-2xl font-bold">epoker.eth</span>
          <span className="hidden text-[10px] font-semibold uppercase tracking-[0.32em] text-slate-500 sm:inline">
            ENS&nbsp;Hold’em
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'relative px-4 py-2 text-[13.5px] font-medium transition-colors',
                  active ? 'text-gold-200' : 'text-slate-400 hover:text-gold-200',
                )}
              >
                {item.label}
                <span
                  className={cn(
                    'absolute inset-x-4 bottom-0.5 h-[1.5px] rounded-full bg-gradient-to-r from-gold-500 to-gold-300 transition-opacity',
                    active ? 'opacity-100' : 'opacity-0',
                  )}
                />
              </Link>
            );
          })}
        </nav>

        {isConnected && address ? (
          <button
            onClick={() => open()}
            className="flex items-center gap-2 rounded-full border border-gold-500/30 bg-night-800/90 py-1 pl-1 pr-3.5 transition-all hover:border-gold-500/60 hover:shadow-gold"
          >
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" className="h-[30px] w-[30px] rounded-full object-cover" />
            ) : (
              <span className="gold-fill flex h-[30px] w-[30px] items-center justify-center rounded-full font-display text-sm font-bold text-ink ring-[1.5px] ring-inset ring-white/25">
                {displayName(ensName, address).slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="max-w-36 truncate text-[13.5px] text-slate-200">
              {displayName(ensName, address)}
            </span>
            {holdings.isVerifiedHolder && (
              <span
                title="ENS Verified — this wallet holds $ENS"
                className="gold-fill flex h-4 w-4 items-center justify-center rounded-full text-[10px] text-ink"
              >
                ✓
              </span>
            )}
          </button>
        ) : (
          <Button size="sm" variant="gold" onClick={() => open()}>Connect Wallet</Button>
        )}
      </div>

      {/* Mobile nav — the desktop links are hidden below md */}
      <nav className="flex items-center gap-1.5 overflow-x-auto px-4 pb-2.5 md:hidden">
        {NAV.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition-colors',
                active
                  ? 'border-gold-500/40 bg-gold-500/10 text-gold-200'
                  : 'border-white/10 text-slate-400 hover:text-gold-200',
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
