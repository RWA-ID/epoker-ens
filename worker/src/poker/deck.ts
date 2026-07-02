/**
 * Deck utilities. Cards are 2-char strings: rank char + suit char.
 * Ranks: 2-9, T, J, Q, K, A.  Suits: c, d, h, s.
 */
import type { Card } from './types';

export const RANKS = '23456789TJQKA';
export const SUITS = 'cdhs';

/** Numeric rank of a card, 2..14 (ace high). */
export function rankOf(card: Card): number {
  return RANKS.indexOf(card[0]) + 2;
}

export function suitOf(card: Card): string {
  return card[1];
}

/** Build a fresh 52-card deck. */
export function freshDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(r + s);
  return deck;
}

/**
 * Fisher–Yates shuffle using crypto.getRandomValues.
 * Runs server-side inside the Durable Object, so clients can never
 * predict or influence the deck order.
 */
export function shuffle(deck: Card[]): Card[] {
  const buf = new Uint32Array(deck.length);
  crypto.getRandomValues(buf);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = buf[i] % (i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
