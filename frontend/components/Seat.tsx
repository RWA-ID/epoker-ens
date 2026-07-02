'use client';
/**
 * One seat around the felt: avatar, ENS name, stack, current bet,
 * dealer button, action-timer ring, and hole cards (yours face-up,
 * everyone else's face-down until showdown reveals them).
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
        className="flex h-20 w-24 flex-col items-center justify-center rounded-xl border border-dashed border-white/20 text-xs text-slate-400 transition-colors hover:border-gold-500/60 hover:text-gold-400"
      >
        <span className="text-lg leading-none">+</span>
        Sit here
      </button>
    ) : (
      <div className="h-20 w-24 rounded-xl border border-dashed border-white/10" />
    );
  }

  const showCards = view.shownCards ?? (isYou ? holeCards : undefined);
  const hasCards = inHand && !view.folded && (showCards?.length || !isYou);

  return (
    <div className={cn('flex w-28 flex-col items-center gap-1', view.folded && 'opacity-40')}>
      {/* Hole cards */}
      <div className="flex h-11 gap-1">
        {hasCards ? (
          showCards?.length ? (
            showCards.map((c, i) => <PlayingCard key={i} card={c} size="sm" />)
          ) : (
            <>
              <PlayingCard size="sm" faceDown />
              <PlayingCard size="sm" faceDown />
            </>
          )
        ) : null}
      </div>

      {/* Player plate */}
      <div
        className={cn(
          'relative flex w-full items-center gap-2 rounded-xl border bg-night-900/95 px-2 py-1.5',
          view.acting
            ? 'animate-pulseRing border-ens-400'
            : isYou
              ? 'border-gold-500/50'
              : 'border-white/10',
          !view.connected && 'grayscale',
        )}
      >
        {view.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={view.avatar} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ens-800 text-xs text-white">
            {displayName(view.ensName, view.address).slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-slate-100">
            {displayName(view.ensName, view.address)}
          </p>
          <p className="text-[11px] tabular-nums text-gold-300">{formatChips(view.stack)}</p>
        </div>
        {view.isButton && (
          <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[9px] font-bold text-night-950 shadow">
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
        <span className="rounded-full bg-night-950/80 px-2 py-0.5 text-[10px] tabular-nums text-ens-300 ring-1 ring-ens-400/30">
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
    <div className="h-1 w-full overflow-hidden rounded-full bg-night-800">
      <div
        className={cn('h-full transition-all', pct < 30 ? 'bg-red-500' : 'bg-ens-400')}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
