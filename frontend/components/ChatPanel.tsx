'use client';
/**
 * In-table chat, docked beside the felt (stacked below on mobile).
 *
 * Open to everyone connected — seated players and spectators. Plain text
 * only: links are stripped, and messages render as React text nodes (never
 * HTML), so nothing can be embedded or injected.
 */
import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/lib/types';
import { sanitizeChat } from '@/lib/chat';
import { displayName } from '@/lib/utils';

export function ChatPanel({
  messages,
  onSend,
  you,
}: {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  you: string | undefined;
}) {
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  const submit = () => {
    // Strip here too so the sender sees what the table will see. The worker
    // repeats this — it is the authority, this is just honest feedback.
    const text = sanitizeChat(draft);
    if (!text) return;
    onSend(text);
    setDraft('');
    setNotice(text !== draft.trim() ? 'Links aren’t allowed in table chat.' : null);
  };

  return (
    <div className="flex h-72 flex-col rounded-2xl border border-white/[0.07] bg-night-850/60 lg:h-auto lg:min-h-0 lg:flex-1">
      <div className="border-b border-white/5 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-dim">
        Table Chat
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3.5 text-sm">
        {messages.length === 0 && (
          <p className="text-xs text-faint">Say hi to the table…</p>
        )}
        {messages.map((m, i) => {
          const mine = m.address === you;
          return (
            <p key={i} className="leading-snug">
              <span className={mine ? 'font-medium text-acid' : 'font-medium text-muted'}>
                {displayName(m.handle, m.address)}:
              </span>{' '}
              <span className="text-muted">{m.text}</span>
            </p>
          );
        })}
      </div>
      {notice && (
        <p className="border-t border-white/5 px-3 pt-2 text-[11px] text-acid">{notice}</p>
      )}
      <div className="flex gap-2 border-t border-white/5 p-2.5">
        <input
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setNotice(null); }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Message…"
          maxLength={280}
          className="min-w-0 flex-1 rounded-[9px] border border-white/10 bg-night-900 px-3 py-1.5 text-sm outline-none transition-colors placeholder:text-faint focus:border-acid-400/60"
        />
        <button
          onClick={submit}
          className="bg-acid rounded-[9px] px-3.5 text-sm font-semibold text-ink transition-transform hover:-translate-y-px"
        >
          Send
        </button>
      </div>
    </div>
  );
}
