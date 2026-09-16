'use client';
/**
 * Client-side provider tree: Privy (passkey sign-in only) + wagmi (via the
 * Reown AppKit adapter) + TanStack Query. Importing lib/appkit initializes
 * AppKit exactly once.
 */
import { useState } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PrivyProvider } from '@privy-io/react-auth';
import { mainnet } from 'viem/chains';
import { wagmiConfig } from '@/lib/appkit';
import { robinhood } from '@/lib/chains';
import { PRIVY_APP_ID } from '@/lib/config';
import { ConnectProvider } from '@/lib/wallet';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 2 } },
  }));

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        // Passkeys only. External wallets go through AppKit, never Privy.
        loginMethods: ['passkey'],
        embeddedWallets: {
          ethereum: { createOnLogin: 'users-without-wallets' },
          // The only thing ever signed is the gas-free sign-in message.
          showWalletUIs: false,
        },
        supportedChains: [robinhood, mainnet],
        defaultChain: robinhood,
        appearance: {
          theme: 'dark',
          accentColor: '#ccff00',
          landingHeader: 'Sign in to HoodPoker',
        },
      }}
    >
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <ConnectProvider>{children}</ConnectProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </PrivyProvider>
  );
}
