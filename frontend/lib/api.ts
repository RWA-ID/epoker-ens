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

export const api = {
  listTables: () => get<{ tables: LobbyTable[] }>('/tables'),
  createTable: (auth: ApiAuth, options: CreateTableOptions) =>
    post<{ id: string }>('/tables', auth, options),
  leaderboard: () => get<{ leaderboard: LeaderboardRow[] }>('/leaderboard'),
  profile: (address: string) => get<{ profile: PlayerProfile | null }>(`/profile/${address}`),
  claim: (auth: ApiAuth) =>
    post<{ claimed: number }>('/claim', auth),
};
