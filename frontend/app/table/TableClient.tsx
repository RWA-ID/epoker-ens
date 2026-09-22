'use client';
/**
 * Live table page: /table/?id=<tableId>
 * (query param instead of a dynamic segment so the site static-exports
 * cleanly for IPFS/ENS hosting).
 *
 * Flow: connect wallet → Sign-In with Ethereum (one signature, 24h session)
 * → WebSocket to the table's Durable Object → sit → play.
 *
 * Layout (from the Claude Design table handoff):
 *   desktop     header bar · felt + betting dock · Chat/Hand log docked right
 *   phone       header bar · felt + betting dock · Chat button → bottom drawer
 *   full screen a fixed layer over the whole viewport; landscape puts the dock
 *               beside the felt. "Rotate" turns it 90° for portrait-locked
 *               wallet browsers. A landscape phone enters it automatically.
 */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useConnect, useWallet } from '@/lib/wallet';
import { useIdentity } from '@/lib/identity';
import { ensureAuth, cachedSession, clearSession, type AuthSession } from '@/lib/auth';
import { useTableSocket } from '@/lib/ws';
import type { TableView } from '@/lib/types';
import { installAudioUnlock, isMuted, setMuted, unlockAudio } from '@/lib/sounds';
import { displayName, formatChips, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PokerTable } from '@/components/PokerTable';
import { ActionBar } from '@/components/ActionBar';
import { TableDrawer, TablePanel, type PanelTab } from '@/components/TablePanel';
import { ChatIcon, CollapseIcon, ExpandIcon, LinkIcon, RotateIcon, SoundIcon } from '@/components/TableIcons';
import {
  TILT_QUERY, useMediaQuery, requestNativeFullscreen, exitNativeFullscreen,
  lockLandscape, unlockOrientation, readRotatePref, writeRotatePref, nextRotation, type Rotation,
} from '@/lib/tilt';

const STAGE_LABEL: Record<string, string> = {
  waiting: 'Waiting', preflop: 'Pre-flop', flop: 'Flop',
  turn: 'Turn', river: 'River', showdown: 'Showdown',
};

/**
 * Portrait viewport turned sideways: the box is sized to the viewport's
 * height × width, rotated about its top-left corner, then slid back on screen.
 * Touch hit-testing follows CSS transforms, so every button and the slider
 * keep working. Both directions exist because a player may turn the phone
 * either way.
 */
function rotatedStyle(rotation: 90 | 270): React.CSSProperties {
  return {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100dvh',
    height: '100dvw',
    transform: rotation === 90 ? 'translateX(100dvw) rotate(90deg)' : 'translateY(100dvh) rotate(-90deg)',
    transformOrigin: 'top left',
  };
}

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
  const { address, isConnected, isRestoring, handle, isLoadingHandle } = useIdentity();
  const { signMessage } = useWallet();

  const [session, setSession] = useState<AuthSession | null>(null);
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);

  useEffect(() => {
    setSession(address ? cachedSession(address) : null);
  }, [address]);

  // Sessions last 24h. When one runs out mid-visit, drop it so the page asks
  // for a fresh signature instead of reconnecting with a dead token forever.
  useEffect(() => {
    if (!session || !address) return;
    const ms = session.expiresAt - Date.now() - 60_000;
    const t = setTimeout(() => { clearSession(address); setSession(null); }, Math.max(0, ms));
    return () => clearTimeout(t);
  }, [session, address]);

  const signIn = async () => {
    if (!address) return;
    setSigning(true);
    setSignError(null);
    try {
      setSession(await ensureAuth(address, signMessage));
    } catch (err) {
      setSignError(err instanceof Error ? err.message : 'Signature rejected');
    } finally {
      setSigning(false);
    }
  };

  // Auto-prompt sign-in as soon as the wallet is connected, so joining a
  // table is just Join → confirm in wallet. A cached session resolves
  // silently; a rejection falls back to the manual retry button below. One
  // attempt per address.
  const autoSignedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!isConnected || !address || session) return;
    if (autoSignedFor.current === address) return;
    autoSignedFor.current = address;
    signIn();
  }, [isConnected, address, session]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hold the socket until the name lookup settles. The server only reads the
  // handle when a socket opens, so connecting while the hoodfi lookup is still
  // in flight seated the player as a bare address. Bounded: a throttled RPC
  // shouldn't keep anyone off the table.
  const [handleWaitOver, setHandleWaitOver] = useState(false);
  useEffect(() => {
    setHandleWaitOver(false);
    const t = setTimeout(() => setHandleWaitOver(true), 6000);
    return () => clearTimeout(t);
  }, [address]);
  const handleReady = !isLoadingHandle || handleWaitOver;

  const identity = useMemo(
    () => (address && session && handleReady ? { address: address.toLowerCase(), token: session.token, handle } : null),
    [address, session, handleReady, handle],
  );

  const table = useTableSocket(tableId, identity);
  const { state } = table;

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
  if (!session) {
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

  return <TableScreen table={table} state={state} you={identity?.address} />;
}

/** Everything the socket drives — rendered with a live table, or a mock in tests. */
export type TableConnection = Pick<
  ReturnType<typeof useTableSocket>,
  'chat' | 'log' | 'lastResult' | 'error' | 'connected' | 'clearError' | 'sit' | 'leave' | 'act' | 'say'
>;

export function TableScreen({
  table,
  state,
  you,
}: {
  table: TableConnection;
  state: TableView;
  you: string | undefined;
}) {
  const [muted, setMutedState] = useState(false);
  const [copied, setCopied] = useState(false);
  const [full, setFull] = useState(false);
  const [rotatePref, setRotatePref] = useState<Rotation | null>(null);
  const [panelTab, setPanelTab] = useState<PanelTab>('chat');
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Chat replayed on connect is history, not news — only later lines badge.
  const [chatSeenTs, setChatSeenTs] = useState(() => Date.now());

  const tilt = useMediaQuery(TILT_QUERY);
  const portrait = useMediaQuery('(orientation: portrait)');
  const desktop = useMediaQuery('(min-width: 1024px)');
  const touch = useMediaQuery('(pointer: coarse)');
  // Full screen on a phone held upright means "give me a landscape table", so
  // until the player picks otherwise it turns sideways by default.
  const rotation: Rotation = rotatePref ?? (touch ? 90 : 0);

  useEffect(() => {
    setMutedState(isMuted());
    setRotatePref(readRotatePref());
    installAudioUnlock();
  }, []);

  // Full screen is a fixed layer; stop the page under it scrolling.
  const layer = full || tilt;
  useEffect(() => {
    if (!layer) return;
    const root = document.documentElement;
    root.style.overflow = 'hidden';
    return () => { root.style.overflow = ''; };
  }, [layer]);

  // Leaving native full screen (Esc, Android back) leaves our layer too.
  const nativeFull = useRef(false);
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement && nativeFull.current) {
        nativeFull.current = false;
        unlockOrientation();
        setFull(false);
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFull = async () => {
    if (full) {
      setFull(false);
      nativeFull.current = false;
      unlockOrientation();
      await exitNativeFullscreen();
      return;
    }
    setFull(true);
    nativeFull.current = await requestNativeFullscreen();
    // Android turns the real screen; everywhere else the CSS rotation
    // (`rotation` above) takes over because the page stays portrait.
    if (nativeFull.current && touch) await lockLandscape();
  };

  // Auto-dismiss transient errors (illegal action, seat taken, …).
  useEffect(() => {
    if (!table.error) return;
    const t = setTimeout(table.clearError, 5000);
    return () => clearTimeout(t);
  }, [table.error]); // eslint-disable-line react-hooks/exhaustive-deps

  const docked = desktop && !layer;
  // Desktop full screen has room beside a 3:2 felt, so the chat lives in that
  // column instead of leaving it black with the dock alone at the bottom.
  // (A landscape desktop is never the CSS-rotated case, which is portrait.)
  const sideDock = layer && desktop && !portrait;
  // Everything in the chat counts as read while you can see it.
  const lastChatTs = table.chat[table.chat.length - 1]?.ts ?? 0;
  const chatVisible = docked || sideDock ? panelTab === 'chat' : drawerOpen && panelTab === 'chat';
  useEffect(() => {
    if (chatVisible) setChatSeenTs(lastChatTs);
  }, [chatVisible, lastChatTs]);
  const unread = chatVisible ? 0 : table.chat.filter((m) => m.ts > chatSeenTs && m.address !== you).length;

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked */ }
  };

  const toggleSound = () => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
    if (!next) unlockAudio(); // this click is the gesture mobile needs
  };

  const me = state.yourSeat !== null ? state.seats.find((s) => s.seat === state.yourSeat) : undefined;
  const inHand = state.stage !== 'waiting';
  const rotated = full && portrait && rotation !== 0 ? rotation : null;
  const wide = layer && (!!rotated || !portrait);

  const panel = (onClose?: () => void) => (
    <TablePanel
      tab={panelTab}
      onTab={setPanelTab}
      chat={table.chat}
      log={table.log}
      onSend={table.say}
      you={you}
      onClose={onClose}
      className={onClose ? 'h-full' : 'absolute inset-0'}
    />
  );

  /* ---------- Pieces ---------- */

  const headerBar = (
    <header className={cn('flex flex-wrap items-center justify-between gap-x-3 gap-y-2', layer ? 'shrink-0' : 'mb-3')}>
      <div className="flex min-w-0 flex-1 basis-[220px] items-center gap-2.5 sm:gap-4">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-btn border border-cream/20 bg-cream/[0.05] px-2.5 py-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-cream transition-colors hover:border-acid/50 hover:text-acid sm:px-[13px]"
        >
          ← Lobby
        </Link>
        <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
          <h1 className={cn('hp-display hp-w80 truncate leading-none tracking-[-0.02em] text-cream', layer ? 'text-[17px]' : 'text-[19px] sm:text-[22px]')}>
            {state.name}
          </h1>
          <p className="truncate font-mono text-[10px] tracking-[0.08em] text-dim sm:text-[10.5px]">
            {state.smallBlind}/{state.bigBlind} · stack {formatChips(state.buyIn)} · {state.seats.length}/{state.maxPlayers} seated
            {inHand && ` · hand #${state.handNumber}`}
            {!table.connected && <span className="text-red-400"> · reconnecting…</span>}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <span
          className={cn(
            'hidden items-center gap-[7px] whitespace-nowrap rounded-full border px-3 py-[7px] font-mono text-[10px] uppercase tracking-[0.14em] sm:flex',
            inHand ? 'border-acid/40 bg-acid/[0.12] text-acid' : 'border-cream/15 bg-cream/[0.04] text-dim',
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', inHand ? 'animate-pulse bg-acid' : 'bg-dim')} />
          {inHand ? `In hand · ${STAGE_LABEL[state.stage]}` : 'Waiting'}
        </span>

        {full && portrait && (
          <BarButton
            label={rotated ? 'Turn back' : 'Rotate'}
            active={!!rotated}
            onClick={() => {
              const next = nextRotation(rotation);
              setRotatePref(next);
              writeRotatePref(next);
            }}
          >
            <RotateIcon />
          </BarButton>
        )}
        {!tilt && (
          <BarButton label={full ? 'Exit full screen' : 'Full screen'} onClick={toggleFull}>
            {full ? <CollapseIcon /> : <ExpandIcon />}
          </BarButton>
        )}
        {!docked && !sideDock && (
          <BarButton label="Chat" onClick={() => setDrawerOpen(true)} badge={unread}>
            <ChatIcon />
          </BarButton>
        )}
        <BarButton label={copied ? 'Copied!' : 'Invite'} showLabel={!layer} onClick={copyInvite}>
          <LinkIcon />
        </BarButton>
        {me && (
          <button
            onClick={table.leave}
            className="whitespace-nowrap rounded-btn border border-[#ff4d5e]/45 bg-[#ff4d5e]/10 px-2.5 py-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-[#ff8b95] transition-colors hover:border-[#ff3b52] hover:bg-[#ff3b52] hover:text-white sm:px-[13px]"
          >
            Leave
          </button>
        )}
      </div>
    </header>
  );

  const feltOverlays = (
    <>
      <div className="absolute left-2 top-2 z-20 flex max-w-[calc(100%-16px)] flex-wrap gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] sm:left-3 sm:top-2.5 sm:text-[9.5px]">
        {state.practice && <FeltChip>Practice · vs bots</FeltChip>}
        {state.isPrivate && <FeltChip>Private</FeltChip>}
        <FeltChip onClick={toggleSound} pressed={!muted}>
          <SoundIcon muted={muted} size={11} />
          {muted ? 'Sounds off' : 'Sounds on'}
        </FeltChip>
      </div>

      {table.error && (
        <div
          role="alert"
          className="absolute left-1/2 top-[12%] z-30 max-w-[80%] -translate-x-1/2 rounded-lg border border-red-500/40 bg-red-950/95 px-3 py-1.5 text-center font-mono text-[11px] text-red-200 shadow-lg sm:text-[12px]"
        >
          {table.error}
        </div>
      )}

      {table.lastResult && state.stage === 'showdown' && (
        <div className="absolute left-1/2 top-[24%] z-20 max-w-[70%] -translate-x-1/2 rounded-xl border border-acid/40 bg-night-950/90 px-3 py-1.5 text-center shadow-[0_10px_30px_rgba(0,0,0,0.6)] backdrop-blur-sm sm:px-5 sm:py-2.5">
          {table.lastResult.winners.map((w, i) => (
            <p key={i} className="hp-display hp-w85 text-[12px] text-acid sm:text-base">
              {displayName(w.handle, w.address)} wins {formatChips(w.amount)}
              {w.handName ? ` · ${w.handName}` : ''}
            </p>
          ))}
        </div>
      )}
    </>
  );

  const felt = <PokerTable state={state} onSit={table.sit}>{feltOverlays}</PokerTable>;

  /* ---------- Full-screen layer ---------- */

  if (layer) {
    return (
      <div className="fixed inset-0 z-[60] overflow-hidden bg-night-950">
        {/* Backdrop: the felt itself, blown up and blurred, so the bands a
            3:2 table leaves on a wide screen read as the room round it
            rather than dead black. Same image as the felt — nothing extra
            to load. */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div
            className="absolute -inset-16 scale-110 bg-cover bg-center opacity-50 blur-3xl saturate-150"
            style={{ backgroundImage: "url('/table-live.jpg')" }}
          />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(10,12,10,0.2)_0%,rgba(10,12,10,0.85)_75%)]" />
        </div>
        <div
          style={rotated ? rotatedStyle(rotated) : undefined}
          className={cn(
            // `relative` lifts the table above the absolute backdrop.
            'relative flex flex-col gap-2 p-2',
            !rotated && 'h-full w-full pb-[max(8px,env(safe-area-inset-bottom))] pl-[max(8px,env(safe-area-inset-left))] pr-[max(8px,env(safe-area-inset-right))] pt-[max(8px,env(safe-area-inset-top))]',
          )}
        >
          {headerBar}
          <div className={cn('flex min-h-0 flex-1 gap-2', !wide && 'flex-col')}>
            {/* Sized by container units so the 3:2 felt fits whichever way is
                tighter; the bottom padding leaves room for the foreground
                seats, whose cards hang below the art. */}
            <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center pb-7 [container-type:size]">
              <div className="w-[min(100cqw,150cqh)]">{felt}</div>
            </div>
            <div className={cn('flex flex-col justify-end gap-2', wide ? 'w-[clamp(220px,32%,320px)] shrink-0' : 'shrink-0')}>
              {sideDock && <div className="relative min-h-0 flex-1">{panel()}</div>}
              <ActionBar state={state} onAct={table.act} compact columns={wide ? 2 : 4} />
            </div>
          </div>
          <TableDrawer open={drawerOpen} onClose={closeDrawer}>{panel(closeDrawer)}</TableDrawer>
        </div>
      </div>
    );
  }

  /* ---------- In-page ---------- */

  return (
    /* On a wide screen everything fits the viewport, as in the design: the
       felt takes the space left between the bar and the dock, and chat
       scrolls inside its own column instead of growing the page. */
    <div className="mx-auto flex max-w-[1500px] flex-col px-3 pb-6 pt-4 sm:px-6 sm:pt-5 lg:h-[calc(100dvh-var(--hp-header,73px))] lg:overflow-hidden">
      {headerBar}
      <div className={cn('min-h-0 flex-1', docked && 'grid grid-cols-[minmax(0,1fr)_296px] gap-3')}>
        <div className="flex min-h-0 min-w-0 flex-col gap-2.5">
          <div className="flex min-h-0 items-start justify-center lg:flex-1 lg:items-center lg:pb-1 lg:[container-type:size]">
            <div className="w-full lg:w-[min(100cqw,150cqh)]">{felt}</div>
          </div>
          <div className="mx-auto w-full max-w-4xl shrink-0">
            <ActionBar state={state} onAct={table.act} />
          </div>
        </div>
        {docked && <div className="relative min-h-0">{panel()}</div>}
      </div>
      {!docked && (
        <TableDrawer open={drawerOpen} onClose={closeDrawer}>{panel(closeDrawer)}</TableDrawer>
      )}
    </div>
  );
}

function BarButton({
  label,
  onClick,
  children,
  badge = 0,
  active = false,
  showLabel = false,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  badge?: number;
  active?: boolean;
  /** Show the text next to the icon from `sm` up. */
  showLabel?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'relative flex h-[34px] min-w-[34px] items-center justify-center gap-1.5 whitespace-nowrap rounded-btn border px-2 font-mono text-[10.5px] uppercase tracking-[0.14em] transition-colors',
        active
          ? 'border-acid/60 bg-acid/[0.12] text-acid'
          : 'border-cream/20 bg-cream/[0.05] text-[#c9cdc2] hover:border-acid/50 hover:text-acid',
        showLabel && 'sm:px-[13px]',
      )}
    >
      {children}
      {showLabel && <span className="hidden sm:inline">{label}</span>}
      {badge > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-acid px-1 font-mono text-[9px] font-semibold leading-none tracking-normal text-ink">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}

function FeltChip({
  children,
  onClick,
  pressed,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  pressed?: boolean;
}) {
  const cls = 'flex items-center gap-1.5 whitespace-nowrap rounded-[5px] border border-cream/[0.14] bg-[rgba(5,6,3,0.7)] px-2 py-1 uppercase text-dim sm:px-[9px] sm:py-[5px]';
  return onClick ? (
    <button
      onClick={onClick}
      aria-pressed={pressed}
      className={cn(cls, 'tracking-[0.16em] transition-colors hover:border-acid/50 hover:text-acid')}
    >
      {children}
    </button>
  ) : (
    <span className={cls}>{children}</span>
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
