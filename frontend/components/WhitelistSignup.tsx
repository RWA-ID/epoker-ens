'use client';
/**
 * House Pass whitelist sign-up: a live counter, a waitlist and a one-click join.
 *
 * Everything that matters is decided by the worker (worker/src/whitelist.ts):
 * the session token proves the wallet, the primary key makes it one per
 * wallet, and the 3,333 sign-up limit (2,222 spots + 1,111 waitlist) is
 * enforced inside the INSERT. CCFF00 holders may join: the snapshot drops the
 * ones picked for the CCFF00 stage and the waitlist backfills their spots, in
 * the same order as the position shown here. This component only reports.
 *
 * The count refreshes every 15s, and immediately after a join, so the bar
 * moves for everyone watching it.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type WhitelistJoin, type WhitelistStatus } from '@/lib/api';
import { ensureAuth } from '@/lib/auth';
import { useIdentity } from '@/lib/identity';
import { useConnect, useWallet } from '@/lib/wallet';
import { Button } from '@/components/ui/button';

const REFUSED: Record<Extract<WhitelistJoin, { ok: false }>['reason'], string> = {
  full: 'The whitelist and its waitlist are both full.',
  closed: 'Whitelist sign-ups are closed.',
};

const n = (x: number) => x.toLocaleString('en-US');

/** What a joined wallet is told about where it stands. */
function standing(position: number, cap: number): string {
  return position <= cap
    ? `You’re #${n(position)} — inside the ${n(cap)} spots.`
    : `You’re #${n(position)} — waitlist #${n(position - cap)}. Spots open up as CCFF00 holders picked for stage 1 are taken off the list.`;
}

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
  const cap = data?.cap ?? 2222;
  const waitlist = data?.waitlist ?? 1111;
  const spotsTaken = Math.min(count, cap);
  const waitlisted = Math.max(0, count - cap);
  const full = count >= cap + waitlist;
  const joined = data?.joined === true;
  const pct = Math.min(100, (spotsTaken / cap) * 100);

  const join = async () => {
    if (!address) return open();
    setJoining(true);
    setMessage(null);
    try {
      const { token } = await ensureAuth(address, signMessage);
      const res = await api.joinWhitelist({ address, token });
      if (res.ok) {
        const lead = res.already ? 'This wallet is already signed up.' : 'You’re signed up.';
        const holder = res.holdsCcff00
          ? ' This wallet holds CCFF00: if it’s among the 3,333 longest holders at the snapshot, it mints in the CCFF00 stage and this spot passes down the list.'
          : '';
        setMessage({ tone: 'good', text: `${lead} ${standing(res.position, res.cap)}${holder}` });
      } else {
        setMessage({ tone: 'muted', text: REFUSED[res.reason] });
      }
      queryClient.setQueryData<WhitelistStatus>(['whitelist', address], {
        count: res.count,
        cap: res.cap,
        waitlist: res.waitlist,
        open: data?.open ?? true,
        joined: res.ok,
        position: res.ok ? res.position : undefined,
      });
    } catch (err) {
      setMessage({ tone: 'muted', text: err instanceof Error ? err.message : 'Sign-up failed' });
    } finally {
      setJoining(false);
    }
  };

  let label = count >= cap ? 'Join the waitlist' : 'Join the whitelist';
  if (!isConnected) label = 'Connect to join';
  else if (joined) label = data?.position && data.position > cap ? 'You’re on the waitlist' : 'You’re on the whitelist';
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
              <span className="text-acid">{n(spotsTaken)}</span>
              <span className="text-muted"> / {n(cap)} spots taken</span>
              {waitlisted > 0 && <span className="text-muted"> · {n(waitlisted)} waiting</span>}
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
        aria-valuenow={spotsTaken}
      >
        <div className="h-full rounded-full bg-acid transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>

      <p className="mt-3 text-[14px] leading-[1.5] text-muted">
        {n(cap)} free mints, one per wallet, plus a {n(waitlist)} waitlist. Sign in to join — a
        gas-free signature, no transaction. CCFF00 holders can join too: if you&rsquo;re picked for
        the CCFF00 stage, your spot passes to the next wallet in line.
      </p>

      {joined && data?.position && !message && (
        <p className="mt-3 text-[14px] leading-[1.5] text-acid" role="status">
          {standing(data.position, cap)}
        </p>
      )}

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
