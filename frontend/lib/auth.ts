'use client';
/**
 * One-time wallet sign-in for the poker backend.
 * The signature is cached in sessionStorage and attached to every
 * authenticated API call / WebSocket connection.
 *
 * MUST stay byte-identical to worker/src/auth.ts signInMessage().
 */

export function signInMessage(address: string): string {
  return `Sign in to Hoodpoker\n\nWallet: ${address.toLowerCase()}\n\nThis signature only proves wallet ownership. It costs no gas, moves no funds, and grants no token approvals.`;
}

const KEY = (address: string) => `epoker:sig:${address.toLowerCase()}`;

export function cachedSignature(address: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(KEY(address));
  } catch {
    return null;
  }
}

/** Forget one wallet's cached sign-in (used on disconnect). */
export function clearSignature(address: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(KEY(address));
  } catch {
    /* nothing cached */
  }
}

/**
 * Return a cached signature or prompt the wallet to sign.
 * `sign` is wagmi's signMessageAsync.
 */
export async function ensureAuth(
  address: string,
  sign: (args: { message: string }) => Promise<string>,
): Promise<string> {
  const cached = cachedSignature(address);
  if (cached) return cached;
  const signature = await sign({ message: signInMessage(address) });
  try {
    sessionStorage.setItem(KEY(address), signature);
  } catch {
    /* private mode — they'll re-sign next load */
  }
  return signature;
}
