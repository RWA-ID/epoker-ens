'use client';
/**
 * Sign-in for the poker backend: Sign-In with Ethereum → session token.
 *
 *   1. ask the worker for a one-time nonce
 *   2. the wallet signs a SIWE message naming this site's domain, the nonce
 *      and an expiry (wallets show the domain — a copycat site can't reuse it)
 *   3. the worker checks it and returns a 24h session token
 *
 * The token is cached in sessionStorage and attached to every authenticated
 * API call and WebSocket connection. It replaces the old static-message
 * signature, which never expired and could be replayed by anyone who saw it.
 */
import { createSiweMessage } from 'viem/siwe';
import { getAddress } from 'viem';
import { WORKER_URL } from './config';

/** Must match SIWE_CHAIN_ID in worker/src/session.ts. */
const SIWE_CHAIN_ID = 4663;

export interface AuthSession {
  token: string;
  expiresAt: number;
}

const KEY = (address: string) => `epoker:session:${address.toLowerCase()}`;
/** Treat a token this close to expiry as already gone. */
const EXPIRY_MARGIN_MS = 5 * 60_000;

export function cachedSession(address: string): AuthSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(KEY(address));
    if (!raw) return null;
    const s = JSON.parse(raw) as AuthSession;
    if (typeof s?.token !== 'string' || !(s.expiresAt - EXPIRY_MARGIN_MS > Date.now())) {
      sessionStorage.removeItem(KEY(address));
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

/** Forget one wallet's session (used on disconnect, expiry, or a 401). */
export function clearSession(address: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(KEY(address));
    sessionStorage.removeItem(`epoker:sig:${address.toLowerCase()}`); // pre-SIWE leftover
  } catch {
    /* nothing cached */
  }
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${WORKER_URL}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Sign-in failed (${res.status})`);
  return data;
}

/**
 * Return a cached session or run the SIWE flow.
 * `sign` is useWallet().signMessage (AppKit wallet or Privy passkey wallet).
 */
export async function ensureAuth(
  address: string,
  sign: (args: { message: string }) => Promise<string>,
): Promise<AuthSession> {
  const cached = cachedSession(address);
  if (cached) return cached;

  const { nonce } = await postJson<{ nonce: string }>('/auth/nonce');
  const now = new Date();
  const message = createSiweMessage({
    address: getAddress(address),
    domain: window.location.host,
    uri: window.location.origin,
    chainId: SIWE_CHAIN_ID,
    version: '1',
    nonce,
    issuedAt: now,
    expirationTime: new Date(now.getTime() + 10 * 60_000),
    statement:
      'Sign in to HoodPoker. This signature costs no gas, moves no funds and grants no token approvals.',
  });
  const signature = await sign({ message });
  const session = await postJson<AuthSession>('/auth/verify', { message, signature });
  try {
    sessionStorage.setItem(KEY(address), JSON.stringify(session));
  } catch {
    /* private mode — they'll sign again next load */
  }
  return session;
}
