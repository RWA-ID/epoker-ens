'use client';
/**
 * Live table page: /table/?id=<tableId>
 * (query param instead of a dynamic segment so the site static-exports
 * cleanly for IPFS/ENS hosting).
 *
 * Flow: connect wallet → one-time sign-in signature → WebSocket to the
 * table's Durable Object → sit → play.
 */
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useSignMessage } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { useEnsIdentity } from '@/lib/ens';
import { ensureAuth, cachedSignature } from '@/lib/auth';
import { useTableSocket } from '@/lib/ws';
import { isMuted, setMuted } from '@/lib/sounds';
import { displayName, formatChips } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PokerTable } from '@/components/PokerTable';
import { ActionBar } from '@/components/ActionBar';
import { ChatPanel } from '@/components/ChatPanel';
import { HoldingsBanner } from '@/components/HoldingsBanner';

export default function TablePage() {
  return (
    <Suspense fallback={<PageNote text="Loading table…" />}>
      <TableInner />
    </Suspense>
  );
}

function TableInner() {
  const tableId = useSearchParams().get('id');
  const { open } = useAppKit();
  const { address, isConnected, ensName, avatar } = useEnsIdentity();
  const { signMessageAsync } = useSignMessage();

  const [sig, setSig] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [muted, setMutedState] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => setMutedState(isMuted()), []);
  useEffect(() => {
    if (address) setSig(cachedSignature(address));
  }, [address]);

  const signIn = async () => {
    if (!address) return;
    setSigning(true);
    setSignError(null);
    try {
      setSig(await ensureAuth(address, signMessageAsync));
    } catch (err) {
      setSignError(err instanceof Error ? err.message : 'Signature rejected');
    } finally {
      setSigning(false);
    }
  };

  const identity = useMemo(
    () => (address && sig ? { address: address.toLowerCase(), sig, ensName, avatar } : null),
    [address, sig, ensName, avatar],
  );

  const table = useTableSocket(tableId, identity);
  const { state } = table;

  // Auto-dismiss transient errors (illegal action, seat taken, …).
  useEffect(() => {
    if (!table.error) return;
    const t = setTimeout(table.clearError, 5000);
    return () => clearTimeout(t);
  }, [table.error]); // eslint-disable-line react-hooks/exhaustive-deps

  const copyInvite = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /* ---------- Guard rails ---------- */
  if (!tableId) return <PageNote text="No table id — head back to the lobby." lobby />;
  if (!isConnected) {
    return (
      <PageNote text="Connect your wallet to take a seat.">
        <Button onClick={() => open()}>Connect Wallet</Button>
      </PageNote>
    );
  }
  if (!sig) {
    return (
      <PageNote text="Sign once (gas-free) to prove wallet ownership to the table server.">
        <Button onClick={signIn} disabled={signing}>
          {signing ? 'Check your wallet…' : 'Sign In to Play'}
        </Button>
        {signError && <p className="text-xs text-red-400">{signError}</p>}
      </PageNote>
    );
  }
  if (!state) {
    return (
      <PageNote
        text={table.connected ? 'Syncing table state…' : 'Connecting to the table…'}
      />
    );
  }

  const me = state.yourSeat !== null ? state.seats.find((s) => s.seat === state.yourSeat) : undefined;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-10">
      {/* Table header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div>
          <h1 className="font-display text-xl text-slate-100">{state.name}</h1>
          <p className="text-xs text-slate-500">
            Blinds {state.smallBlind}/{state.bigBlind} · Buy-in {formatChips(state.buyIn)} ·{' '}
            {state.seats.length}/{state.maxPlayers} seated
            {!table.connected && <span className="text-red-400"> · reconnecting…</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => { setMuted(!muted); setMutedState(!muted); }}>
            {muted ? '🔇 Sounds off' : '🔊 Sounds on'}
          </Button>
          <Button variant="outline" size="sm" onClick={copyInvite}>
            {copied ? 'Copied!' : '🔗 Invite friends'}
          </Button>
          {me && (
            <Button variant="danger" size="sm" onClick={table.leave}>
              Leave table
            </Button>
          )}
          <Link href="/"><Button variant="ghost" size="sm">Lobby</Button></Link>
        </div>
      </div>

      {table.error && (
        <div className="mb-3 rounded-lg border border-red-500/40 bg-red-950/40 px-4 py-2 text-sm text-red-300">
          {table.error}
        </div>
      )}

      {/* Felt + chat */}
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div>
          <PokerTable state={state} onSit={table.sit} />
          <div className="mt-2">
            <ActionBar state={state} onAct={table.act} />
          </div>
          {/* Post-hand result + DAO nudge (product requirement #5) */}
          {table.lastResult && state.stage === 'showdown' && (
            <div className="mx-auto mt-3 max-w-3xl rounded-xl border border-gold-500/30 bg-night-900/90 px-4 py-3 text-center text-sm">
              {table.lastResult.winners.map((w, i) => (
                <p key={i} className="text-gold-300">
                  🏆 {displayName(w.ensName, w.address)} wins {formatChips(w.amount)}
                  {w.handName ? ` with ${w.handName}` : ''}
                </p>
              ))}
              <p className="mt-1 text-xs text-slate-500">
                Winners hold. So do DAO voters — keep your $ENS and make it count at{' '}
                <a href="https://agora.ensdao.org" target="_blank" rel="noreferrer" className="underline">
                  agora.ensdao.org
                </a>
              </p>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-4">
          <ChatPanel messages={table.chat} onSend={table.say} you={identity?.address} />
          <HoldingsBanner compact />
        </div>
      </div>
    </div>
  );
}

function PageNote({
  text,
  lobby = false,
  children,
}: {
  text: string;
  lobby?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-slate-400">{text}</p>
      {children}
      {lobby && (
        <Link href="/"><Button variant="outline">Back to Lobby</Button></Link>
      )}
    </div>
  );
}
