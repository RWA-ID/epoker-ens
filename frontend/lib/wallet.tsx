'use client';
/**
 * One wallet, two ways in.
 *
 *   - AppKit (wagmi)  — every external wallet: injected, WalletConnect, etc.
 *   - Privy           — passkey sign-in ONLY; login creates an embedded wallet.
 *
 * The rest of the app never asks which one it got: it reads `address`, calls
 * `signMessage`, and the worker verifies the same plain personal_sign
 * signature either way (a Privy embedded wallet is an ordinary EOA).
 *
 * If both are somehow live at once, the AppKit wallet wins — it is the one the
 * player picked explicitly in this tab.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAccount, useDisconnect, useSignMessage as useWagmiSignMessage } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { usePrivy, useSignMessage as usePrivySignMessage } from '@privy-io/react-auth';

/**
 * How long to believe a `connecting`/`reconnecting` status before treating the
 * visitor as disconnected.
 *
 * wagmi does not reliably settle to `disconnected` when there is nothing to
 * restore: observed on a clean profile with `wagmi.store.current === null` and
 * zero connections, the status stayed `reconnecting` indefinitely, so a
 * first-time visitor saw "Reconnecting…" instead of "Connect Wallet" forever.
 * Real restores are much faster than this — measured at ~520ms warm and
 * ~1290ms cold — so the bound costs a genuine reconnect nothing. The same
 * bound covers Privy's `ready`, which never arrives if auth.privy.io is
 * unreachable.
 */
const RESTORE_TIMEOUT_MS = 3000;

export type WalletSource = 'appkit' | 'passkey';

export interface Wallet {
  address: `0x${string}` | undefined;
  source: WalletSource | null;
  isConnected: boolean;
  /** True while either side is restoring a stored session on page load. */
  isRestoring: boolean;
  signMessage: (args: { message: string }) => Promise<string>;
  /** Bounded: resolves within ~3s even if the wallet never answers. */
  disconnect: () => Promise<void>;
}

export function useWallet(): Wallet {
  const { address: appkitAddress, status } = useAccount();
  const { signMessageAsync } = useWagmiSignMessage();
  const { disconnectAsync } = useDisconnect();

  const { ready, authenticated, user, logout } = usePrivy();
  const { signMessage: privySignMessage } = usePrivySignMessage();

  const [restoreExpired, setRestoreExpired] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setRestoreExpired(true), RESTORE_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);

  // Only the embedded wallet counts — Privy is never used to link external ones.
  const embedded =
    authenticated && user?.wallet?.walletClientType === 'privy'
      ? (user.wallet.address as `0x${string}`)
      : undefined;

  const appkitLive = status === 'connected' && !!appkitAddress;
  const source: WalletSource | null = appkitLive ? 'appkit' : embedded ? 'passkey' : null;
  const address = appkitLive ? appkitAddress : embedded;

  const appkitRestoring = status === 'reconnecting' || status === 'connecting';
  // Authenticated but the wallet not on the user object yet = still being
  // created right after a first passkey sign-up.
  const privyRestoring = !ready || (authenticated && !embedded);

  const signMessage = useCallback(
    async ({ message }: { message: string }) => {
      if (source === 'passkey' && embedded) {
        // Silent: the message is a gas-free ownership proof, and the passkey
        // ceremony a moment earlier was the player's confirmation.
        const { signature } = await privySignMessage(
          { message },
          { address: embedded, uiOptions: { showWalletUIs: false } },
        );
        return signature;
      }
      return signMessageAsync({ message });
    },
    [source, embedded, privySignMessage, signMessageAsync],
  );

  const disconnect = useCallback(async () => {
    // Never await a wallet round trip unbounded — a WalletConnect reply that
    // never arrives would leave the button spinning forever.
    const bounded = (p: Promise<unknown>) =>
      Promise.race([p, new Promise((r) => setTimeout(r, 3000))]).catch(() => {});
    await Promise.all([
      appkitLive ? bounded(disconnectAsync()) : null,
      authenticated ? bounded(logout()) : null,
    ]);
  }, [appkitLive, authenticated, disconnectAsync, logout]);

  return {
    address,
    source,
    isConnected: !!address,
    isRestoring: !address && (appkitRestoring || privyRestoring) && !restoreExpired,
    signMessage,
    disconnect,
  };
}

/* ── Connect chooser ─────────────────────────────────────────────────────── */

const ConnectContext = createContext<() => void>(() => {});

/** Opens the chooser: passkey (Privy) or an existing wallet (AppKit). */
export function useConnect(): () => void {
  return useContext(ConnectContext);
}

export function ConnectProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openChooser = useCallback(() => setOpen(true), []);

  return (
    <ConnectContext.Provider value={openChooser}>
      {children}
      {open && <ConnectDialog onClose={() => setOpen(false)} />}
    </ConnectContext.Provider>
  );
}

function ConnectDialog({ onClose }: { onClose: () => void }) {
  const { open: openAppKit } = useAppKit();
  const { login, ready } = usePrivy();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const options = useMemo(
    () => [
      {
        title: 'Sign in with a passkey',
        body: 'Face ID, Touch ID or your device PIN. No wallet app needed — we create one for you.',
        disabled: !ready,
        onClick: () => {
          onClose();
          login({ loginMethods: ['passkey'] });
        },
      },
      {
        title: 'Connect a wallet',
        body: 'MetaMask, Rainbow, Coinbase Wallet or any WalletConnect wallet.',
        disabled: false,
        onClick: () => {
          onClose();
          void openAppKit();
        },
      },
    ],
    [ready, login, openAppKit, onClose],
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="connect-title"
        className="w-full max-w-sm overflow-hidden rounded-card border border-cream/[0.12] bg-night-900 shadow-[0_18px_44px_rgba(0,0,0,0.7)]"
      >
        <div className="flex items-center justify-between border-b border-cream/[0.08] px-5 py-4">
          <p id="connect-title" className="hp-display hp-w85 text-[17px] text-cream">
            Take a seat
          </p>
          <button
            onClick={onClose}
            aria-label="Close"
            className="font-mono text-[18px] leading-none text-faint transition-colors hover:text-cream"
          >
            ×
          </button>
        </div>
        <div className="flex flex-col gap-3 p-5">
          {options.map((o) => (
            <button
              key={o.title}
              onClick={o.onClick}
              disabled={o.disabled}
              className="rounded-btn border border-cream/[0.16] bg-cream/[0.03] px-4 py-3.5 text-left transition-colors hover:border-acid disabled:opacity-40"
            >
              <span className="hp-display hp-w85 block text-[15px] text-cream">{o.title}</span>
              <span className="mt-1 block font-mono text-[11px] leading-relaxed text-dim">
                {o.body}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
