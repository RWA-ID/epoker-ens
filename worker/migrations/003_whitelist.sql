-- House Pass whitelist sign-ups (see src/whitelist.ts).
--
-- Run ONCE against the live database, BEFORE deploying the worker that serves
-- /whitelist:
--   npx wrangler d1 execute epoker --file=migrations/003_whitelist.sql --remote
--
-- Safe to re-run: IF NOT EXISTS. The primary key is what makes it one per wallet.

CREATE TABLE IF NOT EXISTS whitelist (
  address     TEXT PRIMARY KEY,   -- lowercase 0x address, from the session token
  created_at  INTEGER NOT NULL    -- unix ms
);
