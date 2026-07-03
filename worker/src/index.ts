/**
 * ENS Hold'em — Cloudflare Worker entry point.
 *
 * Routes:
 *   GET  /tables                 list open tables (lobby)
 *   POST /tables                 create a table (auth) { name, smallBlind }
 *   GET  /table/:id/state        read-only snapshot
 *   GET  /table/:id/ws           WebSocket upgrade (auth via query params)
 *   GET  /leaderboard            top players by net profit
 *   GET  /profile/:address       one player's stats + bankroll
 *   POST /claim                  daily free chips (auth)
 *
 * Auth = wallet signature over a static message (see src/auth.ts).
 * Each table is a Durable Object (src/table.ts) that owns all game state.
 */
import type { Env } from './env';
import { verifyAuth } from './auth';

export { TableDO } from './table';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-Address,X-Signature',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

/** Verify the wallet signature carried in headers (or query for WS). */
async function requireAuth(request: Request, url: URL): Promise<string | null> {
  const address = (request.headers.get('X-Address') ?? url.searchParams.get('address') ?? '').toLowerCase();
  const signature = request.headers.get('X-Signature') ?? url.searchParams.get('sig') ?? '';
  if (!/^0x[0-9a-f]{40}$/.test(address) || !signature) return null;
  return (await verifyAuth(address, signature)) ? address : null;
}

/** Daily chip claim amount. */
const DAILY_CHIPS = 5000;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    try {
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
        ).all();
        return json({ tables: results });
      }

      if (path === '/tables' && request.method === 'POST') {
        const address = await requireAuth(request, url);
        if (!address) return json({ error: 'unauthorized' }, 401);

        const body = (await request.json().catch(() => ({}))) as { name?: string; smallBlind?: number };
        const name = String(body.name ?? '').slice(0, 40).trim() || 'ENS Hold’em Table';
        const smallBlind = [5, 10, 25, 50].includes(Number(body.smallBlind)) ? Number(body.smallBlind) : 10;

        const id = crypto.randomUUID().slice(0, 8);
        await env.DB.prepare(
          'INSERT INTO tables (id, name, small_blind, seats, status, created_at) VALUES (?, ?, ?, 0, ?, ?)',
        ).bind(id, name, smallBlind, 'waiting', Date.now()).run();

        // Initialize the Durable Object with its config.
        const stub = env.TABLES.get(env.TABLES.idFromName(id));
        await stub.fetch('https://do/init', {
          method: 'POST',
          body: JSON.stringify({ id, name, smallBlind }),
        });
        return json({ id, name, smallBlind });
      }

      /* ---------------- Table (Durable Object) ---------------- */

      const tableMatch = path.match(/^\/table\/([a-zA-Z0-9-]+)\/(ws|state)$/);
      if (tableMatch) {
        const [, id, sub] = tableMatch;
        if (sub === 'ws') {
          // WebSockets can't send headers from the browser → auth via query.
          const address = await requireAuth(request, url);
          if (!address) return json({ error: 'unauthorized' }, 401);
        }
        const stub = env.TABLES.get(env.TABLES.idFromName(id));
        return stub.fetch(request);
      }

      /* ---------------- Leaderboard & profiles ---------------- */

      if (path === '/leaderboard' && request.method === 'GET') {
        const { results } = await env.DB.prepare(
          `SELECT address, ens_name AS ensName, net_profit AS netProfit,
                  hands_played AS handsPlayed, hands_won AS handsWon, biggest_pot AS biggestPot
           FROM players WHERE hands_played > 0
           ORDER BY net_profit DESC LIMIT 100`,
        ).all();
        return json({ leaderboard: results });
      }

      const profileMatch = path.match(/^\/profile\/(0x[0-9a-fA-F]{40})$/);
      if (profileMatch && request.method === 'GET') {
        const row = await env.DB.prepare(
          `SELECT address, ens_name AS ensName, bankroll, net_profit AS netProfit,
                  hands_played AS handsPlayed, hands_won AS handsWon,
                  biggest_pot AS biggestPot, last_claim AS lastClaim
           FROM players WHERE address = ?`,
        ).bind(profileMatch[1].toLowerCase()).first();
        return json({ profile: row ?? null });
      }

      /* ---------------- Daily chips ---------------- */

      if (path === '/claim' && request.method === 'POST') {
        const address = await requireAuth(request, url);
        if (!address) return json({ error: 'unauthorized' }, 401);

        await env.DB.prepare(
          `INSERT INTO players (address, created_at) VALUES (?, ?)
           ON CONFLICT(address) DO NOTHING`,
        ).bind(address, Date.now()).run();

        // ---------------------------------------------------------------
        // FUTURE ENS INTEGRATION POINT ------------------------------------
        // When the official ENS token distribution/reward contract ships,
        // this is where holding verification plugs in:
        //   1. Read the caller's $ENS balance + delegation on-chain
        //      (viem createPublicClient + Alchemy RPC, or a signed proof).
        //   2. Scale DAILY_CHIPS by holding tier (e.g. +25% for delegated
        //      holders), and/or mint claimable reward points that the
        //      distribution contract later converts to real rewards.
        //   3. Zero-balance wallets receive the reduced base amount —
        //      mirroring the client-side "sold all ENS" penalty.
        // ---------------------------------------------------------------
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
      return json({ error: `internal error: ${String(err)}` }, 500);
    }
  },
};
