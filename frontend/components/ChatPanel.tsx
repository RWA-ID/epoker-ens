'use client';
/**
 * In-table chat: the Chat tab of TablePanel (docked beside the felt on
 * desktop, in the drawer on phones and full screen).
 *
 * Open to everyone connected — seated players and spectators. Plain text
 * only: links are stripped, and messages render as React text nodes (never
 * HTML), so nothing can be embedded or injected.
 */
import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/lib/types';
import { sanitizeChat } from '@/lib/chat';
import { displayName, cn } from '@/lib/utils';

const QUICK = ['gl', 'nh', 'gg', 'ship it'];

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

  const send = (raw: string) => {
    // Strip here too so the sender sees what the table will see. The worker
    // repeats this — it is the authority, this is just honest feedback.
    const text = sanitizeChat(raw);
    if (!text) return;
    onSend(text);
    setNotice(text !== raw.trim() ? 'Links aren’t allowed in table chat.' : null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="hp-scroll flex min-h-0 flex-1 flex-col gap-[7px] overflow-y-auto px-3 py-2.5">
        {messages.length === 0 && (
          <p className="font-mono text-[11.5px] text-faint">Say hi to the table…</p>
        )}
        {messages.map((m, i) => (
          <p key={i} className="break-words font-mono text-[11.5px] leading-[1.45] text-[#c9cdc2]">
            <span className={m.address === you ? 'text-acid' : 'text-acid/70'}>
              {displayName(m.handle, m.address)}
            </span>{' '}
            {m.text}
          </p>
        ))}
      </div>
      {notice && <p className="px-3 pb-1.5 font-mono text-[10.5px] text-acid">{notice}</p>}
      <div className="flex flex-wrap gap-[5px] px-3 pb-2">
        {QUICK.map((q) => (
          <button
            key={q}
            onClick={() => send(q)}
            className="whitespace-nowrap rounded-full border border-cream/[0.16] bg-cream/[0.04] px-2.5 py-[5px] font-mono text-[10px] tracking-[0.08em] text-dim transition-colors hover:border-acid hover:text-acid"
          >
            {q}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
          setDraft('');
        }}
        className="flex gap-1.5 border-t border-cream/10 bg-[#0b0d07] px-2.5 py-2"
      >
        <input
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setNotice(null); }}
          placeholder="Message…"
          maxLength={280}
          enterKeyHint="send"
          // 16px on touch screens: iOS zooms the page into any smaller input.
          className="min-w-0 flex-1 rounded-btn border border-cream/[0.16] bg-night-950 px-2.5 py-2 font-mono text-[16px] text-cream outline-none placeholder:text-faint focus:border-acid/60 sm:text-[11.5px]"
        />
        <button
          type="submit"
          className={cn(
            'rounded-btn bg-acid px-3.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink',
          )}
        >
          Send
        </button>
      </form>
    </div>
  );
}
