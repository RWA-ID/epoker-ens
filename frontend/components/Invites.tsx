'use client';
/**
 * "You're invited" — the private tables this wallet is on the guest list for,
 * at the top of the lobby. Private tables are unlisted, so before this a guest
 * could only get in through the link.
 *
 * Reading them needs a session: a private table's id is the secret part of its
 * link, so the worker only hands invites to the signed-in guest. Without one we
 * offer a sign-in button rather than prompting a signature on page load.
 */
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cachedSession, ensureAuth } from '@/lib/auth';
import { useIdentity } from '@/lib/identity';
import { useWallet } from '@/lib/wallet';
import { formatChips } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export function Invites() {
  const { address, isConnected } = useIdentity();
  const { signMessage } = useWallet();
  const [signing, setSigning] = useState(false);
  const [signedIn, setSignedIn] = useState(0); // bumps the query after a sign-in

  const session = address ? cachedSession(address) : null;
  const { data } = useQuery({
    queryKey: ['invites', address?.toLowerCase(), signedIn],
    queryFn: () => api.invites({ address: address!, token: session!.token }),
    enabled: !!address && !!session,
    refetchInterval: 20_000,
  });

  if (!isConnected || !address) return null;

  if (!session) {
    return (
      <div className="mt-7 flex flex-wrap items-center justify-between gap-3 rounded-card border border-cream/[0.12] bg-night-900 px-5 py-4">
        <p className="text-[14.5px] text-muted">Invited to a private table? Sign in to see it here.</p>
        <Button
          variant="outline"
          disabled={signing}
          onClick={async () => {
            setSigning(true);
            try {
              await ensureAuth(address, signMessage);
              setSignedIn((n) => n + 1);
            } catch { /* declined in the wallet */ } finally {
              setSigning(false);
            }
          }}
          className="px-5 py-2.5 text-[13px]"
        >
          {signing ? 'Check your wallet…' : 'Show my invites'}
        </Button>
      </div>
    );
  }

  const invites = data?.invites ?? [];
  if (!invites.length) return null;

  return (
    <div className="mt-7">
      <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-acid">You’re invited</p>
      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr))]">
        {invites.map((t) => (
          <div
            key={t.id}
            className="relative rounded-card border border-acid/[0.4] bg-[linear-gradient(160deg,#12160a,#0a0b07_60%)] p-5"
          >
            <span className="absolute right-5 top-5 rounded-full bg-acid/[0.16] px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-acid">
              {t.hosting ? 'Hosting' : 'Private'}
            </span>
            <h3 className="hp-display hp-w80 max-w-[70%] truncate text-[22px] text-cream">{t.name}</h3>
            <p className="mt-1.5 font-mono text-[11.5px] text-faint">
              Blinds {t.smallBlind}/{t.smallBlind * 2} · Buy-in {formatChips(t.smallBlind * 2 * 100)} chips
              {t.space && ' · 🎙 Space'}
            </p>
            <Link href={`/table/?id=${t.id}`} className="mt-4 block">
              <Button className="w-full py-3">{t.hosting ? 'Back to your table' : 'Join table'}</Button>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
