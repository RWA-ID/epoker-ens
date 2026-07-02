/**
 * Side-pot construction and payout.
 *
 * Instead of tracking pots incrementally during betting, we record each
 * player's TOTAL chips committed across the whole hand and slice pots at
 * showdown. This is the standard, bug-resistant approach: sort the
 * distinct all-in levels and build one pot layer per level.
 */

export interface Contributor {
  seat: number;
  /** Total chips this player put into the hand (all streets + blinds). */
  committed: number;
  /** Folded players fund pots but can never win them. */
  folded: boolean;
  /** Showdown score (higher wins). Undefined for folded players. */
  score?: number;
}

export interface PotShare {
  seat: number;
  amount: number;
}

/**
 * Split the total pot among winners, handling side pots.
 * Odd chips go to the earliest seat among the tied winners (deterministic).
 */
export function settlePots(contributors: Contributor[]): PotShare[] {
  const shares = new Map<number, number>();
  // Distinct commitment levels, ascending: each defines one pot layer.
  const levels = [...new Set(contributors.filter((c) => c.committed > 0).map((c) => c.committed))]
    .sort((a, b) => a - b);

  let prev = 0;
  for (const level of levels) {
    // Everyone who committed at least `level` funds this layer.
    const layerSize = (level - prev) *
      contributors.filter((c) => c.committed >= level).length;
    prev = level;

    // Only unfolded players who covered this level can win it.
    const eligible = contributors.filter(
      (c) => !c.folded && c.committed >= level && c.score !== undefined,
    );
    if (eligible.length === 0) continue; // cannot happen in a valid hand

    const bestScore = Math.max(...eligible.map((c) => c.score!));
    const winners = eligible
      .filter((c) => c.score === bestScore)
      .sort((a, b) => a.seat - b.seat);

    const base = Math.floor(layerSize / winners.length);
    let remainder = layerSize - base * winners.length;
    for (const w of winners) {
      const extra = remainder > 0 ? 1 : 0;
      remainder -= extra;
      shares.set(w.seat, (shares.get(w.seat) ?? 0) + base + extra);
    }
  }

  return [...shares.entries()].map(([seat, amount]) => ({ seat, amount }));
}
