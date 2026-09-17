-- Hoodpoker D1 schema.
-- Apply with: npx wrangler d1 execute epoker --file=schema.sql --remote
--
-- NOTE for the existing live database: this file creates tables only if they
-- are absent, so it will NOT rename the old `ens_name` column. Run
-- migrations/001_handle_avatar.sql once against the live DB before deploying
-- the worker that expects `handle`/`avatar`.

-- One row per wallet. `bankroll` is the persistent play-chip balance; sitting
-- down moves chips bankroll -> table stack and back on leave. Chips are not
-- purchasable, not redeemable and carry no cash value.
CREATE TABLE IF NOT EXISTS players (
  address       TEXT PRIMARY KEY,             -- lowercase 0x address
  handle        TEXT,                          -- hoodfi.eth subname or mainnet ENS name
  avatar        TEXT,                          -- raw `avatar` text record, NOT a resolved URL
  handle_checked INTEGER NOT NULL DEFAULT 0,    -- unix ms the handle was last verified on-chain
  bankroll      INTEGER NOT NULL DEFAULT 10000,-- starting play chips
  net_profit    INTEGER NOT NULL DEFAULT 0,    -- lifetime chips won - lost
  hands_played  INTEGER NOT NULL DEFAULT 0,
  hands_won     INTEGER NOT NULL DEFAULT 0,
  biggest_pot   INTEGER NOT NULL DEFAULT 0,
  last_claim    INTEGER NOT NULL DEFAULT 0,    -- unix ms of last daily claim
  created_at    INTEGER NOT NULL
);

-- Lobby registry. Seat counts are pushed by each table's Durable Object.
CREATE TABLE IF NOT EXISTS tables (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  small_blind  INTEGER NOT NULL,
  seats        INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'waiting', -- waiting | playing
  created_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_players_profit ON players (net_profit DESC);

-- One-time SIWE sign-in nonces (src/session.ts). Live DB: migrations/002.
CREATE TABLE IF NOT EXISTS auth_nonces (
  nonce       TEXT PRIMARY KEY,
  expires_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_nonces_expiry ON auth_nonces (expires_at);
