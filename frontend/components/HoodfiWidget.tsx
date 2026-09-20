'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPublicClient, http, parseAbi, type Address } from 'viem';
import { useAccount, useWriteContract } from 'wagmi';

import { robinhood } from '@/lib/chains';
import { ROBINHOOD_RPC_URL } from '@/lib/config';
import { useConnect, useWallet } from '@/lib/wallet';

/**
 * The HoodFi Names widget, wired to this site's own wallet.
 *
 * Headless: the widget renders the card and owns the name rules, and everything touching
 * the chain happens here, with the signer the player already connected. Nobody is sent to
 * hoodfi.name and nobody connects a second wallet — the earlier link-out version worked,
 * but asking a signed-in player to go and connect again somewhere else is the kind of
 * handoff that loses most of them.
 *
 * Served from /hoodfi-widget.js rather than unpkg. `script-src` here is `'self'` plus
 * inline, and opening it to a CDN would let a compromised npm package execute in the
 * origin that holds Privy passkeys and wallet sessions. Re-copy the file from
 * hoodfi-eth/widget when the package updates.
 */
const PARTNER: Address = '0x5f11a48230f7CdaB91A2361576239091E4b1165b';
const ROUTER: Address = '0xB7Bd5F2c7c445dDc5d55eBD9b8F6A20C2e6e4b5d';
const USDG: Address = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168';
const ACCENT = '#ccff00';

const routerAbi = parseAbi([
  'function quote(string label, address partner) view returns (uint256 price, uint256 baseFee, bool sellable, uint8 nameStatus)',
  'function registerViaPartner(string label, address partner)',
]);
const erc20Abi = parseAbi([
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
]);

const reader = createPublicClient({ chain: robinhood, transport: http(ROBINHOOD_RPC_URL) });

type Handle = { update: (patch: Record<string, unknown>) => void; destroy: () => void };
type WidgetApi = { mount: (el: Element, opts: Record<string, unknown>) => Handle };

/** Registrar status codes, as the widget should phrase them to a player. */
const STATUS_REASON: Record<number, string> = {
  1: 'already taken',
  2: 'reserved for donors',
  3: 'not a valid name',
  4: 'reserved by the registry',
};

export function HoodfiWidget() {
  const slot = useRef<HTMLDivElement>(null);
  const handle = useRef<Handle | null>(null);
  const [failed, setFailed] = useState(false);

  const { address, source, isConnected } = useWallet();
  const connect = useConnect();
  const { connector } = useAccount();
  const { writeContractAsync } = useWriteContract();

  // Only a wagmi-backed wallet can sign these two transactions here. The Privy embedded
  // wallet signs through Privy's own API, which this component does not wire up — a
  // passkey player is handed the hosted page instead of a button that cannot work.
  const canTransact = isConnected && source === 'appkit' && Boolean(connector);

  /** Availability, answered from our own RPC — the one thing the widget cannot know. */
  const onCheck = useCallback(async (label: string) => {
    const [, , sellable, nameStatus] = await reader.readContract({
      address: ROUTER,
      abi: routerAbi,
      functionName: 'quote',
      args: [label, PARTNER],
    });
    return { sellable, reason: sellable ? undefined : STATUS_REASON[nameStatus] };
  }, []);

  const onSubmit = useCallback(
    async ({ label }: { label: string }) => {
      if (!address) throw new Error('No wallet connected');

      const [price, , sellable] = await reader.readContract({
        address: ROUTER,
        abi: routerAbi,
        functionName: 'quote',
        args: [label, PARTNER],
      });
      if (!sellable) throw new Error('That name is no longer available');

      // Approve only when short. An allowance already covering the price means a second
      // prompt for nothing, and two wallet popups is where people give up.
      const allowance = await reader.readContract({
        address: USDG,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [address, ROUTER],
      });
      if (allowance < price) {
        const approveHash = await writeContractAsync({
          address: USDG,
          abi: erc20Abi,
          functionName: 'approve',
          args: [ROUTER, price],
          chainId: robinhood.id,
        });
        // Wait for it: registerViaPartner pulls the USDG, so sending it against an
        // unmined approval just reverts.
        const approved = await reader.waitForTransactionReceipt({ hash: approveHash });
        if (approved.status !== 'success') throw new Error('The approval did not go through');
      }

      const hash = await writeContractAsync({
        address: ROUTER,
        abi: routerAbi,
        functionName: 'registerViaPartner',
        args: [label, PARTNER],
        chainId: robinhood.id,
      });
      // A receipt is not a success. `status` is the only thing that says the call did not
      // revert, and waitForTransactionReceipt resolves happily either way.
      const receipt = await reader.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error('The registration reverted');
    },
    [address, writeContractAsync],
  );

  // Mount once. State changes go through handle.update so a half-typed name survives.
  useEffect(() => {
    let cancelled = false;

    function mount() {
      const api = (window as unknown as { HoodFiWidget?: WidgetApi }).HoodFiWidget;
      if (cancelled || !api || !slot.current || handle.current) return;
      slot.current.replaceChildren();
      try {
        handle.current = api.mount(slot.current, {
          partner: PARTNER,
          accent: ACCENT,
          theme: 'dark',
          price: '$4.00',
          fonts: false,
          connected: canTransact,
          onConnect: connect,
          onCheck,
          onSubmit,
        });
      } catch {
        setFailed(true);
      }
    }

    if ((window as unknown as { HoodFiWidget?: WidgetApi }).HoodFiWidget) {
      mount();
      return () => {
        cancelled = true;
      };
    }

    const existing = document.getElementById('hoodfi-widget');
    if (existing) {
      existing.addEventListener('load', mount);
      return () => {
        cancelled = true;
        existing.removeEventListener('load', mount);
      };
    }

    const s = document.createElement('script');
    s.id = 'hoodfi-widget';
    s.src = '/hoodfi-widget.js';
    s.onload = mount;
    s.onerror = () => setFailed(true);
    document.head.appendChild(s);

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once; the rest is pushed
  }, []);

  // Push wallet state in rather than remounting, so typing survives a connect.
  useEffect(() => {
    handle.current?.update({ connected: canTransact, onConnect: connect, onCheck, onSubmit });
  }, [canTransact, connect, onCheck, onSubmit]);

  if (failed) {
    return (
      <p className="text-[15px] leading-[1.6] text-muted">
        The name widget could not load.{' '}
        <a href="https://www.hoodfi.name/mint/" target="_blank" rel="noreferrer">
          Register at hoodfi.name
        </a>{' '}
        instead.
      </p>
    );
  }

  return (
    <div>
      <div ref={slot} />
      {isConnected && !canTransact && (
        // Passkey players: the embedded wallet cannot sign this here, so say so rather
        // than leave a dead button.
        <p className="mt-3 text-[13.5px] leading-[1.6] text-muted">
          Signed in with a passkey?{' '}
          <a
            href={`https://www.hoodfi.name/mint/?partner=${PARTNER}`}
            target="_blank"
            rel="noreferrer"
          >
            Register on hoodfi.name
          </a>{' '}
          — this box needs a connected wallet.
        </p>
      )}
    </div>
  );
}
