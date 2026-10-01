'use client';
/**
 * House Pass whitelist sign-up: a live counter and a one-click join.
 *
 * Everything that matters is decided by the worker (worker/src/whitelist.ts):
 * the session token proves the wallet, the primary key makes it one spot per
 * wallet, the cap is enforced inside the INSERT, and CCFF00 holders are turned
 * away there — they mint in their own stage. This component only reports.
 *
 * The count refreshes every 15s while the tab is visible, and immediately
 * after a join, so the bar moves for everyone watching it.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type WhitelistJoin } from '@/lib/api';
import { ensureAuth } from '@/lib/auth';
import { useIdentity } from '@/lib/identity';
import { useConnect, useWallet } from '@/lib/wallet';
import { Button } from '@/components/ui/button';

const REFUSED: Record<Extract<WhitelistJoin, { ok: false }>['reason'], string> = {
  ccff00: 'This wallet holds CCFF00, so it already mints free in the CCFF00 stage. The whitelist is for everyone else.',
  full: 'All 1,111 spots are taken.',
  closed: 'Whitelist sign-ups are closed.',
  unavailable: 'Couldn’t reach Robinhood Chain to check this wallet — that RPC drops calls. Try again.',
};

export function WhitelistSignup() {
  const { address, isConnected } = useIdentity();
  const { signMessage } = useWallet();
  const open = useConnect();
  const queryClient = useQueryClient();
  const [joining, setJoining] = useState(false);
  const [message, setMessage] = useState<{ tone: 'good' | 'muted'; text: string } | null>(null);

  const { data, isError } = useQuery({
    queryKey: ['whitelist', address ?? null],
    queryFn: () => api.whitelist(address ?? undefined),
    refetchInterval: 15000,
  });

  const count = data?.count ?? 0;
  const cap = data?.cap ?? 1111;
  const full = count >= cap;
  const joined = data?.joined === true;
  const pct = Math.min(100, (count / cap) * 100);

  const join = async () => {
    if (!address) return open();
    setJoining(true);
    setMessage(null);
    try {
      const { token } = await ensureAuth(address, signMessage);
      const res = await api.joinWhitelist({ address, token });
      if (res.ok) {
        setMessage({
          tone: 'good',
          text: res.already ? 'This wallet is already on the whitelist.' : 'You’re on the whitelist — one free pass.',
        });
      } else {
        setMessage({ tone: 'muted', text: REFUSED[res.reason] });
      }
      queryClient.setQueryData(['whitelist', address], {
        count: res.count,
        cap: res.cap,
        open: data?.open ?? true,
        joined: res.ok,
      });
    } catch (err) {
      setMessage({ tone: 'muted', text: err instanceof Error ? err.message : 'Sign-up failed' });
    } finally {
      setJoining(false);
    }
  };

  let label = 'Join the whitelist';
  if (!isConnected) label = 'Connect to join';
  else if (joined) label = 'You’re on the whitelist';
  else if (joining) label = 'Signing in…';
  else if (full) label = 'Whitelist full';
  else if (data && !data.open) label = 'Sign-ups closed';

  return (
    <div className="mt-4 rounded-card border border-cream/10 bg-night-900 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">Whitelist</p>
        <p className="font-mono text-[12px] tabular-nums text-cream" aria-live="polite">
          {data ? (
            <>
              <span className="text-acid">{count.toLocaleString('en-US')}</span>
              <span className="text-muted"> / {cap.toLocaleString('en-US')} spots taken</span>
            </>
          ) : isError ? (
            <span className="text-muted">count unavailable</span>
          ) : (
            <span className="text-muted">loading…</span>
          )}
        </p>
      </div>

      <div
        className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-cream/10"
        role="progressbar"
        aria-label="Whitelist spots taken"
        aria-valuemin={0}
        aria-valuemax={cap}
        aria-valuenow={count}
      >
        <div className="h-full rounded-full bg-acid transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>

      <p className="mt-3 text-[14px] leading-[1.5] text-muted">
        1,111 free mints, one per wallet. Sign in to take a spot — it&rsquo;s a gas-free
        signature, no transaction. CCFF00 holders mint in their own stage.
      </p>

      <Button
        className="mt-3.5 w-full"
        onClick={join}
        disabled={joining || joined || (isConnected && (full || (!!data && !data.open)))}
      >
        {label}
      </Button>

      {message && (
        <p
          className={message.tone === 'good' ? 'mt-3 text-[14px] leading-[1.5] text-acid' : 'mt-3 text-[14px] leading-[1.5] text-muted'}
          role="status"
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
