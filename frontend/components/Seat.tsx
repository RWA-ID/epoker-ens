'use client';
/**
 * One seat around the rail: a backdrop-blurred pill with avatar, ENS
 * name and mono stack, plus current bet, dealer button, action-timer
 * ring, and hole cards (yours face-up, everyone else's face-down until
 * showdown reveals them).
 */
import { useEffect, useState } from 'react';
import type { SeatView, Card } from '@/lib/types';
import { displayName, formatChips, cn } from '@/lib/utils';
import { Avatar } from './Avatar';
import { PlayingCard } from './PlayingCard';

export function Seat({
  view,
  holeCards,
  isYou,
  inHand,
  deadline,
  onSit,
  cardSide = 'above',
}: {
  view: SeatView | null;
  holeCards?: Card[];       // your own cards, only for your seat
  isYou: boolean;
  inHand: boolean;          // is a hand currently running at the table
  deadline: number | null;  // action deadline for the acting player
  onSit?: () => void;       // provided for empty seats when you can sit
  /** Where hole cards and the bet sit relative to the pill — toward the felt. */
  cardSide?: 'above' | 'left' | 'right';
}) {
  // Empty seat → sit-down button (or placeholder for spectators mid-hand).
  if (!view) {
    return onSit ? (
      <button
        onClick={onSit}
        className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-dashed border-acid-400/40 bg-night-950/60 px-2.5 py-1.5 text-[11px] text-acid/80 backdrop-blur-sm transition-colors hover:border-acid-400/80 hover:bg-acid-400/10 hover:text-acid sm:gap-2 sm:px-4 sm:py-2.5 sm:text-[13px] tilt:gap-1.5 tilt:px-2.5 tilt:py-1.5 tilt:text-[11px]"
      >
        <span className="text-base leading-none">+</span> Sit here
      </button>
    ) : (
      <div className="h-8 w-8 rounded-full border border-dashed border-white/15 bg-night-950/40 sm:h-10 sm:w-10 tilt:h-7 tilt:w-7" />
    );
  }

  const showCards = view.shownCards ?? (isYou ? holeCards : undefined);
  const hasCards = inHand && !view.folded && (showCards?.length || !isYou);

  const cardClass = 'h-8 w-[22px] text-[10px] sm:h-10 sm:w-7 sm:text-xs tilt:h-6 tilt:w-[17px] tilt:text-[9px]';
  const faceDown = hasCards && !showCards?.length;

  // On a phone (below sm, or tilt) the felt is too small for cards beside a
  // side seat's pill — they landed on the board. There, a face-down hand
  // shrinks to a mini back on the pill and anything else stacks above it.
  // `tilt:` is the last screen, so it beats `sm:`.
  return (
    <div
      className={cn(
        'flex flex-col-reverse items-center gap-1 tilt:flex-col-reverse',
        cardSide === 'above' ? 'sm:flex-col-reverse' : cardSide === 'left' ? 'sm:flex-row-reverse' : 'sm:flex-row',
        view.folded && 'opacity-40',
      )}
    >
      {/* Player pill, with the action timer under it */}
      <div className="flex flex-col items-center gap-1">
        <div
          className={cn(
            'relative flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 shadow-[0_6px_18px_rgba(0,0,0,0.5)] backdrop-blur-md sm:gap-2.5 sm:py-1.5 sm:pl-1.5 sm:pr-4 tilt:gap-1 tilt:py-0.5 tilt:pl-0.5 tilt:pr-1.5',
            view.acting
              ? 'animate-pulse border-acid-400 bg-night-950/75'
              : isYou
                ? 'border-acid-400/60 bg-acid-400/[0.18]'
                : 'border-acid-400/25 bg-night-950/70',
            !view.connected && 'grayscale',
          )}
        >
          <Avatar
            record={view.avatar}
            handle={view.handle}
            address={view.address}
            size={48}
            className="h-7 w-7 border-2 border-acid/50 sm:h-[42px] sm:w-[42px] md:h-[48px] md:w-[48px] tilt:h-5 tilt:w-5"
            monogramClassName="text-[13px] sm:text-[18px] tilt:text-[10px]"
          />
          <div className="min-w-0 text-left">
            <p className="max-w-[72px] truncate text-[10.5px] font-semibold text-cream sm:max-w-32 sm:text-[13px] md:max-w-40 md:text-[14px] tilt:max-w-[56px] tilt:text-[9px]">
              {isYou ? 'You · ' : ''}
              {displayName(view.handle, view.address)}
            </p>
            <p className="font-mono text-[10px] tabular-nums text-acid sm:text-[12px] md:text-[12.5px] tilt:text-[9px]">
              {formatChips(view.stack)}
            </p>
          </div>
          {view.bot && (
            <span className="absolute -left-1 -top-1.5 rounded-full border border-acid/40 bg-night-950 px-1.5 font-mono text-[8px] font-semibold uppercase leading-[14px] tracking-[0.1em] text-acid">
              Bot
            </span>
          )}
          {view.isButton && (
            <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-cream text-[9px] font-bold text-night-950 shadow sm:h-6 sm:w-6 sm:text-[10px] tilt:h-4 tilt:w-4 tilt:text-[8px]">
              D
            </span>
          )}
          {faceDown && (
            <span aria-hidden className="absolute -right-2 top-1/2 flex -translate-y-1/2 sm:hidden tilt:flex">
              <PlayingCard size="sm" faceDown className="h-[18px] w-[13px] -rotate-6 rounded-[3px]" />
              <PlayingCard size="sm" faceDown className="-ml-2 h-[18px] w-[13px] rotate-6 rounded-[3px]" />
            </span>
          )}
          {view.allIn && (
            <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded bg-red-600 px-2 text-[10px] font-bold uppercase text-white">
              All-in
            </span>
          )}
        </div>
        {view.acting && deadline && <TimerBar deadline={deadline} />}
      </div>

      {/* Hole cards and the street bet, on the felt side of the pill */}
      {(hasCards || view.bet > 0) && (
        <div className={cn('flex flex-col items-center gap-1', faceDown && !view.bet && 'hidden sm:flex tilt:hidden')}>
          {hasCards ? (
            <div className={cn('flex gap-1', faceDown && 'hidden sm:flex tilt:hidden')}>
              {showCards?.length ? (
                showCards.map((c, i) => <PlayingCard key={i} card={c} size="sm" className={cardClass} />)
              ) : (
                <>
                  <PlayingCard size="sm" faceDown className={cardClass} />
                  <PlayingCard size="sm" faceDown className={cardClass} />
                </>
              )}
            </div>
          ) : null}
          {view.bet > 0 && (
            <span className="rounded-full border border-acid-400/30 bg-night-950/80 px-2 py-0.5 font-mono text-[10px] tabular-nums text-acid sm:px-2.5 sm:text-[11.5px] tilt:px-1.5 tilt:text-[9px]">
              {formatChips(view.bet)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Depleting bar under the acting player. */
function TimerBar({ deadline }: { deadline: number }) {
  const [pct, setPct] = useState(100);
  useEffect(() => {
    const total = deadline - Date.now();
    const id = setInterval(() => {
      setPct(Math.max(0, ((deadline - Date.now()) / total) * 100));
    }, 200);
    return () => clearInterval(id);
  }, [deadline]);
  return (
    <div className="h-1 w-20 overflow-hidden rounded-full bg-night-800/90 sm:w-28 tilt:w-20">
      <div
        className={cn('h-full transition-all', pct < 30 ? 'bg-red-500' : 'bg-acid-400')}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
