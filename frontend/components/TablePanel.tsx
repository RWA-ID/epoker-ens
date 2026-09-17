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

export type PanelTab = 'chat' | 'log';

export function TablePanel({
  tab,
  onTab,
  chat,
  log,
  onSend,
  you,
  onClose,
  className,
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
}) {
  return (
    <div
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-card border border-cream/[0.12] bg-night-900',
        className,
      )}
    >
      <div className="flex shrink-0 border-b border-cream/10" role="tablist">
        {(['chat', 'log'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => onTab(t)}
            className={cn(
              'flex-1 px-2 py-[11px] font-mono text-[10px] uppercase tracking-[0.18em] transition-colors',
              tab === t ? 'text-acid shadow-[inset_0_-2px_0_#ccff00]' : 'text-dim hover:text-cream',
            )}
          >
            {t === 'chat' ? 'Chat' : 'Hand log'}
          </button>
        ))}
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="px-4 font-mono text-[14px] text-dim transition-colors hover:text-acid"
          >
            ✕
          </button>
        )}
      </div>
      {tab === 'chat' ? (
        <ChatPanel messages={chat} onSend={onSend} you={you} />
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
        aria-label="Table chat and hand log"
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
