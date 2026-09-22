/**
 * Hoodpoker — Cloudflare Worker entry point.
 *
 * Routes:
 *   GET  /tables                 list open tables (lobby — public tables only;
 *                                the always-on practice table is pinned first)
 *   POST /tables                 create a table (auth)
 *                                { name, smallBlind, isPrivate?, maxPlayers?, whitelist? }
 *                                Private tables are unlisted (share the link) and
 *                                only whitelisted addresses may sit.
 *   GET  /table/:id/state        read-only snapshot
 *   GET  /table/:id/ws           WebSocket upgrade (auth via query params)
 *   GET  /leaderboard            top players by net play chips
 *   GET  /profile/:address       one player's stats + bankroll
 *   POST /claim                  daily free chips (auth)
 *   GET  /auth/nonce             one-time SIWE nonce
 *   POST /auth/verify            { message, signature } → { token, expiresAt }
 *
 * Auth = Sign-In with Ethereum exchanged for a 24h session token (see
 * src/session.ts), sent as `Authorization: Bearer` or `?token=` on sockets.
 * Play chips only: nothing here mints, transfers or redeems value.
 * Each table is a Durable Object (src/table.ts) that owns all game state.
 */
import type { Env, RateLimiter } from './env';
import { verifyAuth } from './auth';
import { issueNonce, issueToken, isAllowedOrigin, verifySiwe, verifyToken } from './session';
import { MAX_PLAYERS, PRACTICE_TABLE_ID, WhitelistEntry } from './poker/types';

export { TableDO } from './table';

/** CORS for an allowed origin only — anything else gets no ACAO header. */
function corsHeaders(env: Env, request: Request): Record<string, string> {
  const origin = request.headers.get('Origin');
  const headers: Record<string, string> = { Vary: 'Origin' };
  if (isAllowedOrigin(env, origin)) {
    headers['Access-Control-Allow-Origin'] = origin!;
    headers['Access-Control-Allow-Methods'] = 'GET,POST,OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization,X-Address,X-Signature';
    headers['Access-Control-Max-Age'] = '86400';
  }
  return headers;
}

/**
 * The caller's verified address, or null.
 * Session token first; the static signature only while ALLOW_LEGACY_SIG=1.
 */
async function requireAuth(request: Request, url: URL, env: Env): Promise<string | null> {
  const bearer = request.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/)?.[1];
  const token = bearer ?? url.searchParams.get('token');
  if (token) return verifyToken(env, token);

  if (env.ALLOW_LEGACY_SIG !== '1') return null;
  const address = (request.headers.get('X-Address') ?? url.searchParams.get('address') ?? '').toLowerCase();
  const signature = request.headers.get('X-Signature') ?? url.searchParams.get('sig') ?? '';
  if (!/^0x[0-9a-f]{40}$/.test(address) || !signature) return null;
  return (await verifyAuth(address, signature)) ? address : null;
}

/** True when allowed (or when the limiter isn't bound, e.g. in tests). */
async function underLimit(limiter: RateLimiter | undefined, key: string): Promise<boolean> {
  if (!limiter) return true;
  try {
    return (await limiter.limit({ key })).success;
  } catch {
    return true; // a limiter outage must not take the game down
  }
}

/** Daily chip claim amount. */
const DAILY_CHIPS = 5000;

/**
 * The leaderboard ranks profit *per hand*, not total profit, so that a bigger
 * daily allowance (what a membership would buy) pays for more play without
 * buying rank. A raw average would put one lucky hand on top, so each player
 * is smoothed toward zero by this many phantom break-even hands: a short run
 * has to be very good to rank, a long one converges on its true average.
 */
const RANK_PRIOR_HANDS = 20;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const cors = corsHeaders(env, request);
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      /* ---------------- Sign-in ---------------- */

      if (path === '/auth/nonce' && request.method === 'GET') {
        if (!(await underLimit(env.AUTH_LIMITER, `nonce:${ip}`))) return json({ error: 'slow down' }, 429);
        return json({ nonce: await issueNonce(env) });
      }

      if (path === '/auth/verify' && request.method === 'POST') {
        if (!(await underLimit(env.AUTH_LIMITER, `verify:${ip}`))) return json({ error: 'slow down' }, 429);
        const body = (await request.json().catch(() => ({}))) as { message?: string; signature?: string };
        const result = await verifySiwe(
          env, String(body.message ?? ''), String(body.signature ?? ''), request.headers.get('Origin'),
        );
        if (!result.ok) return json({ error: result.error }, 401);
        return json(await issueToken(env, result.address));
      }

      /* ---------------- Lobby ---------------- */

      if (path === '/tables' && request.method === 'GET') {
        // Sweep long-empty tables (rows created before the DO alarm-based
        // cleanup existed, or whose alarm was somehow missed). Active tables
        // that were swept in a race re-register via the DO's lobby upsert.
        await env.DB.prepare('DELETE FROM tables WHERE seats = 0 AND created_at < ?')
          .bind(Date.now() - 30 * 60_000).run().catch(() => { /* best-effort */ });
        const { results } = await env.DB.prepare(
          `SELECT id, name, small_blind AS smallBlind, seats, status, created_at AS createdAt
           FROM tables ORDER BY seats DESC, created_at DESC LIMIT 50`,
        ).all<Record<string, unknown>>();
        // The practice table is always open, even with nobody at it (its row
        // only exists while someone is seated).
        const practice = results.find((t) => t.id === PRACTICE_TABLE_ID) ?? {
          id: PRACTICE_TABLE_ID, name: 'Practice Table', smallBlind: 10,
          seats: 0, status: 'waiting', createdAt: 0,
        };
        return json({
          tables: [
            { ...practice, practice: true },
            ...results.filter((t) => t.id !== PRACTICE_TABLE_ID),
          ],
        });
      }

      if (path === '/tables' && request.method === 'POST') {
        const address = await requireAuth(request, url, env);
        if (!address) return json({ error: 'unauthorized' }, 401);
        if (!(await underLimit(env.CREATE_LIMITER, address))) {
          return json({ error: 'Too many tables at once — try again in a minute.' }, 429);
        }

        const body = (await request.json().catch(() => ({}))) as {
          name?: string;
          smallBlind?: number;
          isPrivate?: boolean;
          maxPlayers?: number;
          whitelist?: { address?: string; handle?: string | null }[];
        };
        const name = String(body.name ?? '').slice(0, 40).trim() || 'Hoodpoker Table';
        const smallBlind = [5, 10, 25, 50].includes(Number(body.smallBlind)) ? Number(body.smallBlind) : 10;

        const isPrivate = body.isPrivate === true;
        const maxPlayers = isPrivate && Number.isInteger(Number(body.maxPlayers))
          ? Math.min(MAX_PLAYERS, Math.max(2, Number(body.maxPlayers)))
          : MAX_PLAYERS;

        // Sanitize the guest list: valid lowercase addresses, deduped, capped.
        // The creator is always on their own list.
        const whitelist: WhitelistEntry[] = [];
        if (isPrivate) {
          for (const raw of (Array.isArray(body.whitelist) ? body.whitelist : []).slice(0, 24)) {
            const addr = String(raw?.address ?? '').toLowerCase();
            if (!/^0x[0-9a-f]{40}$/.test(addr)) continue;
            if (whitelist.some((w) => w.address === addr)) continue;
            whitelist.push({ address: addr, handle: String(raw?.handle ?? '').slice(0, 80) || null });
          }
          if (!whitelist.some((w) => w.address === address)) {
            whitelist.unshift({ address, handle: null });
          }
        }

        const id = crypto.randomUUID().slice(0, 8);
        // Private tables never enter the lobby registry — join via link only.
        if (!isPrivate) {
          await env.DB.prepare(
            'INSERT INTO tables (id, name, small_blind, seats, status, created_at) VALUES (?, ?, ?, 0, ?, ?)',
          ).bind(id, name, smallBlind, 'waiting', Date.now()).run();
        }

        // Initialize the Durable Object with its config.
        const stub = env.TABLES.get(env.TABLES.idFromName(id));
        await stub.fetch('https://do/init', {
          method: 'POST',
          body: JSON.stringify({ id, name, smallBlind, isPrivate, maxPlayers, whitelist }),
        });
        return json({ id, name, smallBlind, isPrivate });
      }

      /* ---------------- Table (Durable Object) ---------------- */

      const tableMatch = path.match(/^\/table\/([a-zA-Z0-9-]+)\/(ws|state)$/);
      if (tableMatch) {
        const [, id, sub] = tableMatch;
        const stub = env.TABLES.get(env.TABLES.idFromName(id));
        if (id === PRACTICE_TABLE_ID) {
          await stub.fetch('https://do/ensure-practice', { method: 'POST' });
        }
        if (sub === 'state') return stub.fetch(request);

        // WebSocket upgrades ignore CORS, so a hostile page could otherwise
        // open a socket with a victim's credentials (cross-site WebSocket
        // hijacking). Browsers always send Origin; non-browser clients still
        // need a valid token.
        const origin = request.headers.get('Origin');
        if (origin && !isAllowedOrigin(env, origin)) return json({ error: 'origin not allowed' }, 403);
        if (!(await underLimit(env.SOCKET_LIMITER, `ws:${ip}`))) return json({ error: 'slow down' }, 429);

        // WebSockets can't send headers from the browser → auth via query.
        const address = await requireAuth(request, url, env);
        if (!address) return json({ error: 'unauthorized' }, 401);

        // The DO trusts `address`, so it is set HERE from the verified
        // credential — never passed through from the client — and the
        // credential itself is stripped.
        const forward = new URL(request.url);
        forward.searchParams.delete('token');
        forward.searchParams.delete('sig');
        forward.searchParams.set('address', address);
        return stub.fetch(new Request(forward, request));
      }

      /* ---------------- Leaderboard & profiles ---------------- */

      if (path === '/leaderboard' && request.method === 'GET') {
        const { results } = await env.DB.prepare(
          `SELECT address, handle, avatar, net_profit AS netProfit,
                  hands_played AS handsPlayed, hands_won AS handsWon, biggest_pot AS biggestPot
           FROM players WHERE hands_played > 0
           ORDER BY (net_profit * 1.0 / (hands_played + ?)) DESC LIMIT 100`,
        ).bind(RANK_PRIOR_HANDS).all();
        return json({ leaderboard: results });
      }

      const profileMatch = path.match(/^\/profile\/(0x[0-9a-fA-F]{40})$/);
      if (profileMatch && request.method === 'GET') {
        const row = await env.DB.prepare(
          `SELECT address, handle, avatar, bankroll, net_profit AS netProfit,
                  hands_played AS handsPlayed, hands_won AS handsWon,
                  biggest_pot AS biggestPot, last_claim AS lastClaim
           FROM players WHERE address = ?`,
        ).bind(profileMatch[1].toLowerCase()).first();
        return json({ profile: row ?? null });
      }

      /* ---------------- Daily chips ---------------- */

      if (path === '/claim' && request.method === 'POST') {
        const address = await requireAuth(request, url, env);
        if (!address) return json({ error: 'unauthorized' }, 401);

        await env.DB.prepare(
          `INSERT INTO players (address, created_at) VALUES (?, ?)
           ON CONFLICT(address) DO NOTHING`,
        ).bind(address, Date.now()).run();

        const now = Date.now();
        const res = await env.DB.prepare(
          `UPDATE players SET bankroll = bankroll + ?, last_claim = ?
           WHERE address = ? AND last_claim < ?`,
        ).bind(DAILY_CHIPS, now, address, now - 24 * 3600 * 1000).run();

        if (!res.meta.changes) return json({ error: 'already claimed in the last 24h' }, 429);
        return json({ claimed: DAILY_CHIPS });
      }

      return json({ error: 'not found' }, 404);
    } catch (err) {
      // Details go to the log (wrangler tail), never to the client.
      console.error('request failed', path, err);
      return json({ error: 'internal error' }, 500);
    }
  },
};
