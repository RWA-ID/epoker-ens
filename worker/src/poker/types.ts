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
  handle: string | null;
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
  /** A house bot (practice table only). */
  bot?: boolean;
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
  /** Smallest legal raise target *for you*, capped at your all-in. */
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
  /** Practice table: bots fill empty seats, no bankroll or leaderboard. */
  practice?: boolean;
  /** The table's voice Space — only on tables created with one. */
  space?: SpaceView;
}

/* ---------- Spaces (voice rooms on a table — see worker/src/space.ts) ---------- */

export type SpaceRole = 'host' | 'cohost' | 'speaker' | 'listener';

export interface SpaceMember {
  address: string;
  handle: string | null;
  avatar: string | null;
  role: SpaceRole;
  /** Holds an audio connection right now. */
  inAudio: boolean;
  /** Publishing a mic track (may still be self-muted). */
  speaking: boolean;
  /** Self-muted, host-muted, or simply not publishing. */
  muted: boolean;
}

/** A live speaker track to pull from the SFU. */
export interface SpaceTrack {
  address: string;
  sessionId: string;
  trackName: string;
}

export interface SpaceView {
  /** The worker has SFU credentials. False = show the Space, but it can't start. */
  enabled: boolean;
  live: boolean;
  startedAt: number | null;
  host: string;
  /** Your role, or null when signed out. */
  you: SpaceRole | null;
  youInAudio: boolean;
  handRaised: boolean;
  /** Private tables: only the guest list may listen. */
  canJoin: boolean;
  /** Host, co-hosts and speakers who are here. */
  stage: SpaceMember[];
  /** Raised hands, oldest first. */
  hands: SpaceMember[];
  listeners: number;
  tracks: SpaceTrack[];
}

/** One invited player on a private table's guest list. */
export interface WhitelistEntry {
  address: string; // lowercase 0x…
  handle: string | null;
}

export interface HandResultShare {
  seat: number;
  address: string;
  handle: string | null;
  amount: number;
  handName: string | null;
  cards?: Card[];
}

export interface ChatMessage {
  address: string;
  handle: string | null;
  text: string;
  ts: number;
}

/* ---------- Client → Server ---------- */

export type ClientMessage =
  | { type: 'sit'; seat: number }
  | { type: 'leave' }
  | { type: 'action'; action: ActionType; amount?: number }
  | { type: 'chat'; text: string }
  | { type: 'ping' }
  | { type: 'space:start' | 'space:end' | 'space:raise' | 'space:lower' | 'space:hangup' }
  | { type: 'space:invite' | 'space:remove' | 'space:mute'; address: string }
  | { type: 'space:cohost'; address: string; on: boolean }
  | { type: 'space:selfmute'; muted: boolean };

/* ---------- Server → Client ---------- */

/** One line of the hand log: an action, a blind, a street or a win. */
export interface HandLogEntry {
  hand: number;
  /** The player the line is about; null for dealer lines (a new hand, a street). */
  address: string | null;
  handle: string | null;
  /** "posts SB", "folds", "raises to", "wins with Two Pair", "Flop"… */
  text: string;
  amount: number | null;
  cards?: Card[];
  ts: number;
}

export type ServerMessage =
  | { type: 'state'; state: TableView }
  | { type: 'chat'; message: ChatMessage }
  | { type: 'handResult'; winners: HandResultShare[]; board: Card[] }
  | { type: 'log'; entry: HandLogEntry }
  | { type: 'error'; error: string }
  | { type: 'notice'; text: string }
  | { type: 'pong' };

/* ---------- Constants ---------- */

/** A hand only starts once this many players are seated (product requirement: bring friends). */
export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 8;
/** Seconds a player has to act before being auto-checked/folded. */
export const ACTION_SECONDS = 30;
/** Pause between hands so players can read the result. */
export const INTERHAND_MS = 6000;
/** The always-on table where house bots fill empty seats. */
export const PRACTICE_TABLE_ID = 'practice';
/** How long a dropped player keeps their seat (phones drop sockets on app switch). */
export const DISCONNECT_GRACE_MS = 60_000;
/** Buy-in is a fixed number of big blinds. */
export const BUYIN_BB = 100;
