/**
 * Lightweight wallet authentication.
 *
 * The client signs a static message once per session; the signature is
 * attached to state-changing requests and to the WebSocket upgrade.
 * Good enough for virtual chips — see README "Security notes" for the
 * production upgrade path (nonce + expiry, i.e. full SIWE).
 */
import { verifyMessage } from 'viem';

/** Must match SIGN_IN_MESSAGE in frontend/lib/auth.ts exactly. */
export function signInMessage(address: string): string {
  return `Sign in to epoker.eth\n\nWallet: ${address.toLowerCase()}\n\nThis signature only proves wallet ownership. It costs no gas and grants no token approvals.`;
}

export async function verifyAuth(address: string, signature: string): Promise<boolean> {
  try {
    return await verifyMessage({
      address: address as `0x${string}`,
      message: signInMessage(address),
      signature: signature as `0x${string}`,
    });
  } catch {
    return false;
  }
}
