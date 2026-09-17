/**
 * Sign-in: Sign-In with Ethereum (EIP-4361) → short-lived session token.
 *
 * Replaces the old static-message signature, which was replayable forever:
 * anyone who ever saw it (a log line, a leaked WebSocket URL) could play as
 * that wallet. Now:
 *
 *   1. GET  /auth/nonce          → a one-time nonce, stored in D1 with a TTL
 *   2. the wallet signs a SIWE message carrying that nonce, the page's domain
 *      and an expiry — wallets show the domain, so a phishing page can't
 *      borrow a HoodPoker sign-in
 *   3. POST /auth/verify         → nonce consumed (single use), signature
 *      checked, and an HMAC session token returned
 *
 * The token (`address.expiry.mac`) is what API calls and WebSocket upgrades
 * carry. It is stateless, so rotating SESSION_SECRET signs everybody out.
 */
import { verifyMessage } from 'viem';
import { parseSiweMessage } from 'viem/siwe';
import type { Env } from './env';

export const SIWE_CHAIN_ID = 4663;
/** How long a nonce may wait for its signature. */
export const NONCE_TTL_MS = 10 * 60_000;
/** How long a session lasts before the wallet is asked to sign again. */
export const SESSION_TTL_MS = 24 * 3600_000;

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Origins allowed to call the API and open sockets, from ALLOWED_ORIGINS. */
export function allowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

export function isAllowedOrigin(env: Env, origin: string | null): boolean {
  return !!origin && allowedOrigins(env).includes(origin);
}

/* ---------------- nonces ---------------- */

export async function issueNonce(env: Env): Promise<string> {
  // SIWE nonces are alphanumeric, 8+ chars.
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(18))).replace(/[-_]/g, 'x');
  const now = Date.now();
  await env.DB.batch([
    // Opportunistic sweep so the table never grows unbounded.
    env.DB.prepare('DELETE FROM auth_nonces WHERE expires_at < ?').bind(now),
    env.DB.prepare('INSERT INTO auth_nonces (nonce, expires_at) VALUES (?, ?)').bind(nonce, now + NONCE_TTL_MS),
  ]);
  return nonce;
}

/** Delete-on-use: true exactly once per live nonce. */
async function consumeNonce(env: Env, nonce: string): Promise<boolean> {
  const res = await env.DB.prepare('DELETE FROM auth_nonces WHERE nonce = ? AND expires_at >= ?')
    .bind(nonce, Date.now()).run();
  return (res.meta.changes ?? 0) > 0;
}

/* ---------------- session tokens ---------------- */

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function issueToken(env: Env, address: string, now = Date.now()): Promise<{ token: string; expiresAt: number }> {
  if (!env.SESSION_SECRET) throw new Error('SESSION_SECRET is not configured');
  const expiresAt = now + SESSION_TTL_MS;
  const addr = address.toLowerCase();
  const mac = await hmac(env.SESSION_SECRET, `v1|${addr}|${expiresAt}`);
  return { token: `${addr}.${expiresAt}.${mac}`, expiresAt };
}

/** The address a token vouches for, or null if it's forged or expired. */
export async function verifyToken(env: Env, token: string | null | undefined): Promise<string | null> {
  if (!token || !env.SESSION_SECRET) return null;
  const [addr, exp, mac] = token.split('.');
  if (!/^0x[0-9a-f]{40}$/.test(addr ?? '') || !/^\d{13}$/.test(exp ?? '') || !mac) return null;
  if (Number(exp) < Date.now()) return null;
  const expected = await hmac(env.SESSION_SECRET, `v1|${addr}|${exp}`);
  return constantTimeEqual(mac, expected) ? addr : null;
}

/* ---------------- SIWE verification ---------------- */

export type VerifyResult = { ok: true; address: string } | { ok: false; error: string };

/**
 * Check a signed SIWE message. `origin` is the request's Origin header — the
 * message's domain and URI must both name that allowed origin.
 */
export async function verifySiwe(
  env: Env,
  message: string,
  signature: string,
  origin: string | null,
): Promise<VerifyResult> {
  if (typeof message !== 'string' || message.length > 2000) return { ok: false, error: 'bad message' };
  if (!/^0x[0-9a-fA-F]+$/.test(signature ?? '')) return { ok: false, error: 'bad signature' };

  let fields: ReturnType<typeof parseSiweMessage>;
  try {
    fields = parseSiweMessage(message);
  } catch {
    return { ok: false, error: 'bad message' };
  }
  const { address, domain, uri, chainId, nonce, expirationTime, notBefore } = fields;
  if (!address || !domain || !uri || !nonce) return { ok: false, error: 'incomplete message' };
  if (chainId !== SIWE_CHAIN_ID) return { ok: false, error: 'wrong chain' };

  let uriOrigin: string;
  try { uriOrigin = new URL(uri).origin; } catch { return { ok: false, error: 'bad uri' }; }
  if (!isAllowedOrigin(env, uriOrigin) || new URL(uriOrigin).host !== domain) {
    return { ok: false, error: 'domain not allowed' };
  }
  // A browser always sends Origin on this POST. If it's there it must agree
  // with what the wallet showed the player.
  if (origin && origin !== uriOrigin) return { ok: false, error: 'origin mismatch' };

  const now = Date.now();
  if (expirationTime && expirationTime.getTime() < now) return { ok: false, error: 'message expired' };
  if (notBefore && notBefore.getTime() > now + 60_000) return { ok: false, error: 'message not yet valid' };

  let valid = false;
  try {
    valid = await verifyMessage({ address, message, signature: signature as `0x${string}` });
  } catch { /* malformed → invalid */ }
  if (!valid) return { ok: false, error: 'invalid signature' };

  // Consume last: a bad signature must not burn somebody else's nonce.
  if (!(await consumeNonce(env, nonce))) return { ok: false, error: 'nonce expired or already used' };

  return { ok: true, address: address.toLowerCase() };
}
