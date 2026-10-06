'use client';
/**
 * The Space tab of TablePanel — a live voice room on the table, X Spaces style.
 *
 * Stage (host, co-hosts, speakers) up top with a glow on whoever is talking,
 * raised hands below for the host, and one row of controls at the bottom.
 * Roles live on the server (worker/src/space.ts); audio in lib/useSpace.ts.
 */
import { useState } from 'react';
import type { ClientMessage, SpaceMember, SpaceRole, SpaceView } from '@/lib/types';
import type { SpaceControls } from '@/lib/useSpace';
import { displayName, cn } from '@/lib/utils';
import { Avatar } from './Avatar';
import { Button } from './ui/button';

type SpaceCmd = Extract<ClientMessage, { type: `space:${string}` }>;

const ROLE_LABEL: Record<SpaceRole, string> = {
  host: 'Host',
  cohost: 'Co-host',
  speaker: 'Speaker',
  listener: 'Listener',
};

function StageMember({
  m,
  talking,
  you,
  canManage,
  amHost,
  onCmd,
}: {
  m: SpaceMember;
  talking: boolean;
  you: boolean;
  canManage: boolean;
  amHost: boolean;
  onCmd: (msg: SpaceCmd) => void;
}) {
  const [menu, setMenu] = useState(false);
  // A co-host manages speakers; only the host manages co-hosts.
  const manageable = canManage && !you && m.role !== 'host' && (amHost || m.role === 'speaker');
  return (
    <li className="relative flex flex-col items-center gap-1.5 text-center">
      <button
        onClick={() => manageable && setMenu((o) => !o)}
        disabled={!manageable}
        aria-label={manageable ? `Manage ${displayName(m.handle, m.address)}` : undefined}
        className={cn(
          'relative rounded-full p-[3px] transition-shadow duration-150',
          talking ? 'shadow-[0_0_0_2px_#ccff00,0_0_18px_rgba(204,255,0,0.55)]' : 'shadow-[0_0_0_1px_rgba(244,239,226,0.14)]',
        )}
      >
        <Avatar record={m.avatar} handle={m.handle} address={m.address} size={56} className="h-14 w-14 text-[20px]" />
        <span
          aria-label={m.muted ? 'Muted' : 'Mic on'}
          className={cn(
            'absolute -bottom-0.5 -right-0.5 flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-night-900 text-[10px]',
            m.muted ? 'bg-night-800 text-dim' : 'bg-acid text-ink',
          )}
        >
          <MicGlyph off={m.muted} />
        </span>
      </button>
      <span className="max-w-[88px] truncate text-[12.5px] leading-tight text-cream">
        {you ? 'You' : displayName(m.handle, m.address)}
      </span>
      <span className={cn('font-mono text-[9.5px] uppercase tracking-[0.14em]', m.role === 'speaker' ? 'text-faint' : 'text-acid/80')}>
        {ROLE_LABEL[m.role]}
      </span>

      {menu && (
        <div className="absolute top-[68px] z-10 flex w-[150px] flex-col overflow-hidden rounded-btn border border-cream/[0.16] bg-night-950 text-left shadow-[0_14px_40px_rgba(0,0,0,0.6)]">
          {!m.muted && (
            <MenuItem onClick={() => { onCmd({ type: 'space:mute', address: m.address }); setMenu(false); }}>Mute</MenuItem>
          )}
          {amHost && (
            <MenuItem onClick={() => { onCmd({ type: 'space:cohost', address: m.address, on: m.role !== 'cohost' }); setMenu(false); }}>
              {m.role === 'cohost' ? 'Make speaker' : 'Make co-host'}
            </MenuItem>
          )}
          <MenuItem danger onClick={() => { onCmd({ type: 'space:remove', address: m.address }); setMenu(false); }}>
            Move to audience
          </MenuItem>
        </div>
      )}
    </li>
  );
}

function MenuItem({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3.5 py-2.5 text-[13px] transition-colors hover:bg-cream/[0.06]',
        danger ? 'text-[#ff8b95]' : 'text-cream',
      )}
    >
      {children}
    </button>
  );
}

function MicGlyph({ off, size = 10 }: { off?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <rect x="5.5" y="1.5" width="5" height="8.5" rx="2.5" />
      <path d="M3 7.5a5 5 0 0 0 10 0M8 12.5v2" />
      {off && <path d="M2 2l12 12" />}
    </svg>
  );
}

export function SpacePanel({
  view,
  you,
  controls,
  onCmd,
}: {
  view: SpaceView;
  you: string | undefined;
  controls: SpaceControls;
  onCmd: (msg: SpaceCmd) => void;
}) {
  const role = view.you;
  const amHost = role === 'host';
  const canManage = role === 'host' || role === 'cohost';
  const onStage = role !== null && role !== 'listener';
  const joined = controls.status === 'on';

  /* ---------- not live ---------- */
  if (!view.live) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 py-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full border border-cream/[0.16] text-dim">
          <MicGlyph size={20} />
        </span>
        <p className="hp-display hp-w85 text-[20px] text-cream">Table Space</p>
        {amHost ? (
          <>
            <p className="max-w-[240px] text-[13.5px] leading-[1.5] text-muted">
              Talk over the table — you host, bring people up to speak, everyone else listens.
            </p>
            <Button onClick={() => onCmd({ type: 'space:start' })} disabled={!view.enabled} className="mt-1 px-6">
              Start the Space
            </Button>
            {!view.enabled && <p className="text-[12px] text-faint">Voice isn’t switched on for HoodPoker yet.</p>}
          </>
        ) : (
          <p className="max-w-[240px] text-[13.5px] leading-[1.5] text-muted">
            The host hasn’t started the Space. It’ll show here when they do.
          </p>
        )}
      </div>
    );
  }

  /* ---------- live ---------- */
  return (
    <div className="flex min-h-0 flex-1 flex-col" onClick={controls.resume}>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-cream/[0.08] px-4 py-2.5">
        <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-acid">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-acid" />
          Live
        </span>
        <span className="font-mono text-[10.5px] text-faint">
          {view.stage.length} on stage · {view.listeners} listening
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <ul className="grid grid-cols-3 gap-x-2 gap-y-4">
          {view.stage.map((m) => (
            <StageMember
              key={m.address}
              m={m}
              talking={controls.talking.has(m.address)}
              you={m.address === you}
              canManage={canManage}
              amHost={amHost}
              onCmd={onCmd}
            />
          ))}
        </ul>

        {canManage && view.hands.length > 0 && (
          <div className="mt-6">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
              ✋ Requests · {view.hands.length}
            </p>
            <ul className="space-y-1.5">
              {view.hands.map((m) => (
                <li key={m.address} className="flex items-center gap-2.5 rounded-btn border border-cream/[0.1] bg-night-950 px-2.5 py-2">
                  <Avatar record={m.avatar} handle={m.handle} address={m.address} size={32} className="h-8 w-8 text-[13px]" />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-cream">{displayName(m.handle, m.address)}</span>
                  <button
                    onClick={() => onCmd({ type: 'space:invite', address: m.address })}
                    className="rounded-full bg-acid px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink hover:bg-acid-hover"
                  >
                    Bring up
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {controls.error && (
          <p role="alert" className="mt-4 text-center text-[12.5px] text-red-400">{controls.error}</p>
        )}
        {!view.canJoin && (
          <p className="mt-4 text-center text-[12.5px] text-faint">This Space is for the table’s guest list.</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-cream/[0.1] p-2.5">
        {!joined ? (
          <Button
            onClick={controls.join}
            disabled={controls.status === 'joining' || !view.canJoin}
            className="flex-1 py-3 text-[14px]"
          >
            {controls.status === 'joining' ? 'Joining…' : '🎧 Listen in'}
          </Button>
        ) : (
          <>
            {onStage ? (
              <Button
                onClick={controls.toggleMic}
                disabled={controls.micBusy}
                variant={controls.muted ? 'outline' : 'acid'}
                className="flex flex-1 items-center justify-center gap-2 py-3 text-[14px]"
              >
                <MicGlyph off={controls.muted} size={14} />
                {controls.micBusy ? 'Mic…' : controls.muted ? 'Unmute' : 'Mute'}
              </Button>
            ) : (
              <Button
                onClick={() => onCmd({ type: view.handRaised ? 'space:lower' : 'space:raise' })}
                variant={view.handRaised ? 'acid' : 'outline'}
                className="flex-1 py-3 text-[14px]"
              >
                {view.handRaised ? '✋ Hand raised' : '✋ Request to speak'}
              </Button>
            )}
            <Button variant="outline" onClick={controls.leave} className="px-4 py-3 text-[14px]">
              Leave
            </Button>
          </>
        )}
        {amHost && (
          <button
            onClick={() => onCmd({ type: 'space:end' })}
            className="rounded-btn border border-[#ff4d5e]/45 px-3 py-3 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#ff8b95] transition-colors hover:border-[#ff3b52] hover:bg-[#ff3b52] hover:text-white"
          >
            End
          </button>
        )}
      </div>
    </div>
  );
}
