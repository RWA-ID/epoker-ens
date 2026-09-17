# Hoodpoker ♠️

**Browser-based multiplayer Texas Hold'em on Robinhood Chain.** Your
`hoodfi.eth` name is your handle at the table, hands only start with **4+
players**, and the chips are free and stay free.

Built by [@ensgianteth](https://x.com/ensgianteth) · Live backend:
`https://epoker-worker.dmpay.workers.dev` · Frontend: IPFS → `epoker.eth`

> **Disclaimer** — Hoodpoker is an independent community project. It is **not
> affiliated with, endorsed by, or connected to Robinhood Markets, Robinhood
> Crypto, ENS or ENS Labs** in any way. "Robinhood Chain" is referenced solely
> to describe the network this app runs on.
>
> **Play chips only.** Chips are virtual, have **no cash value**, and cannot be
> purchased, sold, transferred, withdrawn or redeemed. There is no buy-in, no
> wagering of tokens and no payout of any kind. The only wallet interaction in
> the entire app is a **gas-free signature** proving you own your address — the
> game never sends a transaction.

---

## Features

- **Wallet & name identity** — connect with Reown AppKit on Robinhood Chain
  (chain `4663`). Your `hoodfi.eth` subname becomes your handle and its
  `avatar` record becomes your table picture; mainnet ENS names work too, so
  nobody has to mint anything to sit down.
- **Lobby & tables** — create/join tables (blinds 5/10 to 50/100, 100 BB
  starting stack), shareable invite links, max 9 seats, **hard 4-player
  minimum** to start a hand on public tables.
- **Private tables** — pick the table size (2–9 seats) and whitelist guests by
  name or address. Private tables never appear in the lobby (invite by link),
  only whitelisted wallets can sit, and hands start as soon as the (smaller)
  table fills — down to heads-up.
- **Full Texas Hold'em** — 4 betting rounds, side pots, min-raise rules
  (including short all-in no-reopen), CSPRNG shuffle, 30s action timers with
  auto-check/fold, in-table chat, synthesized sound effects (toggleable).
- **Open chat, plain text** — everyone connected to a table can chat, seated or
  spectating. Links are stripped server-side and messages render as text nodes,
  never HTML, so nothing embeds and nothing injects.
- **Server-authoritative** — every deal, bet and payout is computed inside a
  Cloudflare Durable Object; clients never see other players' hole cards
  before showdown.
- **Persistence** — D1 stores bankrolls (10,000 starting chips), the global
  leaderboard (net chips, hands won, biggest pot) and a daily +5,000 chip
  claim.

## Architecture

```
epoker-eth/
├── frontend/                  Next.js 15 App Router · static export · Tailwind + shadcn-style UI
│   ├── app/                   / (lobby) · /table/?id= · /leaderboard · /profile
│   ├── components/            felt, seats, cards, action bar, chat, avatars
│   ├── lib/                   Reown AppKit + wagmi/viem, identity, WS client, sounds, auth
│   └── pin.mjs                pins out/ to IPFS via Pinata
└── worker/                    Cloudflare Worker + Durable Objects + D1
    ├── src/index.ts           router: /tables /leaderboard /profile /claim + WS forwarding
    ├── src/table.ts           TableDO — ONE Durable Object per table, all game logic
    ├── src/session.ts         SIWE nonces + verification, HMAC session tokens
    ├── src/auth.ts            legacy static-signature check (OFF: ALLOW_LEGACY_SIG=0)
    ├── src/handle.ts          on-chain check that a claimed hoodfi name is really yours
    ├── src/chat.ts            chat sanitizer (links stripped; `.eth` names preserved)
    ├── src/poker/deck.ts      crypto.getRandomValues Fisher–Yates shuffle
    ├── src/poker/evaluator.ts 7-card hand evaluator (packed-score, fully commented)
    ├── src/poker/pots.ts      side-pot settlement from total commitments
    ├── schema.sql             D1 schema (players, tables)
    └── migrations/            one-shot D1 migrations — run before deploying
```

**Why Durable Objects?** One DO instance = one table = one WebSocket hub. DOs
are single-threaded, so a table's state is strongly consistent with zero
locking, and Cloudflare places each object near its players. Lobby reads hit
D1, not the DOs, so listing tables never wakes sleeping games.

**Trust model:** clients send *intents* ("raise to 400") over WebSocket and
receive per-player sanitized snapshots. Shuffling, dealing, bet validation,
side pots, hand evaluation and payouts all run server-side.

## How names work (and why it isn't a reverse lookup)

This is the part worth reading before changing anything.

A `hoodfi.eth` subname lives on Robinhood Chain and is reachable from mainnet
over CCIP — `getEnsAddress('gm.hoodfi.eth')` resolves fine from any viem
client. But that is **forward** resolution. The obvious way to label a player
is the **reverse** direction, `getEnsName(address)`, and that returns `null`
for every hoodfi holder: a mainnet primary name requires writing to the
mainnet `ReverseRegistrar`, which an L2 name cannot do without ENSIP-19 L2
reverse resolution.

So names are found by enumerating the registry instead:

1. `getLogs` for ERC721 `Transfer` where `to == player`, from block 0. `to` is
   indexed, so this is a cheap filtered query — **~125ms for the whole chain**
   on the public RPC, not a wide scan. (The registry is a plain ERC721, *not*
   Enumerable, and token ids are namehashes rather than a sequence, so
   `tokenOfOwnerByIndex` does not exist.)
2. Re-check `owner(node)` for each hit. A `Transfer` log proves the address
   received the name once, not that it still holds it — in the first real scan
   **6 of 25 names had already moved on**.
3. Read `names(node)` and the `avatar` text record in the same pass.

The worker independently re-verifies the claimed handle with a single
`eth_call` before anyone sits down under it (`src/handle.ts`), because the
sign-in signature proves the *wallet*, not the *name*.

### Avatars: do not use `getEnsAvatar`

Measured against real hoodfi names that have avatar records:

| call | result | time |
| --- | --- | --- |
| `getEnsText(name, 'avatar')` | `ipfs://Qm…` | 1.8–5.0s |
| `getEnsAvatar(name)` | **`null`** | **29.6s** |

`getEnsAvatar` resolves the `ipfs://` URI through a public gateway before
returning, and that gateway times out on pins it has no reason to hold — so
the names *with* avatars are exactly the ones that render blank, slowly. The
app reads the raw record and builds its own ordered gateway chain
(`lib/avatar.ts`): the dedicated gateway first, with resize parameters, then
`ipfs.io`, with the `<img>` `onError` advancing the index.

## Gameplay rules implemented

- Blinds posted automatically (short stacks post all-in for less).
- Pre-flop action starts UTG; post-flop left of the button.
- Fold / Check / Call / Bet / Raise-to / All-in with min-raise enforcement; a
  short all-in raise does **not** reopen betting (standard rule).
- Uncontested pots are awarded immediately (winner mucks).
- All-in run-outs reveal remaining streets with a pause between cards.
- Side pots are sliced from total per-player commitments at showdown; odd
  chips go to the earliest seat among tied winners.
- Busted or disconnected players are cashed out between hands; leaving
  mid-hand folds you first.

## Running locally

Prereqs: Node 20+, a Cloudflare account, `npx wrangler login`.

```bash
# backend
cd worker
npm install
npx wrangler d1 create epoker        # once — paste database_id into wrangler.toml
npm run db:local                     # schema for local dev
npm run dev                          # http://localhost:8787
npm test                             # chat sanitizer tests

# frontend (second terminal)
cd frontend
npm install
cp .env.example .env.local           # fill in the vars below
npm run dev                          # http://localhost:3000
```

| Env var | Purpose |
| --- | --- |
| `NEXT_PUBLIC_REOWN_PROJECT_ID` | Reown Cloud project ID (wallet modal) |
| `NEXT_PUBLIC_ALCHEMY_KEY` | Alchemy mainnet key — mainnet ENS name lookups |
| `NEXT_PUBLIC_ROBINHOOD_RPC` | Optional override for the chain-4663 RPC |
| `NEXT_PUBLIC_WORKER_URL` | Worker origin (`http://localhost:8787` in dev) |
| `PINATA_JWT` | Only for `node pin.mjs` (IPFS deploy) — never bundled |

To test multiplayer, open four browser profiles with four wallets and join the
same table — the hand starts automatically once four players are seated.

## Dependency pinning (read before `npm install`)

`@reown/appkit-adapter-wagmi` declares its wagmi peers as `>=` ranges, so a
plain `npm install` will happily pull a `@wagmi/core` major that the pinned
`wagmi` cannot use, producing duplicate-core type errors and missing modules.
The whole wallet stack is therefore pinned to **exact** versions in
`package.json` — `wagmi`, `@wagmi/core`, `@wagmi/connectors`, `viem`,
`@reown/appkit` and `@reown/appkit-adapter-wagmi`. Do not loosen them to
carets without re-verifying `npm ls @wagmi/core` reports a single deduped
version.

`next.config.mjs` also carries two related workarounds: `externals.push
('pino-pretty')` and `resolve.alias.accounts = false`.

## Deployment

**Order matters.** The worker reads `handle`/`avatar`, which the live D1
database does not have until migrated, and the frontend's protocol must not
run ahead of the worker.

```bash
# 1. migrate D1 (once)
cd worker
npx wrangler d1 execute epoker --command "PRAGMA table_info(players);" --remote   # check first
npx wrangler d1 execute epoker --file=migrations/001_handle_avatar.sql --remote

# 2. deploy the worker
npx wrangler deploy

# 3. build + pin the frontend
cd ../frontend
npm run build          # static export → out/
node pin.mjs           # pins out/ to Pinata, prints the CID
```

Alternatives to IPFS: `npx wrangler pages deploy out` (CF Pages) or import
`frontend/` into Vercel — the static export needs no server runtime.

### Pointing epoker.eth at the app

1. Pin `out/` to IPFS and copy the CID (`pin.mjs` prints it).
2. In the [ENS app](https://app.ens.domains), set the **Content Hash** record
   of `epoker.eth` to `ipfs://<CID>`.
3. Confirm the new pin is actually what's being served before you rely on it:

   ```bash
   curl -s https://epoker.eth.limo/ | grep -c "$(cat frontend/.next/BUILD_ID)"
   ```

   `1` means the contenthash propagated. A `200` alone proves nothing — a
   gateway will keep serving the previous pin for a while, so fetch the old
   CID's `index.html` as a control and check the two differ.
4. The site resolves at `https://epoker.eth.limo`. Repeat pin + contenthash
   update on each release.

A fresh pin often 504s on `_next/static/chunks/*.js` until the CID propagates,
which surfaces as a `ChunkLoadError` and a blank page. Warm the files, or wait,
before concluding the build is broken.

## Security notes

Game logic is fully server-authoritative: clients send intents, the Durable
Object shuffles, deals, validates every bet and pays out.

**Sign-in** is Sign-In with Ethereum (EIP-4361). The worker issues a one-time
nonce (D1 `auth_nonces`, 10 min TTL, deleted on use); the wallet signs a
message naming the site's domain, Robinhood Chain (4663) and an expiry; the
worker checks domain, origin, chain, expiry, signature and nonce, then returns
a 24h HMAC session token (`SESSION_SECRET`). API calls send it as
`Authorization: Bearer`, sockets as `?token=`. The router derives the player's
address from the token and passes only that to the table. Rotating
`SESSION_SECRET` signs everyone out.

SIWE is now the **only** way in: `ALLOW_LEGACY_SIG` is `"0"` and the old
replayable static signature is refused. The flag exists for the changeover —
a worker that issues nonces can be deployed while the pinned frontend is still
the pre-SIWE build, because `"1"` keeps accepting that build's signature. Set
it back to `"1"` only if you ever have to serve an old pin again, and turn it
off the moment the contenthash points at a SIWE build.

**Origins.** CORS, the SIWE domain check and WebSocket upgrades all use the
`ALLOWED_ORIGINS` allowlist (`wrangler.toml`). Upgrades from any other origin
are refused (cross-site WebSocket hijacking).

**Identity.** Handles are verified server-side — hoodfi.eth names against the
Robinhood Chain registry, mainnet names by forward resolution — and the
avatar is read from that verified name's record, never taken from the client.

**Abuse limits.**
- Cloudflare rate limiters: sign-in 20/min per IP, table creation 5/min per
  address, socket upgrades 40/min per IP.
- Per socket: frames over 1 KB refused; chat 5 lines / 10 s; more than 40
  messages / 5 s closes the socket. 150 sockets per table.
- Chat is plain text with links stripped server-side.
- Errors return a generic message; details go to `wrangler tail`.

`NEXT_PUBLIC_*` values (Alchemy key, Reown ID, Privy app ID) are public by
design — scope them to the frontend domains in their dashboards.

### Deploying the hardening (done — kept for a fork or a fresh D1)

The order matters, and it is the reverse of what feels natural: **the worker
goes first.** A SIWE frontend calls `/auth/nonce`, so pinning it before the
worker exists means nobody can sign in. The worker, meanwhile, is safe to
deploy early precisely because `ALLOW_LEGACY_SIG="1"` still honours the old
pin's signature.

```bash
cd worker
npx wrangler d1 execute epoker --file=migrations/002_auth_nonces.sql --remote
openssl rand -base64 48 | npx wrangler secret put SESSION_SECRET   # never echo it
npx wrangler deploy          # legacy signatures still accepted

cd ../frontend && npm run build && node pin.mjs                    # → CID
# set the epoker.eth contenthash to that CID, then CONFIRM it is live:
#   curl -s https://epoker.eth.limo/ | grep -c "$(cat .next/BUILD_ID)"
# a 200 alone proves nothing — gateways happily serve the previous pin.

# only once that greps 1:
# set ALLOW_LEGACY_SIG = "0" in wrangler.toml, then:
cd ../worker && npx wrangler deploy
```

Flipping the flag before the new pin is really being served locks out every
browser still on the old one. Tokens already issued are unaffected either way —
they are HMAC-verified and never touch the legacy path — so only new sign-ins
are at risk during the window.

## Known limitations

- No tournaments, no mid-session rebuy UI (leave and re-sit), no stored hand
  history — the in-table hand log is memory only.
- A dropped player keeps their seat for 60 s; after that they are cashed out
  between hands.
- DO state is in-memory with non-hibernating WebSockets. The WebSocket
  Hibernation API + DO storage would cut idle-table cost and survive
  evictions, but means persisting the whole hand state machine.
- Session tokens are stateless: one can't be revoked individually before its
  24h expiry (rotate `SESSION_SECRET` to revoke all).
- The handle picker's choice is stored per-browser (`localStorage`), so playing
  from a second device defaults back to your shortest name.

## Credits

Built by [@ensgianteth](https://x.com/ensgianteth) ·
[github.com/RWA-ID/epoker-ens](https://github.com/RWA-ID/epoker-ens)

Not affiliated with Robinhood Markets, Robinhood Crypto, ENS or ENS Labs.
