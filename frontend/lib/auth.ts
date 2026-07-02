'use client';
/**
 * One-time wallet sign-in for the poker backend.
 * The signature is cached in sessionStorage and attached to every
 * authenticated API call / WebSocket connection.
 *
 * MUST stay byte-identical to worker/src/auth.ts signInMessage().
 */

export function signInMessage(address: string): string {
  return `Sign in to epoker.eth\n\nWallet: ${address.toLowerCase()}\n\nThis signature only proves wallet ownership. It costs no gas and grants no token approvals.`;
}

const KEY = (address: string) => `epoker:sig:${address.toLowerCase()}`;

export function cachedSignature(address: string): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(KEY(address));
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
  sessionStorage.setItem(KEY(address), signature);
  return signature;
}
