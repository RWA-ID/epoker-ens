-- One-off: move the 2026-10-04 bot burst out of the whitelist, into a backup.
--
--   npx wrangler d1 execute epoker --file=scripts/move-burst-2026-10-04.sql --remote
--
-- 1,999 sign-ups landed 15:38–15:56 UTC at a flat ~155/min, none ever opened
-- the game and none held CCFF00 in a sample, against 28 organic sign-ups over
-- the two days before. Moved, not deleted: whitelist_burst_20261004 keeps every
-- row, and an INSERT ... SELECT back puts any of them back in place with the
-- same created_at (so the same queue position).
--
-- Window = [15:38:00, 15:57:00) UTC in unix ms. Order-independent with
-- migration 004: its delete trigger keeps whitelist_meta's count exact.

CREATE TABLE IF NOT EXISTS whitelist_burst_20261004 AS
  SELECT address, created_at FROM whitelist
  WHERE created_at >= 1791128280000 AND created_at < 1791129420000;

DELETE FROM whitelist
  WHERE created_at >= 1791128280000 AND created_at < 1791129420000
    AND address IN (SELECT address FROM whitelist_burst_20261004);
