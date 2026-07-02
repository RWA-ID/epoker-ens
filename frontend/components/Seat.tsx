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
        className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-dashed border-gold-500/40 bg-night-950/60 px-3.5 py-2 text-xs text-gold-400/80 backdrop-blur-sm transition-colors hover:border-gold-500/80 hover:bg-gold-500/10 hover:text-gold-300"
      >
        <span className="text-sm leading-none">+</span> Sit here
      </button>
    ) : (
      <div className="h-8 w-8 rounded-full border border-dashed border-white/15 bg-night-950/40" />
    );
  }

  const showCards = view.shownCards ?? (isYou ? holeCards : undefined);
  const hasCards = inHand && !view.folded && (showCards?.length || !isYou);

  return (
    <div className={cn('flex flex-col items-center gap-1', view.folded && 'opacity-40')}>
      {/* Hole cards */}
      {hasCards ? (
        <div className="flex gap-1">
          {showCards?.length ? (
            showCards.map((c, i) => <PlayingCard key={i} card={c} size="sm" />)
          ) : (
            <>
              <PlayingCard size="sm" faceDown />
              <PlayingCard size="sm" faceDown />
            </>
          )}
        </div>
      ) : null}

      {/* Player pill */}
      <div
        className={cn(
          'relative flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 shadow-[0_6px_18px_rgba(0,0,0,0.5)] backdrop-blur-md',
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
            className="h-[30px] w-[30px] shrink-0 rounded-full border-2 border-gold-300/50 object-cover sm:h-[34px] sm:w-[34px]"
          />
        ) : (
          <span className="gold-fill flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border-2 border-gold-300/70 font-display text-[13px] font-bold text-night-900 sm:h-[34px] sm:w-[34px]">
            {displayName(view.ensName, view.address).slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 text-left">
          <p className="max-w-24 truncate text-[11px] font-semibold text-slate-100 sm:max-w-28 sm:text-[11.5px]">
            {isYou ? 'You · ' : ''}
            {displayName(view.ensName, view.address)}
          </p>
          <p className="font-mono text-[10.5px] tabular-nums text-gold-400 sm:text-[11px]">
            {formatChips(view.stack)}
          </p>
        </div>
        {view.isButton && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-cream text-[9px] font-bold text-night-950 shadow">
            D
          </span>
        )}
        {view.allIn && (
          <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded bg-red-600 px-1.5 text-[9px] font-bold uppercase text-white">
            All-in
          </span>
        )}
      </div>

      {/* Action timer */}
      {view.acting && deadline && <TimerBar deadline={deadline} />}

      {/* Current street bet, displayed as chips in front of the seat */}
      {view.bet > 0 && (
        <span className="rounded-full border border-gold-500/30 bg-night-950/80 px-2 py-0.5 font-mono text-[10px] tabular-nums text-gold-300">
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
    <div className="h-1 w-20 overflow-hidden rounded-full bg-night-800/90">
      <div
        className={cn('h-full transition-all', pct < 30 ? 'bg-red-500' : 'bg-ens-400')}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
