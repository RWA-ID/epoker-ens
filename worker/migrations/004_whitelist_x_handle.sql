-- Whitelist v2: sign up with an X handle + wallet, no wallet connection.
--
-- Run ONCE against the live database, BEFORE deploying the worker that sends
-- x_handle:
--   npx wrangler d1 execute epoker --file=migrations/004_whitelist_x_handle.sql --remote
--
-- NOT safe to re-run: the ALTER fails the second time. Check first with
--   PRAGMA table_info(whitelist);
--
-- Why: on 2026-10-04 a script signed up 1,999 fresh wallets in 12 minutes
-- (SIWE proves a wallet, and wallets are free). The handle is now the scarce
-- thing — one per handle — and the snapshot keeps only handles that reposted
-- the pinned post. Rows from before this have no handle (NULL); SQLite lets a
-- UNIQUE index hold any number of NULLs, so they keep their places.

ALTER TABLE whitelist ADD COLUMN x_handle TEXT;  -- lowercase, no @
CREATE UNIQUE INDEX IF NOT EXISTS whitelist_x_handle ON whitelist (x_handle);

-- The count, kept in one row. COUNT(*) reads every row, and the sign-up box
-- re-reads the count every 15s from every open tab — that, plus the burst,
-- is what ran the free plan's 5M daily reads out. Triggers keep it exact
-- across inserts and deletes, so it can't drift from the table.
CREATE TABLE IF NOT EXISTS whitelist_meta (
  k TEXT PRIMARY KEY,
  v INTEGER NOT NULL
);
INSERT OR REPLACE INTO whitelist_meta (k, v) VALUES ('count', (SELECT COUNT(*) FROM whitelist));

CREATE TRIGGER IF NOT EXISTS whitelist_count_ins AFTER INSERT ON whitelist
BEGIN
  UPDATE whitelist_meta SET v = v + 1 WHERE k = 'count';
END;

CREATE TRIGGER IF NOT EXISTS whitelist_count_del AFTER DELETE ON whitelist
BEGIN
  UPDATE whitelist_meta SET v = v - 1 WHERE k = 'count';
END;
