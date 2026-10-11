-- HoodFi bonuses: 50,000 chips every Friday for a hoodfi.eth name owner, and a
-- one-time 100,000 for registering a name through the HoodPoker widget.
--
-- Run ONCE against the live database, BEFORE deploying the worker that writes it:
--   npx wrangler d1 execute epoker --file=migrations/006_bonus_claims.sql --remote
-- Safe to re-run (IF NOT EXISTS only).
--
-- One row per paid claim. kind = 'hoodfi-weekly' | 'widget'; period = the
-- Friday (AST) a weekly claim belongs to, or 'once'. A weekly claim also
-- records the name it was paid against, and that name can't pay a second
-- wallet in the same week — passing one name around can't farm it.

CREATE TABLE IF NOT EXISTS bonus_claims (
  kind       TEXT    NOT NULL,
  period     TEXT    NOT NULL,
  address    TEXT    NOT NULL,  -- lowercase 0x…
  name       TEXT,              -- the hoodfi name a weekly claim was paid against
  amount     INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (kind, period, address)
);
CREATE UNIQUE INDEX IF NOT EXISTS bonus_claims_name ON bonus_claims (kind, period, name) WHERE name IS NOT NULL;
