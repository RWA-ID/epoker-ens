-- Private-table invites, so a guest sees "You're invited" in the lobby instead
-- of needing the link.
--
-- Run ONCE against the live database, BEFORE deploying the worker that writes it:
--   npx wrangler d1 execute epoker --file=migrations/005_table_invites.sql --remote
-- NOT safe to re-run as a whole: the ALTER at the bottom fails the second
-- time. Check first with  PRAGMA table_info(players);  (look for handle_pick).
--
-- One row per (guest, table), the host included. Private table ids are the
-- secret part of an invite link, so these rows are only ever read back by the
-- signed-in guest themselves (GET /invites). Rows go when the table closes, and
-- reads ignore anything older than a day (a table nobody ever sat at has no
-- close to clean up after it).

CREATE TABLE IF NOT EXISTS table_invites (
  address     TEXT    NOT NULL,  -- lowercase 0x…
  table_id    TEXT    NOT NULL,
  name        TEXT    NOT NULL,
  host        TEXT    NOT NULL,  -- lowercase 0x…
  small_blind INTEGER NOT NULL,
  space       INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (address, table_id)
);
CREATE INDEX IF NOT EXISTS table_invites_table ON table_invites (table_id);

-- The name a player CHOSE to play under (POST /handle), as opposed to
-- players.handle, which is whatever name they last sat under. Only a choice
-- follows them to a new device.
ALTER TABLE players ADD COLUMN handle_pick TEXT;
