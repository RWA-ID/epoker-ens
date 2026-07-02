'use client';
/**
 * Reown AppKit + wagmi configuration.
 * viem powers all chain reads underneath wagmi; the transport is pinned
 * to the Alchemy RPC endpoint from lib/config.ts.
 */
import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { mainnet } from '@reown/appkit/networks';
import { http } from 'viem';
import { REOWN_PROJECT_ID, RPC_URL } from './config';

export const wagmiAdapter = new WagmiAdapter({
  networks: [mainnet],
  projectId: REOWN_PROJECT_ID,
  transports: { [mainnet.id]: http(RPC_URL) },
  ssr: false, // static export — everything renders client-side
});

// Instantiated once at module load (imported from the Providers component).
createAppKit({
  adapters: [wagmiAdapter],
  networks: [mainnet],
  projectId: REOWN_PROJECT_ID,
  metadata: {
    name: 'ENS Hold’em',
    description: 'Texas Hold’em for the ENS community — epoker.eth',
    url: 'https://epoker.eth.limo',
    icons: ['https://epoker.eth.limo/icon.png'],
  },
  features: { analytics: false, email: false, socials: false },
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#5298ff',
    '--w3m-border-radius-master': '2px',
  },
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
