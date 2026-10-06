/** Cloudflare's Rate Limiting binding (wrangler.toml `[[ratelimits]]`). */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** Worker bindings — see wrangler.toml. */
export interface Env {
  /** Durable Object namespace: one instance per poker table. */
  TABLES: DurableObjectNamespace;
  /** D1 database: bankrolls, leaderboard stats, table registry, sign-in nonces. */
  DB: D1Database;
  /** HMAC key for session tokens — `wrangler secret put SESSION_SECRET`. */
  SESSION_SECRET?: string;
  /** Comma-separated frontend origins allowed by CORS, SIWE and socket upgrades. */
  ALLOWED_ORIGINS?: string;
  /**
   * "1" = still accept the old static sign-in signature. Transitional only:
   * the frontend pinned before SIWE sends it. Remove once the contenthash
   * points at a SIWE build.
   */
  ALLOW_LEGACY_SIG?: string;
  /** "1" = whitelist sign-ups accepted. Anything else closes them (the count stays readable). */
  WHITELIST_OPEN?: string;
  /** Turnstile secret for whitelist sign-ups — `wrangler secret put TURNSTILE_SECRET`. Unset = refuse all. */
  TURNSTILE_SECRET?: string;
  /** Cloudflare Realtime SFU app for Spaces (voice). Both unset = Spaces can't start. */
  SFU_APP_ID?: string;
  /** `wrangler secret put SFU_APP_SECRET` — never shipped to a browser. */
  SFU_APP_SECRET?: string;
  /** Mainnet RPC for verifying ENS handles and avatars. */
  MAINNET_RPC?: string;
  /** Optional rate limiters — absent in tests and `wrangler dev` is fine. */
  AUTH_LIMITER?: RateLimiter;
  CREATE_LIMITER?: RateLimiter;
  SOCKET_LIMITER?: RateLimiter;
}
