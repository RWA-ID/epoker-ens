import { defineChain } from 'viem';

/**
 * Robinhood Chain — Arbitrum Orbit L2, ETH gas.
 * The game itself never transacts: the wallet only signs a gas-free
 * sign-in message. This chain is here so players connect on the network
 * the game is branded around, and so we can read hoodfi.eth subnames
 * out of the L2 registry for handles.
 */
export const robinhood = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.mainnet.chain.robinhood.com'] },
  },
  blockExplorers: {
    default: {
      name: 'Blockscout',
      url: 'https://robinhoodchain.blockscout.com',
    },
  },
});
