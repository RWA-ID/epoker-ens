/**
 * Shared protocol types for ENS Hold'em.
 *
 * NOTE: `frontend/lib/types.ts` mirrors these types 1:1 for the client.
 * If you change the wire protocol here, update that file too.
 */

/** Card as a 2-char code: rank + suit, e.g. "As" (ace of spades), "Td" (ten of diamonds). */
export type Card = string;

export type Stage = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';

/** Public view of a seated player (hole cards are stripped for everyone but the owner). */
export interface SeatView {
  seat: number;
  address: string;
  ensName: string | null;
  avatar: string | null;
  stack: number;
  /** Chips committed on the current betting street. */
  bet: number;
  folded: boolean;
  allIn: boolean;
  connected: boolean;
  /** True while it is this player's turn to act. */
  acting: boolean;
  /** Dealer button indicator. */
  isButton: boolean;
  /** Revealed hole cards — only present at showdown. */
  shownCards?: Card[];
}

/** Full table snapshot broadcast to clients (per-connection sanitized). */
export interface TableView {
  id: string;
  name: string;
  smallBlind: number;
  bigBlind: number;
  buyIn: number;
  minPlayers: number;
  maxPlayers: number;
  stage: Stage;
  handNumber: number;
  community: Card[];
  pot: number;
  currentBet: number;
  minRaiseTo: number;
  seats: SeatView[];
  /** Your own hole cards (empty when not in a hand). */
  holeCards: Card[];
  /** Your seat number, or null if spectating. */
  yourSeat: number | null;
  /** Unix ms deadline for the acting player, null when no action pending. */
  actionDeadline: number | null;
  /** How many more players are needed before a hand can start. */
  waitingFor: number;
  /** Private tables are unlisted and only whitelisted players may sit. */
  isPrivate: boolean;
  /** Whether YOU are allowed to take a seat (always true on public tables). */
  canSit: boolean;
  /** Guest list — only present on private tables. */
  whitelist?: WhitelistEntry[];
}

/** One invited player on a private table's guest list. */
export interface WhitelistEntry {
  address: string; // lowercase 0x…
  ensName: string | null;
}

export interface HandResultShare {
  seat: number;
  address: string;
  ensName: string | null;
  amount: number;
  handName: string | null;
  cards?: Card[];
}

export interface ChatMessage {
  address: string;
  ensName: string | null;
  text: string;
  ts: number;
}

/* ---------- Client → Server ---------- */

export type ClientMessage =
  | { type: 'sit'; seat: number }
  | { type: 'leave' }
  | { type: 'action'; action: ActionType; amount?: number }
  | { type: 'chat'; text: string }
  | { type: 'ping' };

/* ---------- Server → Client ---------- */

export type ServerMessage =
  | { type: 'state'; state: TableView }
  | { type: 'chat'; message: ChatMessage }
  | { type: 'handResult'; winners: HandResultShare[]; board: Card[] }
  | { type: 'error'; error: string }
  | { type: 'pong' };

/* ---------- Constants ---------- */

/** A hand only starts once this many players are seated (product requirement: bring friends). */
export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 9;
/** Seconds a player has to act before being auto-checked/folded. */
export const ACTION_SECONDS = 30;
/** Pause between hands so players can read the result. */
export const INTERHAND_MS = 6000;
/** Buy-in is a fixed number of big blinds. */
export const BUYIN_BB = 100;
