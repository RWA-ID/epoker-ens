'use client';
/** Single-open accordion; item 0 open on load, clicking the open item closes it. */
import { useState } from 'react';
import { cn } from '@/lib/utils';

const ITEMS = [
  {
    q: 'Is there a HoodPoker token?',
    a: 'No. There is no token, no presale, no holding requirement and nothing to buy. Chips are virtual and have zero monetary value — the only thing at stake is your seat on the leaderboard.',
  },
  {
    q: 'Do I need a wallet?',
    a: 'Connecting a wallet on Robinhood chain gives you a persistent handle, bankroll and leaderboard record. You can also watch any public table without connecting.',
  },
  {
    q: 'How many players start a hand?',
    a: 'Public tables deal at four seated players. Private tables are sized by the host (2–9 seats) and deal as soon as they fill, down to heads-up.',
  },
  {
    q: 'Can the house see my cards?',
    a: 'Hole cards are dealt and held server-side and only revealed at showdown. Shuffles use a cryptographic RNG, and every bet, side pot and payout is settled by the server, not your client.',
  },
];

export function Faq() {
  const [open, setOpen] = useState(0);

  return (
    <div className="mt-7 flex flex-col gap-2.5">
      {ITEMS.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q} className="rounded-faq border border-cream/[0.12] bg-night-900">
            <button
              onClick={() => setOpen(isOpen ? -1 : i)}
              aria-expanded={isOpen}
              className="group flex w-full items-center justify-between gap-4 px-5 py-[18px] text-left"
            >
              <span
                className={cn(
                  'hp-display hp-w85 text-[18px] font-extrabold transition-colors',
                  isOpen ? 'text-acid' : 'text-cream group-hover:text-acid',
                )}
              >
                {item.q}
              </span>
              <span
                aria-hidden
                className={cn(
                  'shrink-0 font-mono text-[20px] leading-none text-acid transition-transform duration-200 ease-out',
                  isOpen && 'rotate-45',
                )}
              >
                +
              </span>
            </button>
            {isOpen && (
              <p className="px-5 pb-5 text-[15px] leading-[1.65] text-muted">{item.a}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
