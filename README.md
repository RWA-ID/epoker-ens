# ENS Hold'em — epoker.eth ♠️

![ENS High Roller Table](frontend/public/hero-table.png)

**Browser-based multiplayer Texas Hold'em for the ENS community.** Your primary
ENS name is your handle at the table, hands only start with **4+ players**
(bring your frENS), and the game actively encourages holding **$ENS** and
participating in DAO governance.

Built by [@ensgianteth](https://x.com/ensgianteth) · Live backend:
`https://epoker-worker.dmpay.workers.dev` · Frontend: IPFS → `epoker.eth`

> **Disclaimer** — ENS Hold'em is an independent community project. It is **not
> affiliated with, endorsed by, or connected to ENS, ENS DAO, or ENS Labs** in
> any way. "ENS" is referenced solely to describe compatibility with the
> Ethereum Name Service protocol. The game uses **virtual chips only — there is
> no real-money gambling, no wagering of tokens, and chips have no monetary
> value.**

---

## Features

- **Wallet & ENS identity** — connect with Reown AppKit; your primary ENS name
  and avatar become your player identity. $ENS holders get an "ENS Verified"
  badge.
- **Lobby & tables** — create/join tables (blinds 5/10 to 50/100, buy-in 100
  BB), shareable invite links, max 9 seats, **hard 4-player minimum** to start
  a hand.
- **Full Texas Hold'em** — 4 betting rounds, side pots, min-raise rules
  (including short all-in no-reopen), CSPRNG shuffle, 30s action timers with
  auto-check/fold, in-table chat, synthesized sound effects (toggleable).
- **Server-authoritative** — every deal, bet and payout is computed inside a
  Cloudflare Durable Object; clients never see other players' hole cards
  before showdown.
- **Persistence** — D1 stores bankrolls (10,000 starting chips), the global
  leaderboard (net profit, hands won, biggest pot) and a daily +5,000 chip
  claim.
- **ENS & DAO mechanics** — the app reads your live $ENS balance and
  delegation status, tracks your peak holdings, tells you how much you can
  *safely* sell, warns when benefits are at risk, and applies a stated penalty
  when a wallet dumps everything. Post-hand nudges point to
  [agora.ensdao.org](https://agora.ensdao.org).

## Architecture

```
epoker-eth/
├── frontend/                  Next.js 15 App Router · static export · Tailwind + shadcn-style UI
│   ├── app/                   / (lobby) · /table/?id= · /leaderboard · /profile · /dao
│   ├── components/            felt, seats, cards, action bar, chat, ENS badges & banners
│   ├── lib/                   Reown AppKit + wagmi/viem, ENS hooks, WS client, sounds, auth
│   └── pin.mjs                pins out/ to IPFS via Pinata
└── worker/                    Cloudflare Worker + Durable Objects + D1
    ├── src/index.ts           router: /tables /leaderboard /profile /claim + WS forwarding
    ├── src/table.ts           TableDO — ONE Durable Object per table, all game logic
    ├── src/auth.ts            wallet-signature verification (viem verifyMessage)
    ├── src/poker/deck.ts      crypto.getRandomValues Fisher–Yates shuffle
    ├── src/poker/evaluator.ts 7-card hand evaluator (packed-score, fully commented)
    ├── src/poker/pots.ts      side-pot settlement from total commitments
    └── schema.sql             D1 schema (players, tables)
```

**Why Durable Objects?** One DO instance = one table = one WebSocket hub. DOs
are single-threaded, so a table's state is strongly consistent with zero
locking, and Cloudflare places each object near its players. A thousand
concurrent tables are just a thousand isolated micro-servers — no shared
state, no cross-table contention. Lobby reads hit D1, not the DOs, so listing
tables never wakes sleeping games.

**Trust model:** clients send *intents* ("raise to 400") over WebSocket and
receive per-player sanitized snapshots. Shuffling, dealing, bet validation,
side pots, hand evaluation and payouts all run server-side.

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

# frontend (second terminal)
cd frontend
npm install
cp .env.example .env.local           # fill in the vars below
npm run dev                          # http://localhost:3000
```

| Env var | Purpose |
| --- | --- |
| `NEXT_PUBLIC_REOWN_PROJECT_ID` | Reown Cloud project ID (wallet modal) |
| `NEXT_PUBLIC_ALCHEMY_KEY` | Alchemy mainnet key — ENS names/avatars + $ENS reads |
| `NEXT_PUBLIC_ETHERSCAN_KEY` | Optional, reserved for tx-link lookups |
| `NEXT_PUBLIC_WORKER_URL` | Worker origin (`http://localhost:8787` in dev) |
| `PINATA_JWT` | Only for `node pin.mjs` (IPFS deploy) — never bundled |

To test multiplayer, open four browser profiles with four wallets and join the
same table — the hand starts automatically once four players are seated.

## Deployment

### Backend → Cloudflare Workers

```bash
cd worker
npm run db:remote      # apply schema.sql to production D1
npx wrangler deploy    # → https://epoker-worker.<account>.workers.dev
```

### Frontend → IPFS (canonical), or Vercel / Cloudflare Pages

```bash
cd frontend
npm run build          # static export → out/
node pin.mjs           # pins out/ to Pinata, prints the CID
```

Alternatives: `npx wrangler pages deploy out` (CF Pages) or import
`frontend/` into Vercel — the static export needs no server runtime.

### Pointing epoker.eth at the app

1. Pin `out/` to IPFS and copy the CID (`pin.mjs` prints it).
2. In the [ENS app](https://app.ens.domains), set the **Content Hash** record
   of `epoker.eth` to `ipfs://<CID>`.
3. The site resolves at `https://epoker.eth.limo` (and natively in ENS-aware
   browsers). Repeat pin + contenthash update on each release.

## ENS holding mechanics (how the numbers work)

- $ENS token: `0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72` (mainnet), read via
  viem + Alchemy every 60s; delegation via `delegates(address)`.
- The app records each wallet's **peak** balance. Keeping **≥ 50% of peak** =
  full benefits, and the UI shows exactly how much is safe to sell. Dropping
  below 50% triggers a warning; selling to zero suspends holder benefits
  (base-rate daily chips, badge removed) until re-acquired.
- Nothing is ever taken from the wallet — the system only *reads* balances.

### Future official ENS distribution contract — integration points

Marked with `FUTURE ENS INTEGRATION POINT` comments in code:

1. **`worker/src/index.ts` → `/claim`** — flat daily chips become tiered
   claims verified against on-chain holdings/delegation.
2. **`frontend/lib/ens.ts`** — the holdings state machine becomes the reward
   eligibility oracle.
3. **Leaderboard seasons** — top players claim allocations from the
   distribution contract, weighted by holding duration, not just winnings.

## Security notes (MVP trade-offs)

Game logic is already fully server-authoritative. Remaining hardening for
production:

- Sign-in is a static message signature (replayable) → upgrade to SIWE with
  Worker-issued nonce + expiry.
- ENS name/avatar are client-supplied for display → resolve reverse records in
  the Worker and ignore client claims.
- `Access-Control-Allow-Origin: *` → pin to the deployed frontend origins.
- `NEXT_PUBLIC_*` values (Alchemy key, Reown ID) are public by design — scope
  them in their dashboards.

## Known MVP limitations

- No tournaments, no mid-session rebuy UI (leave and re-sit), no per-hand
  history (aggregate stats only).
- Disconnected players are auto-folded by the 30s timer and cashed out between
  hands.
- DO state is in-memory with non-hibernating WebSockets — simplest correct
  MVP; migrate to the WebSocket Hibernation API + DO storage for idle-table
  cost optimization at scale.

## Credits

Built by [@ensgianteth](https://x.com/ensgianteth) ·
[github.com/RWA-ID/epoker-ens](https://github.com/RWA-ID/epoker-ens)

Not affiliated with ENS, ENS DAO, or ENS Labs.
