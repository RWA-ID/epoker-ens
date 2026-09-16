'use client';
/**
 * Sticky header: mark, anchor nav, online pill, account control.
 *
 * The account control is a menu rather than a bare `open()` call. Disconnect
 * used to be reachable only from inside AppKit's own account view, which left
 * the cached sign-in signature behind — so the app stayed "signed in" to a
 * wallet that had gone.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAppKit } from '@reown/appkit/react';
import { useIdentity } from '@/lib/identity';
import { useConnect, useWallet } from '@/lib/wallet';
import { clearSignature } from '@/lib/auth';
import { resetWalletSession } from '@/lib/session';
import { displayName, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/Avatar';
import { Mark } from '@/components/Mark';

const NAV = [
  { href: '/#lobby', label: 'Lobby' },
  { href: '/#how', label: 'How it works' },
  { href: '/#ranks', label: 'Ranks' },
  { href: '/#faq', label: 'FAQ' },
];

export function Header() {
  const pathname = usePathname();
  const { open } = useAppKit();
  const connect = useConnect();
  const { disconnect: disconnectWallet } = useWallet();
  const { address, source, handle, avatar, isConnected, isRestoring } = useIdentity();

  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  useEffect(() => setMenuOpen(false), [pathname]);

  const disconnect = async () => {
    setBusy(true);
    const who = address;
    // Bounded inside useWallet — falling through to the local clear is the point.
    await disconnectWallet();
    if (who) clearSignature(who);
    setBusy(false);
    setMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-acid/[0.16] bg-night-950/[0.82] backdrop-blur-[14px]">
      <div className="mx-auto flex max-w-shell flex-wrap items-center justify-between gap-5 px-[22px] py-[14px]">
        <Link href="/" aria-label="HoodPoker home">
          <Mark size={24} />
        </Link>

        <nav className="flex flex-wrap items-center gap-[26px]">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="font-mono text-[11.5px] uppercase tracking-[0.16em] text-dim transition-colors hover:text-acid"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <span className="hidden items-center gap-2 sm:flex">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-acid" />
            <span className="font-mono text-[11.5px] text-dim">Tables live</span>
          </span>

          {/* Restoring a stored session is NOT the same as disconnected —
              showing a Connect button here is how a connected player gets told
              to connect. */}
          {isRestoring ? (
            <span className="flex items-center gap-2 rounded-btn border border-cream/[0.16] px-[13px] py-[9px] font-mono text-[11px] text-dim">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-acid" />
              Reconnecting…
            </span>
          ) : isConnected && address ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="flex items-center gap-2 rounded-btn border border-acid/40 bg-acid/[0.07] py-1 pl-1 pr-3 transition-colors hover:border-acid"
              >
                <Avatar record={avatar} handle={handle} address={address} size={28} className="h-7 w-7" monogramClassName="text-[12px] rounded-full" />
                <span className="max-w-32 truncate font-mono text-[11.5px] text-cream">
                  {displayName(handle, address)}
                </span>
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-card border border-cream/[0.12] bg-night-900 shadow-[0_18px_44px_rgba(0,0,0,0.7)]"
                >
                  <div className="border-b border-cream/[0.08] px-4 py-3">
                    <p className="hp-display hp-w85 truncate text-[15px] text-cream">
                      {displayName(handle, address)}
                    </p>
                    <p className="mt-1 truncate font-mono text-[10.5px] text-faint">
                      {address.toLowerCase()}
                    </p>
                  </div>
                  {source === 'passkey' ? (
                    <p className="px-4 py-2.5 font-mono text-[10.5px] text-faint">Signed in with a passkey</p>
                  ) : (
                    <MenuItem onClick={() => { setMenuOpen(false); open(); }}>Wallet details</MenuItem>
                  )}
                  <MenuItem onClick={disconnect} disabled={busy} tone="danger">
                    {busy ? 'Disconnecting…' : 'Disconnect'}
                  </MenuItem>
                  <button
                    onClick={() => resetWalletSession()}
                    className="w-full border-t border-cream/[0.08] px-4 py-2.5 text-left font-mono text-[10.5px] text-faint transition-colors hover:bg-cream/5 hover:text-dim"
                    title="Clears the stored WalletConnect session (including IndexedDB) and reloads"
                  >
                    Wallet stuck? Reset session
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Button size="md" className="shadow-none hover:shadow-header" onClick={connect}>
              Sign in
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

function MenuItem({
  onClick,
  disabled,
  tone = 'default',
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
  children: React.ReactNode;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'w-full px-4 py-2.5 text-left font-mono text-[11.5px] transition-colors disabled:opacity-40',
        tone === 'danger'
          ? 'text-red-300 hover:bg-red-400/10'
          : 'text-dim hover:bg-cream/5 hover:text-cream',
      )}
    >
      {children}
    </button>
  );
}
