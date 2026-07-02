'use client';
/** Top navigation: brand, section links, ENS-aware connect button. */
import Link from 'next/link';
import { useAppKit } from '@reown/appkit/react';
import { useEnsIdentity, useEnsHoldings } from '@/lib/ens';
import { displayName } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EnsBadge } from '@/components/EnsBadge';

const NAV = [
  { href: '/', label: 'Lobby' },
  { href: '/leaderboard/', label: 'Leaderboard' },
  { href: '/profile/', label: 'Profile' },
  { href: '/dao/', label: 'ENS & DAO' },
];

export function Header() {
  const { open } = useAppKit();
  const { address, isConnected, ensName, avatar } = useEnsIdentity();
  const holdings = useEnsHoldings();

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-night-950/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="font-display text-xl text-gold-400">epoker.eth</span>
          <span className="hidden text-[10px] uppercase tracking-[0.2em] text-slate-500 sm:inline">
            ENS High Roller Table
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {isConnected && address ? (
          <button
            onClick={() => open()}
            className="flex items-center gap-2 rounded-full border border-white/10 bg-night-900 py-1.5 pl-1.5 pr-4 transition-colors hover:border-ens-400/50"
          >
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" className="h-7 w-7 rounded-full object-cover" />
            ) : (
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ens-800 text-xs">
                {displayName(ensName, address).slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="text-sm text-slate-200">{displayName(ensName, address)}</span>
            {holdings.isVerifiedHolder && <EnsBadge />}
          </button>
        ) : (
          <Button size="sm" onClick={() => open()}>Connect Wallet</Button>
        )}
      </div>
    </header>
  );
}
