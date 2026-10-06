'use client';
/**
 * Chat / Hand log tabs. Docked beside the felt on wide screens; inside
 * TableDrawer (a bottom sheet) on phones and in full-screen mode.
 */
import { useEffect } from 'react';
import type { ChatMessage, HandLogEntry } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ChatPanel } from './ChatPanel';
import { HandLog } from './HandLog';

export type PanelTab = 'chat' | 'log' | 'space';

const TAB_LABEL: Record<PanelTab, string> = { chat: 'Chat', log: 'Hand log', space: 'Space' };

/**
 * One colour per tab so each is findable at a glance: lime, silver, black.
 * All three stay coloured; the selected one is full strength with a ring,
 * the others dimmed until hovered. The black tab carries a hairline border,
 * or it would vanish into the panel.
 */
const TAB_STYLE: Record<PanelTab, { base: string; ring: string; dot: string }> = {
  chat: { base: 'bg-acid text-ink', ring: 'ring-acid', dot: 'bg-ink' },
  space: { base: 'bg-[#c9ccd1] text-ink', ring: 'ring-[#e4e6ea]', dot: 'bg-ink' },
  log: { base: 'bg-black text-cream border border-cream/35', ring: 'ring-cream/70', dot: 'bg-acid' },
};

export function TablePanel({
  tab,
  onTab,
  chat,
  log,
  onSend,
  you,
  onClose,
  className,
  space,
  spaceLive,
}: {
  tab: PanelTab;
  onTab: (tab: PanelTab) => void;
  chat: ChatMessage[];
  log: HandLogEntry[];
  onSend: (text: string) => void;
  you: string | undefined;
  /** Drawer only: shows a close button. */
  onClose?: () => void;
  className?: string;
  /** The Space tab's content — only on tables with a Space. */
  space?: React.ReactNode;
  /** Shows a live dot on the tab. */
  spaceLive?: boolean;
}) {
  const tabs: PanelTab[] = space ? ['chat', 'space', 'log'] : ['chat', 'log'];
  return (
    <div
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-card border border-cream/[0.12] bg-night-900',
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-1.5 border-b border-cream/10 p-2" role="tablist">
        {tabs.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => onTab(t)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-btn px-2 py-[9px] text-[12px] font-extrabold uppercase tracking-[0.12em] transition-[opacity,box-shadow]',
              TAB_STYLE[t].base,
              tab === t
                ? cn('opacity-100 ring-2 ring-offset-2 ring-offset-night-900', TAB_STYLE[t].ring)
                : 'opacity-[0.55] hover:opacity-[0.85]',
            )}
          >
            {TAB_LABEL[t]}
            {t === 'space' && spaceLive && (
              <span className={cn('inline-block h-1.5 w-1.5 animate-pulse rounded-full', TAB_STYLE[t].dot)} />
            )}
          </button>
        ))}
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="px-3 font-mono text-[14px] text-dim transition-colors hover:text-acid"
          >
            ✕
          </button>
        )}
      </div>
      {tab === 'chat' ? (
        <ChatPanel messages={chat} onSend={onSend} you={you} />
      ) : tab === 'space' && space ? (
        space
      ) : (
        <HandLog entries={log} you={you} />
      )}
    </div>
  );
}

/** Bottom sheet. `fixed` resolves inside a rotated full-screen layer too. */
export function TableDrawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div className={cn('fixed inset-0 z-[70]', !open && 'pointer-events-none')} aria-hidden={!open}>
      <div
        onClick={onClose}
        className={cn('absolute inset-0 bg-black/55 transition-opacity duration-200', open ? 'opacity-100' : 'opacity-0')}
      />
      <div
        role="dialog"
        aria-label="Table chat, Space and hand log"
        className={cn(
          'absolute inset-x-0 bottom-0 mx-auto flex h-[min(72%,560px)] max-w-xl flex-col px-2 pb-[max(8px,env(safe-area-inset-bottom))] transition-transform duration-200 ease-out',
          open ? 'translate-y-0' : 'translate-y-full',
        )}
      >
        {children}
      </div>
    </div>
  );
}
