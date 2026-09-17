'use client';
/** The Hand log tab: every blind, action, street and win the table saw. */
import { useEffect, useRef } from 'react';
import type { HandLogEntry } from '@/lib/types';
import { displayName, formatChips, cn } from '@/lib/utils';

const SUIT: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };

function CardText({ card }: { card: string }) {
  const red = card[1] === 'h' || card[1] === 'd';
  // U+FE0E keeps the suit a text glyph — iOS otherwise draws ♥ as an emoji.
  return (
    <span className={red ? 'text-[#ff6b7d]' : 'text-cream'}>
      {card[0] === 'T' ? '10' : card[0]}
      {SUIT[card[1]]}
      {'︎'}
    </span>
  );
}

export function HandLog({ entries, you }: { entries: HandLogEntry[]; you: string | undefined }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [entries.length]);

  return (
    <div ref={scrollRef} className="hp-scroll flex min-h-0 flex-1 flex-col overflow-y-auto py-1">
      {entries.length === 0 && (
        <p className="px-3 py-2.5 font-mono text-[11.5px] text-faint">
          The next hand’s action will show up here.
        </p>
      )}
      {entries.map((e, i) => {
        if (e.address === null && e.text.startsWith('Hand #')) {
          return (
            <p
              key={i}
              className={cn(
                'px-3 pb-1 font-mono text-[9.5px] uppercase tracking-[0.18em] text-acid/80',
                i > 0 ? 'mt-2 border-t border-cream/10 pt-2.5' : 'pt-1.5',
              )}
            >
              {e.text}
            </p>
          );
        }
        const who = e.address === null ? 'Dealer' : e.address === you ? 'You' : displayName(e.handle, e.address);
        const win = e.text.startsWith('wins');
        return (
          <div
            key={i}
            className={cn(
              'flex items-baseline justify-between gap-2 border-b border-cream/[0.06] px-3 py-[7px] font-mono text-[11px]',
              win ? 'text-acid' : 'text-[#c9cdc2]',
            )}
          >
            <span className="min-w-0 break-words">
              <span className={e.address === null ? 'text-dim' : win ? 'text-acid' : 'text-cream'}>{who}</span>{' '}
              {e.address === null ? `deals the ${e.text.toLowerCase()}` : e.text}
              {e.cards && (
                <span className="ml-1.5 inline-flex gap-1">
                  {e.cards.map((c) => <CardText key={c} card={c} />)}
                </span>
              )}
            </span>
            <span className="shrink-0 tabular-nums text-dim">
              {e.amount === null ? '—' : formatChips(e.amount)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
