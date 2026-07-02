'use client';
/**
 * The felt: 9 seats positioned around an oval, community cards, pot,
 * stage indicator and the "waiting for players" overlay. Fully fluid —
 * seat positions are percentage-based so the table scales from phones
 * to desktops.
 */
import type { TableView, Card } from '@/lib/types';
import { formatChips } from '@/lib/utils';
import { PlayingCard } from './PlayingCard';
import { Seat } from './Seat';

/** Percentage positions for up to 9 seats around the oval (clockwise, seat 0 bottom-center). */
const SEAT_POS: Array<{ left: string; top: string }> = [
  { left: '50%', top: '96%' },
  { left: '18%', top: '88%' },
  { left: '2%', top: '58%' },
  { left: '7%', top: '24%' },
  { left: '30%', top: '4%' },
  { left: '70%', top: '4%' },
  { left: '93%', top: '24%' },
  { left: '98%', top: '58%' },
  { left: '82%', top: '88%' },
];

const STAGE_LABEL: Record<string, string> = {
  waiting: 'Waiting', preflop: 'Pre-flop', flop: 'Flop',
  turn: 'Turn', river: 'River', showdown: 'Showdown',
};

export function PokerTable({
  state,
  onSit,
}: {
  state: TableView;
  onSit: (seat: number) => void;
}) {
  const seatMap = new Map(state.seats.map((s) => [s.seat, s]));
  const inHand = state.stage !== 'waiting';
  const canSit = state.yourSeat === null && state.seats.length < state.maxPlayers;

  return (
    <div className="relative mx-auto aspect-[16/10] w-full max-w-4xl select-none px-10 py-8 sm:px-14">
      {/* Felt surface */}
      <div className="felt absolute inset-x-10 inset-y-8 rounded-[45%/50%] sm:inset-x-14">
        {/* Branding on the felt, like the physical table */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 pt-2 opacity-60">
          <span className="font-display text-2xl tracking-wide text-gold-400/80 sm:text-3xl">
            epoker.eth
          </span>
          <span className="text-[9px] uppercase tracking-[0.35em] text-gold-500/60 sm:text-[11px]">
            ENS High Roller Table
          </span>
        </div>

        {/* Community cards + pot */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          {state.community.length > 0 && (
            <div className="mt-16 flex gap-1.5 sm:gap-2">
              {state.community.map((c: Card, i: number) => (
                <PlayingCard key={i} card={c} size="md" />
              ))}
            </div>
          )}
          {state.pot > 0 && (
            <span className="rounded-full bg-night-950/70 px-3 py-1 text-xs tabular-nums text-gold-300 ring-1 ring-gold-500/40">
              Pot {formatChips(state.pot)}
            </span>
          )}
        </div>

        {/* Stage chip */}
        <span className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-night-950/70 px-3 py-0.5 text-[10px] uppercase tracking-widest text-slate-400">
          {STAGE_LABEL[state.stage]} {inHand && `· Hand #${state.handNumber}`}
        </span>

        {/* Waiting overlay — the 4-player minimum is a core product rule */}
        {state.stage === 'waiting' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-2xl bg-night-950/85 px-6 py-4 text-center ring-1 ring-white/10">
              {state.waitingFor > 0 ? (
                <>
                  <p className="font-display text-lg text-slate-100">
                    Waiting for {state.waitingFor} more player{state.waitingFor === 1 ? '' : 's'}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Hands start with {state.minPlayers}+ seated — invite friends by ENS name!
                  </p>
                </>
              ) : (
                <p className="font-display text-lg text-ens-300">Shuffling up — dealing shortly…</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Seats around the rim */}
      {SEAT_POS.map((pos, seatIdx) => (
        <div
          key={seatIdx}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: pos.left, top: pos.top }}
        >
          <Seat
            view={seatMap.get(seatIdx) ?? null}
            holeCards={state.yourSeat === seatIdx ? state.holeCards : undefined}
            isYou={state.yourSeat === seatIdx}
            inHand={inHand}
            deadline={state.actionDeadline}
            onSit={canSit && !seatMap.get(seatIdx) ? () => onSit(seatIdx) : undefined}
          />
        </div>
      ))}
    </div>
  );
}
