'use client';
/**
 * Betting controls shown when it's your turn:
 * Fold / Check / Call N / Bet–Raise (slider + presets) / All-in.
 */
import { useEffect, useMemo, useState } from 'react';
import type { TableView, ActionType } from '@/lib/types';
import { formatChips } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export function ActionBar({
  state,
  onAct,
}: {
  state: TableView;
  onAct: (action: ActionType, amount?: number) => void;
}) {
  const me = state.seats.find((s) => s.seat === state.yourSeat);
  const isMyTurn = !!me?.acting;

  const toCall = me ? Math.min(state.currentBet - me.bet, me.stack) : 0;
  const canCheck = toCall <= 0;
  const maxTo = me ? me.bet + me.stack : 0; // all-in target
  const minTo = Math.min(state.minRaiseTo, maxTo);
  const isOpening = state.currentBet === 0;

  const [raiseTo, setRaiseTo] = useState(minTo);
  useEffect(() => setRaiseTo(minTo), [minTo, state.handNumber, state.stage]);

  const presets = useMemo(() => {
    const pot = state.pot;
    return [
      { label: '½ pot', value: state.currentBet + Math.floor(pot / 2) },
      { label: 'Pot', value: state.currentBet + pot },
      { label: '2× pot', value: state.currentBet + pot * 2 },
    ].filter((p) => p.value > minTo && p.value < maxTo);
  }, [state.pot, state.currentBet, minTo, maxTo]);

  if (!me || me.folded || me.allIn) return null;

  return (
    <div className="mx-auto w-full max-w-3xl rounded-2xl border border-white/10 bg-night-850/95 p-3.5 shadow-2xl backdrop-blur">
      {!isMyTurn ? (
        <p className="py-2 text-center text-sm text-slate-500">
          {state.stage === 'waiting' ? 'Hand starting soon…' : 'Waiting for other players…'}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Raise sizing */}
          {maxTo > state.currentBet && (
            <div className="flex items-center gap-3 px-1">
              <input
                type="range"
                min={minTo}
                max={maxTo}
                step={state.smallBlind}
                value={raiseTo}
                onChange={(e) => setRaiseTo(Number(e.target.value))}
                className="flex-1 accent-gold-500"
                aria-label="Raise amount"
              />
              <span className="w-24 text-right font-mono text-sm tabular-nums text-gold-300">
                {formatChips(Math.min(raiseTo, maxTo))}
              </span>
              <div className="hidden gap-1 sm:flex">
                {presets.map((p) => (
                  <Button key={p.label} variant="ghost" size="sm" onClick={() => setRaiseTo(p.value)}>
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="grid grid-cols-4 gap-2">
            <Button variant="danger" onClick={() => onAct('fold')}>Fold</Button>
            {canCheck ? (
              <Button variant="neutral" onClick={() => onAct('check')}>Check</Button>
            ) : (
              <Button variant="neutral" onClick={() => onAct('call')}>
                Call {formatChips(toCall)}
              </Button>
            )}
            <Button
              onClick={() => onAct(isOpening ? 'bet' : 'raise', Math.min(raiseTo, maxTo))}
              disabled={maxTo <= state.currentBet}
            >
              {isOpening ? 'Bet' : 'Raise to'} {formatChips(Math.min(raiseTo, maxTo))}
            </Button>
            <Button variant="outline" onClick={() => onAct('allin')}>
              All-in {formatChips(me.stack)}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
