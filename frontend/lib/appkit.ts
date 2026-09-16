'use client';
/**
 * Reown AppKit + wagmi configuration.
 *
 * Robinhood Chain is the network players connect on. Mainnet is kept in the
 * list purely as a read source for ENS primary names — the game never sends a
 * transaction on either chain; the only wallet interaction is a gas-free
 * sign-in signature.
 */
import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { mainnet, type AppKitNetwork } from '@reown/appkit/networks';
import { http } from 'viem';
import { REOWN_PROJECT_ID, RPC_URL, ROBINHOOD_RPC_URL } from './config';

/** Robinhood Chain in AppKit's network shape (mirrors lib/chains.ts). */
const robinhoodNetwork: AppKitNetwork = {
  id: 4663,
  caipNetworkId: 'eip155:4663',
  chainNamespace: 'eip155',
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [ROBINHOOD_RPC_URL] } },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://robinhoodchain.blockscout.com' },
  },
};

const networks: [AppKitNetwork, ...AppKitNetwork[]] = [robinhoodNetwork, mainnet];

export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId: REOWN_PROJECT_ID,
  transports: {
    4663: http(ROBINHOOD_RPC_URL),
    [mainnet.id]: http(RPC_URL),
  },
  // MUST be true. Every page here is prerendered at build time and that HTML is
  // what the first client render is diffed against; with `ssr: false` wagmi
  // reads its stored connection synchronously during that render, so a
  // returning player's first paint says "connected" while the prerendered HTML
  // says "not connected" — React hydration error #418, and a wallet that looks
  // stuck. `ssr: true` defers stored state until after mount so both renders
  // agree, and reconnectOnMount restores the session a tick later.
  ssr: true,
});

// Instantiated once at module load (imported from the Providers component).
createAppKit({
  adapters: [wagmiAdapter],
  networks,
  defaultNetwork: robinhoodNetwork,
  projectId: REOWN_PROJECT_ID,
  metadata: {
    name: 'Hoodpoker',
    description: 'Play-money Texas Hold’em on Robinhood Chain — epoker.eth',
    url: 'https://epoker.eth.limo',
    // Must be a square PNG: an SVG or a wide banner renders as no icon at all
    // in the wallet's signing prompt.
    icons: ['https://epoker.eth.limo/icon.png'],
  },
  features: { analytics: false, email: false, socials: false },
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#ccff00',
    '--w3m-color-mix': '#ccff00',
    '--w3m-color-mix-strength': 8,
    '--w3m-border-radius-master': '2px',
  },
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
