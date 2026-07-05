'use client';
/** Typed fetch helpers for the Cloudflare Worker lobby API. */
import { WORKER_URL } from './config';
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

async function post<T>(path: string, auth: { address: string; sig: string }, body?: unknown): Promise<T> {
  const res = await fetch(`${WORKER_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Address': auth.address,
      'X-Signature': auth.sig,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `API ${path} failed: ${res.status}`);
  return data;
}

export const api = {
  listTables: () => get<{ tables: LobbyTable[] }>('/tables'),
  createTable: (auth: { address: string; sig: string }, options: CreateTableOptions) =>
    post<{ id: string }>('/tables', auth, options),
  leaderboard: () => get<{ leaderboard: LeaderboardRow[] }>('/leaderboard'),
  profile: (address: string) => get<{ profile: PlayerProfile | null }>(`/profile/${address}`),
  claim: (auth: { address: string; sig: string }) =>
    post<{ claimed: number }>('/claim', auth),
};
