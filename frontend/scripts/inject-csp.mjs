#!/usr/bin/env node
/**
 * Stamps a Content-Security-Policy into every built page in out/.
 *
 * Why a <meta> tag and not a header: the site is a static export pinned to
 * IPFS and served by eth.limo, so we never serve the response ourselves.
 * eth.limo already sends `frame-ancestors 'self'`, X-Frame-Options: SAMEORIGIN,
 * HSTS, nosniff and Referrer-Policy — which is what Privy's clickjacking
 * guidance asks for. The one thing no gateway can know is which origins this
 * app may load code from and talk to; that has to travel inside the document.
 *
 * Why a build step and not a <meta> in app/layout.tsx: a meta CSP only governs
 * what the parser sees *after* it, and React decides where in <head> a hoisted
 * tag lands — in practice after the stylesheet and the /_next script tags.
 * Injecting straight after <head> covers the document from the first byte.
 *
 * CSP violations do NOT show up in console-reading tools. Verify with a
 * `securitypolicyviolation` listener while exercising the flows, plus a control
 * request the policy forbids — re-run that after any AppKit or Privy upgrade.
 *
 * Usage: node scripts/inject-csp.mjs   (wired into `npm run build`)
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'out');
try {
  process.loadEnvFile(join(ROOT, '.env.local'));
} catch {
  /* no .env.local — fall back to the defaults below, same as lib/config.ts */
}

/** Origin of a URL, or exit loudly — a silently dropped origin is a dead feature. */
const originOf = (raw) => {
  try {
    return new URL(raw).origin;
  } catch {
    console.error(`  ✗ not a URL: ${raw}`);
    process.exit(1);
  }
};

// Same env vars and fallbacks as lib/config.ts, so the policy can't drift from
// the URLs the app actually builds.
const WORKER = originOf(process.env.NEXT_PUBLIC_WORKER_URL ?? 'http://localhost:8787');
const WORKER_WS = WORKER.replace(/^http/, 'ws');
const MAINNET_RPC = process.env.NEXT_PUBLIC_ALCHEMY_KEY
  ? 'https://eth-mainnet.g.alchemy.com'
  : 'https://ethereum-rpc.publicnode.com';
const ROBINHOOD_RPC = originOf(
  process.env.NEXT_PUBLIC_ROBINHOOD_RPC ?? 'https://rpc.mainnet.chain.robinhood.com',
);

/**
 * hoodfi.eth's CCIP-Read gateway. Resolving a `name.hoodfi.eth` guest on
 * mainnet follows the resolver's OffchainLookup here. Mainnet names served by
 * some *other* offchain gateway won't resolve in the guest-list box — the price
 * of not opening connect-src to every https origin.
 */
const HOODFI_GATEWAY = 'https://hoodfi-gateway.dmpay.workers.dev';

/**
 * Reown AppKit spreads over several hosts and moves between walletconnect.com,
 * walletconnect.org and web3modal.org across releases (wallet list + icons,
 * telemetry, the relay websocket, the Verify iframe). Wildcarding the three
 * registrable domains is deliberate: a pinned subdomain list turns a routine
 * AppKit upgrade into a dead connect button.
 */
const WALLETCONNECT = ['https://*.walletconnect.com', 'https://*.walletconnect.org', 'https://*.web3modal.org'];
const WALLETCONNECT_WS = ['wss://*.walletconnect.com', 'wss://*.walletconnect.org'];

/** Coinbase Wallet connector: keys.* popup/iframe, cca-lite.* metrics. */
const COINBASE = ['https://*.coinbase.com'];

/**
 * Privy — passkey sign-in and the embedded wallet only. Straight from
 * docs.privy.io/security/implementation-guide/content-security-policy:
 * auth.privy.io is the API and the wallet iframe, *.rpc.privy.systems its RPC,
 * challenges.cloudflare.com the Turnstile CAPTCHA if it's on in the dashboard.
 */
const PRIVY = ['https://auth.privy.io'];
const PRIVY_RPC = 'https://*.rpc.privy.systems';
const TURNSTILE = 'https://challenges.cloudflare.com';

const POLICY = [
  ['default-src', "'self'"],
  ['base-uri', "'self'"],
  ['object-src', "'none'"],
  ['form-action', "'self'"],

  // 'unsafe-inline' is unavoidable: Next inlines its bootstrap and RSC payload,
  // and a static export has no server to mint a per-response nonce. What this
  // still buys is the origin restriction — an injected <script src=…> from
  // anywhere else is blocked.
  ['script-src', `'self' 'unsafe-inline' 'wasm-unsafe-eval' ${TURNSTILE}`],

  // AppKit and Privy both inject styles at runtime.
  ['style-src', "'self' 'unsafe-inline'"],
  // next/font self-hosts Archivo + Plex Mono; fonts.reown.com is AppKit's modal
  // typeface — blocking it doesn't break connecting, the modal just silently
  // falls back to a serif, which is how it would ship broken.
  ['font-src', "'self' data: https://fonts.reown.com"],

  // `https:` because a player's avatar record can be any https URL (lib/avatar.ts).
  ['img-src', "'self' data: blob: https:"],

  ['connect-src', [
    "'self'", WORKER, WORKER_WS, MAINNET_RPC, ROBINHOOD_RPC, HOODFI_GATEWAY,
    ...WALLETCONNECT, ...WALLETCONNECT_WS, ...COINBASE,
    ...PRIVY, PRIVY_RPC,
  ].join(' ')],

  ['frame-src', ["'self'", ...WALLETCONNECT, 'https://keys.coinbase.com', ...PRIVY, TURNSTILE].join(' ')],
  ['child-src', ["'self'", ...WALLETCONNECT, ...PRIVY].join(' ')],
  ['worker-src', "'self' blob:"],
  ['manifest-src', "'self'"],
].map(([k, v]) => `${k} ${v}`).join('; ');

// frame-ancestors is deliberately absent: it is ignored in a meta CSP, and
// eth.limo already sends it as a real header. Same for report-uri.

const TAG = `<meta http-equiv="Content-Security-Policy" content="${POLICY}">`;
const EXISTING = /<meta http-equiv="Content-Security-Policy"[^>]*>/gi;

if (!existsSync(OUT)) {
  console.error('out/ not found — run `next build` first');
  process.exit(1);
}

const htmlFiles = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? htmlFiles(full) : entry.endsWith('.html') ? [full] : [];
  });

let stamped = 0;
for (const file of htmlFiles(OUT)) {
  // Re-running must not stack tags, so strip any previous one first.
  const html = readFileSync(file, 'utf8').replace(EXISTING, '');
  if (!html.includes('<head>')) {
    console.error(`  ✗ ${file}: no <head> to inject into`);
    process.exit(1);
  }
  writeFileSync(file, html.replace('<head>', `<head>${TAG}`));
  stamped++;
}

console.log(`CSP stamped into ${stamped} page${stamped === 1 ? '' : 's'} (worker ${WORKER}).`);
