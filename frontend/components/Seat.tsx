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
import { PlayingCard } from './PlayingCard';

export function Seat({
  view,
  holeCards,
  isYou,
  inHand,
  deadline,
  onSit,
}: {
  view: SeatView | null;
  holeCards?: Card[];       // your own cards, only for your seat
  isYou: boolean;
  inHand: boolean;          // is a hand currently running at the table
  deadline: number | null;  // action deadline for the acting player
  onSit?: () => void;       // provided for empty seats when you can sit
}) {
  // Empty seat → sit-down button (or placeholder for spectators mid-hand).
  if (!view) {
    return onSit ? (
      <button
        onClick={onSit}
        className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-dashed border-gold-500/40 bg-night-950/60 px-2.5 py-1.5 text-[11px] text-gold-400/80 backdrop-blur-sm transition-colors hover:border-gold-500/80 hover:bg-gold-500/10 hover:text-gold-300 sm:gap-2 sm:px-4 sm:py-2.5 sm:text-[13px]"
      >
        <span className="text-base leading-none">+</span> Sit here
      </button>
    ) : (
      <div className="h-8 w-8 rounded-full border border-dashed border-white/15 bg-night-950/40 sm:h-10 sm:w-10" />
    );
  }

  const showCards = view.shownCards ?? (isYou ? holeCards : undefined);
  const hasCards = inHand && !view.folded && (showCards?.length || !isYou);

  return (
    <div className={cn('flex flex-col items-center gap-1', view.folded && 'opacity-40')}>
      {/* Player pill — sits on top of the seat; cards hang below, over the felt */}
      <div
        className={cn(
          'relative flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 shadow-[0_6px_18px_rgba(0,0,0,0.5)] backdrop-blur-md sm:gap-2.5 sm:py-1.5 sm:pl-1.5 sm:pr-4',
          view.acting
            ? 'animate-pulseRing border-ens-400 bg-night-950/75'
            : isYou
              ? 'border-gold-500/60 bg-gold-500/[0.18]'
              : 'border-gold-500/25 bg-night-950/70',
          !view.connected && 'grayscale',
        )}
      >
        {view.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={view.avatar}
            alt=""
            className="h-7 w-7 shrink-0 rounded-full border-2 border-gold-300/50 object-cover sm:h-[42px] sm:w-[42px] md:h-[48px] md:w-[48px]"
          />
        ) : (
          <span className="gold-fill flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-gold-300/70 font-display text-[13px] font-bold text-night-900 sm:h-[42px] sm:w-[42px] sm:text-[18px] md:h-[48px] md:w-[48px]">
            {displayName(view.ensName, view.address).slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 text-left">
          <p className="max-w-[72px] truncate text-[10.5px] font-semibold text-slate-100 sm:max-w-32 sm:text-[13px] md:max-w-40 md:text-[14px]">
            {isYou ? 'You · ' : ''}
            {displayName(view.ensName, view.address)}
          </p>
          <p className="font-mono text-[10px] tabular-nums text-gold-400 sm:text-[12px] md:text-[12.5px]">
            {formatChips(view.stack)}
          </p>
        </div>
        {view.isButton && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-cream text-[9px] font-bold text-night-950 shadow sm:h-6 sm:w-6 sm:text-[10px]">
            D
          </span>
        )}
        {view.allIn && (
          <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded bg-red-600 px-2 text-[10px] font-bold uppercase text-white">
            All-in
          </span>
        )}
      </div>

      {/* Action timer */}
      {view.acting && deadline && <TimerBar deadline={deadline} />}

      {/* Hole cards, below the pill (toward the felt) */}
      {hasCards ? (
        <div className="flex gap-1">
          {showCards?.length ? (
            showCards.map((c, i) => (
              <PlayingCard key={i} card={c} size="sm" className="h-8 w-[22px] text-[10px] sm:h-10 sm:w-7 sm:text-xs" />
            ))
          ) : (
            <>
              <PlayingCard size="sm" faceDown className="h-8 w-[22px] sm:h-10 sm:w-7" />
              <PlayingCard size="sm" faceDown className="h-8 w-[22px] sm:h-10 sm:w-7" />
            </>
          )}
        </div>
      ) : null}

      {/* Current street bet, displayed as chips in front of the seat */}
      {view.bet > 0 && (
        <span className="rounded-full border border-gold-500/30 bg-night-950/80 px-2 py-0.5 font-mono text-[10px] tabular-nums text-gold-300 sm:px-2.5 sm:text-[11.5px]">
          {formatChips(view.bet)}
        </span>
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
    <div className="h-1 w-20 overflow-hidden rounded-full bg-night-800/90 sm:w-28">
      <div
        className={cn('h-full transition-all', pct < 30 ? 'bg-red-500' : 'bg-ens-400')}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
