-- One-time sign-in nonces for SIWE (see src/session.ts).
--
-- Run ONCE against the live database, BEFORE deploying the worker that issues
-- nonces:
--   npx wrangler d1 execute epoker --file=migrations/002_auth_nonces.sql --remote
--
-- Safe to re-run: both statements are IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS auth_nonces (
  nonce       TEXT PRIMARY KEY,
  expires_at  INTEGER NOT NULL   -- unix ms; rows are swept on the next issue
);

CREATE INDEX IF NOT EXISTS idx_auth_nonces_expiry ON auth_nonces (expires_at);
