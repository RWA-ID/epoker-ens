'use client';
/**
 * Live table page: /table/?id=<tableId>
 * (query param instead of a dynamic segment so the site static-exports
 * cleanly for IPFS/ENS hosting).
 *
 * Flow: connect wallet → one-time sign-in signature → WebSocket to the
 * table's Durable Object → sit → play.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useConnect, useWallet } from '@/lib/wallet';
import { useIdentity } from '@/lib/identity';
import { ensureAuth, cachedSignature } from '@/lib/auth';
import { useTableSocket } from '@/lib/ws';
import { isMuted, setMuted } from '@/lib/sounds';
import { displayName, formatChips, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PokerTable } from '@/components/PokerTable';
import { ActionBar } from '@/components/ActionBar';
import { ChatPanel } from '@/components/ChatPanel';
import {
  TILT_QUERY, PORTRAIT_PHONE_QUERY, useMediaQuery, enterTiltMode, canForceTilt,
} from '@/lib/tilt';

const STAGE_LABEL: Record<string, string> = {
  waiting: 'Waiting', preflop: 'Pre-flop', flop: 'Flop',
  turn: 'Turn', river: 'River', showdown: 'Showdown',
};

export default function TablePage() {
  return (
    <Suspense fallback={<PageNote text="Loading table…" />}>
      <TableInner />
    </Suspense>
  );
}

function TableInner() {
  const tableId = useSearchParams().get('id');
  const open = useConnect();
  const { address, isConnected, isRestoring, handle, avatar } = useIdentity();
  const { signMessage } = useWallet();

  const [sig, setSig] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [muted, setMutedState] = useState(false);
  const [copied, setCopied] = useState(false);
  const tilt = useMediaQuery(TILT_QUERY);
  const portraitPhone = useMediaQuery(PORTRAIT_PHONE_QUERY);
  const [hideTiltHint, setHideTiltHint] = useState(false);

  useEffect(() => setMutedState(isMuted()), []);
  // Tilt mode is a fixed full-screen layer; stop the page under it scrolling.
  useEffect(() => {
    if (!tilt) return;
    const root = document.documentElement;
    root.style.overflow = 'hidden';
    return () => { root.style.overflow = ''; };
  }, [tilt]);
  useEffect(() => {
    if (address) setSig(cachedSignature(address));
  }, [address]);

  const signIn = async () => {
    if (!address) return;
    setSigning(true);
    setSignError(null);
    try {
      setSig(await ensureAuth(address, signMessage));
    } catch (err) {
      setSignError(err instanceof Error ? err.message : 'Signature rejected');
    } finally {
      setSigning(false);
    }
  };

  // Auto-prompt the one-time sign-in as soon as the wallet is connected, so
  // joining a table is just Join → confirm in wallet (no extra click). A
  // cached signature resolves silently; a rejection falls back to the manual
  // retry button below. One attempt per address.
  const autoSignedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!isConnected || !address || sig) return;
    if (autoSignedFor.current === address) return;
    autoSignedFor.current = address;
    signIn();
  }, [isConnected, address, sig]); // eslint-disable-line react-hooks/exhaustive-deps

  const identity = useMemo(
    () => (address && sig ? { address: address.toLowerCase(), sig, handle, avatar } : null),
    [address, sig, handle, avatar],
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
  // A full page load rebuilds the WalletConnect session; throughout that
  // window isConnected is false. Branching on it alone tells somebody who
  // connected thirty seconds ago to connect again.
  if (isRestoring) return <PageNote text="Reconnecting your wallet…" />;
  if (!isConnected) {
    return (
      <PageNote text="Connect your wallet to take a seat.">
        <Button onClick={() => open()}>Sign in</Button>
      </PageNote>
    );
  }
  if (!sig) {
    return (
      <PageNote
        text={
          signing
            ? 'Confirm the sign-in request in your wallet — gas-free, proves wallet ownership.'
            : 'Sign once (gas-free) to prove wallet ownership to the table server.'
        }
      >
        {!signing && <Button onClick={signIn}>Sign In to Play</Button>}
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
  const inHand = state.stage !== 'waiting';

  // Betting controls + the last result: under the felt normally, in the side
  // column in tilt mode (a landscape phone has no height to spare below it).
  const controls = (
    <>
      <div className="mt-4 tilt:mt-0">
        <ActionBar state={state} onAct={table.act} />
      </div>
      {table.lastResult && state.stage === 'showdown' && (
        <div className="mx-auto mt-4 max-w-3xl rounded-2xl border border-acid-400/30 bg-gradient-to-b from-[#141a08]/80 to-night-850/80 px-5 py-4 text-center text-sm tilt:mt-0 tilt:w-full tilt:px-3 tilt:py-2">
          {table.lastResult.winners.map((w, i) => (
            <p key={i} className="hp-display hp-w85 text-base text-acid tilt:text-sm">
              🏆 {displayName(w.handle, w.address)} wins {formatChips(w.amount)}
              {w.handName ? ` with ${w.handName}` : ''}
            </p>
          ))}
        </div>
      )}
    </>
  );

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-14 pt-7 sm:px-7 tilt:fixed tilt:inset-0 tilt:z-[60] tilt:flex tilt:max-w-none tilt:flex-col tilt:overflow-hidden tilt:bg-night-950 tilt:pb-2 tilt:pl-[max(12px,env(safe-area-inset-left))] tilt:pr-[max(12px,env(safe-area-inset-right))] tilt:pt-2">
      {/* Table header bar */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3.5 tilt:mb-1.5 tilt:flex-nowrap tilt:gap-2">
        <div className="flex min-w-0 items-center gap-3.5 tilt:gap-2">
          <Link href="/">
            <Button variant="ghost" size="sm" className="border border-white/10 bg-white/[0.04] tilt:px-2.5 tilt:py-1.5">
              ← Lobby
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="hp-display hp-w80 truncate text-[22px] leading-tight text-cream tilt:text-base">
              {state.name}
            </h1>
            <p className="mt-0.5 font-mono text-xs text-dim tilt:hidden">
              Blinds {state.smallBlind} / {state.bigBlind} · Stack {formatChips(state.buyIn)} ·{' '}
              {state.seats.length} / {state.maxPlayers} seated
              {state.isPrivate && ` · ${state.whitelist?.length ?? 0} invited`}
              {inHand && ` · Hand #${state.handNumber}`}
              {!table.connected && <span className="text-red-400"> · reconnecting…</span>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 tilt:shrink-0 tilt:flex-nowrap tilt:gap-1.5">
          {state.practice && (
            <span className="flex items-center gap-1.5 rounded-full border border-acid-400/30 bg-acid-400/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-acid tilt:hidden">
              Practice · vs bots
            </span>
          )}
          {state.isPrivate && (
            <span className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted tilt:hidden">
              🔒 Private
            </span>
          )}
          {!table.connected && (
            <span className="hidden text-[11px] text-red-400 tilt:inline">reconnecting…</span>
          )}
          <span
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] tilt:px-2.5 tilt:py-1 tilt:text-[10px]',
              inHand
                ? 'border-green-400/30 bg-green-400/10 text-green-400'
                : 'border-acid-400/30 bg-acid-400/10 text-acid',
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                inHand ? 'animate-pulse bg-green-400' : 'bg-acid',
              )}
            />
            {inHand ? `In hand · ${STAGE_LABEL[state.stage]}` : 'Waiting for players'}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="tilt:px-2 tilt:py-1.5"
            aria-label={muted ? 'Sounds off' : 'Sounds on'}
            onClick={() => { setMuted(!muted); setMutedState(!muted); }}
          >
            {muted ? '🔇' : '🔊'}
            <span className="tilt:hidden">{muted ? 'Sounds off' : 'Sounds on'}</span>
          </Button>
          <Button variant="outline" size="sm" className="tilt:hidden" onClick={copyInvite}>
            {copied ? 'Copied!' : '🔗 Invite'}
          </Button>
          {me && (
            <Button variant="danger" size="sm" className="tilt:px-2.5 tilt:py-1.5" onClick={table.leave}>
              Leave<span className="tilt:hidden">&nbsp;table</span>
            </Button>
          )}
        </div>
      </div>

      {/* Portrait phone: point at tilt mode */}
      {portraitPhone && !hideTiltHint && (
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-acid-400/25 bg-acid-400/[0.06] px-3.5 py-2 text-xs text-muted">
          <span className="flex-1">Turn your phone sideways for tilt mode, a full-screen table.</span>
          {canForceTilt() && (
            <button onClick={enterTiltMode} className="font-semibold uppercase tracking-[0.1em] text-acid">
              Go
            </button>
          )}
          <button onClick={() => setHideTiltHint(true)} aria-label="Dismiss" className="px-1 text-dim">
            ✕
          </button>
        </div>
      )}

      {table.error && (
        <div className="mb-3 rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-2 text-sm text-red-300 tilt:absolute tilt:left-1/2 tilt:top-12 tilt:z-30 tilt:mb-0 tilt:-translate-x-1/2 tilt:bg-red-950/95">
          {table.error}
        </div>
      )}

      {/* Private table, and you're not on the guest list → spectate only */}
      {state.isPrivate && !state.canSit && state.yourSeat === null && (
        <div className="mb-3 rounded-xl border border-acid-400/30 bg-acid-400/10 px-4 py-2.5 text-sm text-acid tilt:hidden">
          🔒 This is a private table — only names on the host’s guest list can take a seat.
          You’re welcome to watch and chat.
        </div>
      )}

      {/* Guest list, shown while the private table fills up */}
      {state.isPrivate && !!state.whitelist?.length && !inHand && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-dim tilt:hidden">
          <span className="mr-1 font-semibold uppercase tracking-[0.14em] text-dim">
            Guest list:
          </span>
          {state.whitelist.map((g) => {
            const seated = state.seats.some((s) => s.address === g.address);
            return (
              <span
                key={g.address}
                className={cn(
                  'rounded-full border px-2.5 py-1 font-mono text-[11px]',
                  seated
                    ? 'border-green-400/30 bg-green-400/10 text-green-400'
                    : 'border-white/10 text-muted',
                )}
              >
                {displayName(g.handle, g.address)}
                {seated && ' ✓'}
              </span>
            );
          })}
        </div>
      )}

      {/* Felt + chat */}
      <div className="grid gap-5 lg:grid-cols-[1fr_320px] tilt:min-h-0 tilt:flex-1 tilt:grid-cols-[1fr_minmax(210px,32%)] tilt:gap-3">
        <div className="tilt:flex tilt:min-h-0 tilt:items-center tilt:justify-center">
          {/* In tilt mode the felt is sized by height: 3:2 art, minus the header */}
          <div className="tilt:w-[min(100%,calc((100dvh-60px)*1.5))]">
            <PokerTable state={state} onSit={table.sit} />
          </div>
          {!tilt && controls}
        </div>
        {/* lg: absolute inset pins the sidebar to the felt column's height, so
            chat scrolls internally instead of growing the page as messages arrive */}
        <div className="lg:relative tilt:flex tilt:min-h-0 tilt:flex-col">
          <div className="flex flex-col gap-4 lg:absolute lg:inset-0 tilt:min-h-0 tilt:flex-1 tilt:gap-2 tilt:overflow-y-auto">
            {tilt && controls}
            <ChatPanel messages={table.chat} onSend={table.say} you={identity?.address} />
          </div>
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
      <p className="text-muted">{text}</p>
      {children}
      {lobby && (
        <Link href="/"><Button variant="outline">Back to Lobby</Button></Link>
      )}
    </div>
  );
}
