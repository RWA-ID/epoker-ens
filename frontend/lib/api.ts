'use client';
/** Typed fetch helpers for the Cloudflare Worker lobby API. */
import { WORKER_URL } from './config';
import { clearSession } from './auth';
import type { LobbyTable, LeaderboardRow, PlayerProfile, WhitelistEntry } from './types';

export interface CreateTableOptions {
  name: string;
  smallBlind: number;
  /** Private = unlisted, whitelist-only seating, creator-chosen size. */
  isPrivate?: boolean;
  maxPlayers?: number;
  whitelist?: WhitelistEntry[];
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${WORKER_URL}${path}`);
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

/** Who is calling: the address and its session token from lib/auth.ts. */
export interface ApiAuth {
  address: string;
  token: string;
}

async function post<T>(path: string, auth: ApiAuth, body?: unknown): Promise<T> {
  const res = await fetch(`${WORKER_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  // A rejected token (expired, or the server secret rotated) must not stick:
  // drop it so the next attempt signs in again.
  if (res.status === 401) clearSession(auth.address);
  if (!res.ok) throw new Error(res.status === 401 ? 'Session expired — please try again.' : data.error ?? `API ${path} failed: ${res.status}`);
  return data;
}

/** House Pass whitelist — mirrors worker/src/whitelist.ts. */
export interface WhitelistStatus {
  /** Sign-ups so far, waitlist included. */
  count: number;
  cap: number;
  waitlist: number;
  open: boolean;
  joined?: boolean;
  /** 1-based sign-up order; above `cap` = waitlisted. */
  position?: number;
}

export type WhitelistJoin =
  | { ok: true; already: boolean; count: number; cap: number; waitlist: number; position: number; holdsCcff00: boolean | null }
  | { ok: false; reason: 'closed' | 'full' | 'handle-taken'; count: number; cap: number; waitlist: number };

/**
 * v2: no session — X handle + pasted wallet + a Turnstile token. A refusal
 * (full, closed, handle taken) is an answer the page shows, not an error, so
 * only bad input and transport failures throw — with the worker's own message,
 * which is written for the person reading it.
 */
async function joinWhitelist(body: { address: string; handle: string; turnstile: string }): Promise<WhitelistJoin> {
  const res = await fetch(`${WORKER_URL}/whitelist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (typeof data?.ok !== 'boolean') {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : res.status === 429 ? 'Too many tries — wait a minute and try again.' : `Whitelist failed: ${res.status}`,
    );
  }
  return data as unknown as WhitelistJoin;
}

export const api = {
  whitelist: (address?: string) =>
    get<WhitelistStatus>(`/whitelist${address ? `?address=${address.toLowerCase()}` : ''}`),
  joinWhitelist,
  listTables: () => get<{ tables: LobbyTable[] }>('/tables'),
  createTable: (auth: ApiAuth, options: CreateTableOptions) =>
    post<{ id: string }>('/tables', auth, options),
  leaderboard: () => get<{ leaderboard: LeaderboardRow[] }>('/leaderboard'),
  profile: (address: string) => get<{ profile: PlayerProfile | null }>(`/profile/${address}`),
  claim: (auth: ApiAuth) =>
    post<{ claimed: number }>('/claim', auth),
};
