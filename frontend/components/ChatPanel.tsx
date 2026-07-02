'use client';
/** In-table chat, docked beside the felt (stacked below on mobile). */
import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/lib/types';
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
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
  };

  return (
    <div className="flex h-72 flex-col rounded-2xl border border-white/[0.07] bg-night-850/60 lg:h-full">
      <div className="border-b border-white/5 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        Table Chat
      </div>
      <div ref={scrollRef} className="flex-1 space-y-1.5 overflow-y-auto p-3.5 text-sm">
        {messages.length === 0 && (
          <p className="text-xs text-slate-600">Say hi to the table…</p>
        )}
        {messages.map((m, i) => {
          const mine = m.address === you;
          return (
            <p key={i} className="leading-snug">
              <span className={mine ? 'font-medium text-gold-400' : 'font-medium text-ens-300'}>
                {displayName(m.ensName, m.address)}:
              </span>{' '}
              <span className="text-slate-300">{m.text}</span>
            </p>
          );
        })}
      </div>
      <div className="flex gap-2 border-t border-white/5 p-2.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Message…"
          maxLength={280}
          className="min-w-0 flex-1 rounded-[9px] border border-white/10 bg-night-900 px-3 py-1.5 text-sm outline-none transition-colors placeholder:text-slate-600 focus:border-gold-500/60"
        />
        <button
          onClick={submit}
          className="gold-fill rounded-[9px] px-3.5 text-sm font-semibold text-ink transition-transform hover:-translate-y-px"
        >
          Send
        </button>
      </div>
    </div>
  );
}
