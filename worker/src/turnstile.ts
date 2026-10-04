/**
 * Cloudflare Turnstile, server side: one siteverify call per whitelist sign-up.
 *
 * Fails CLOSED. With no TURNSTILE_SECRET set, or if Cloudflare doesn't answer,
 * every sign-up is refused: the form is the only thing between a script and
 * the list (2026-10-04: 1,999 scripted sign-ups in 12 minutes), so "the check
 * was down" must never mean "let everyone in". Sign-ups are free and can wait.
 *
 *   wrangler secret put TURNSTILE_SECRET
 */
import type { Env } from './env';

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function turnstileOk(env: Pick<Env, 'TURNSTILE_SECRET'>, token: unknown, ip: string): Promise<boolean> {
  if (!env.TURNSTILE_SECRET) return false;
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) return false;
  try {
    const form = new FormData();
    form.append('secret', env.TURNSTILE_SECRET);
    form.append('response', token);
    if (ip !== 'unknown') form.append('remoteip', ip);
    const res = await fetch(SITEVERIFY, { method: 'POST', body: form });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
