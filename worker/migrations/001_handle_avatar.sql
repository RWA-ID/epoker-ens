-- Rename ens_name -> handle and add the avatar record column.
--
-- Run ONCE against the live database, BEFORE deploying the worker that reads
-- `handle`:
--   npx wrangler d1 execute epoker --file=migrations/001_handle_avatar.sql --remote
--
-- Deploy order matters. The worker selects `handle`/`avatar`, so running it
-- against the old schema returns an error on every leaderboard and profile
-- request. Migrate first, deploy second, pin the frontend third.
--
-- SQLite ignores an ALTER that would duplicate a column, so re-running this is
-- not safe — check first with:
--   npx wrangler d1 execute epoker --command "PRAGMA table_info(players);" --remote

ALTER TABLE players RENAME COLUMN ens_name TO handle;
ALTER TABLE players ADD COLUMN avatar TEXT;
ALTER TABLE players ADD COLUMN handle_checked INTEGER NOT NULL DEFAULT 0;
