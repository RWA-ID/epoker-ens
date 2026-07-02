-- ENS Hold'em D1 schema.
-- Apply with: npx wrangler d1 execute epoker --file=schema.sql --remote

-- One row per wallet. `bankroll` is the persistent virtual-chip balance;
-- buy-ins move chips bankroll -> table stack and back on leave.
CREATE TABLE IF NOT EXISTS players (
  address       TEXT PRIMARY KEY,             -- lowercase 0x address
  ens_name      TEXT,                          -- last seen primary ENS name
  bankroll      INTEGER NOT NULL DEFAULT 10000,-- starting virtual chips
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
