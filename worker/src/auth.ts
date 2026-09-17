/**
 * LEGACY static-message sign-in — superseded by SIWE (src/session.ts).
 *
 * Still accepted only while ALLOW_LEGACY_SIG=1, so the frontend pinned before
 * SIWE keeps working until epoker.eth points at the new build. The signature
 * never expires and can be replayed; delete this file once the flag is off.
 */
import { verifyMessage } from 'viem';

/** The message the pre-SIWE frontend signed. */
export function signInMessage(address: string): string {
  return `Sign in to Hoodpoker\n\nWallet: ${address.toLowerCase()}\n\nThis signature only proves wallet ownership. It costs no gas, moves no funds, and grants no token approvals.`;
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
