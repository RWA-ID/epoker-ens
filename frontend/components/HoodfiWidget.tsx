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
const REGISTRY: Address = '0xf2bABA012244bdD7445129597350054E1B3aEe5C';
const registryAbi = parseAbi([
  'function baseNode() view returns (bytes32)',
  'function makeNode(bytes32 parentNode, string label) pure returns (bytes32)',
  'function ownerOf(uint256 tokenId) view returns (address)',
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

/**
 * A registration that was broadcast but whose confirmation we may never see.
 *
 * Signing on mobile means switching to the wallet app, which backgrounds this browser —
 * and the OS is free to discard the page while it is away. The same thing that kills the
 * table socket (see lib/ws.ts, which reconnects on visibilitychange/pageshow) kills the
 * promise waiting on a receipt. The transactions still land; nothing is left here to
 * notice. So the label is written down before the wallet is opened, and checked against
 * the registry on the way back.
 *
 * Ownership is the check, not the receipt: it is the thing the player actually cares
 * about, and it is still true after a reload that threw the tx hash away.
 */
const PENDING_KEY = 'hoodfi:pending';

function readPending(): { label: string; owner: string } | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as { label: string; owner: string }) : null;
  } catch {
    return null;
  }
}
function writePending(v: { label: string; owner: string } | null) {
  try {
    if (v) localStorage.setItem(PENDING_KEY, JSON.stringify(v));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    /* private mode — the flow still works, it just cannot resume */
  }
}

/** Does `owner` hold `label`.hoodfi.eth? ownerOf reverts for a name never minted, which is a no. */
async function ownsName(label: string, owner: string): Promise<boolean> {
  try {
    const base = await reader.readContract({ address: REGISTRY, abi: registryAbi, functionName: 'baseNode' });
    const node = await reader.readContract({
      address: REGISTRY,
      abi: registryAbi,
      functionName: 'makeNode',
      args: [base, label],
    });
    const holder = await reader.readContract({
      address: REGISTRY,
      abi: registryAbi,
      functionName: 'ownerOf',
      args: [BigInt(node)],
    });
    return holder.toLowerCase() === owner.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * A wallet step that settles from the chain, not from the wallet's reply.
 *
 * A WalletConnect reply can be lost on the relay after the wallet has already signed and
 * broadcast: `writeContractAsync` then never settles, and neither does anything awaiting
 * it. That left the card on "Confirm in wallet…" forever after a real, mined approval.
 * So the send races a poll of the state the step is meant to produce (an allowance, an
 * owner) and whichever proves it first wins. A rejection in the wallet still rejects.
 *
 * Running out of time is not a failure — the transaction may still land — so the error
 * says so, rather than inviting someone to pay twice.
 */
const STEP_TIMEOUT_MS = 180_000;
const POLL_MS = 3_000;

function settleFromChain(
  send: () => Promise<`0x${string}`>,
  done: () => Promise<boolean>,
  slowMessage: string,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let over = false;
    const finish = (err?: unknown) => {
      if (over) return;
      over = true;
      clearInterval(poll);
      clearTimeout(timer);
      if (err) reject(err);
      else resolve();
    };

    const check = () => {
      done().then((ok) => ok && finish(), () => {});
    };
    const poll = setInterval(check, POLL_MS);
    const timer = setTimeout(() => finish(new Error(slowMessage)), STEP_TIMEOUT_MS);

    send().then(
      async (hash) => {
        try {
          const receipt = await reader.waitForTransactionReceipt({ hash, timeout: STEP_TIMEOUT_MS });
          // A receipt is not a success: `status` is the only thing that says it did not revert.
          if (receipt.status !== 'success') finish(new Error('The transaction reverted'));
          else check();
        } catch {
          // The receipt wait gave out; the poll is still running and decides.
        }
      },
      (err) => finish(err),
    );
  });
}

type Step = 'approve' | 'register' | null;

export function HoodfiWidget() {
  const slot = useRef<HTMLDivElement>(null);
  const handle = useRef<Handle | null>(null);
  const [failed, setFailed] = useState(false);
  const [claimed, setClaimed] = useState<string | null>(null);
  // Which of the two wallet prompts we are on, shown under the card. The widget's own
  // button just says "Confirm in wallet…" for the whole flow, and a second prompt nobody
  // was told about reads as a repeat — or as the first one having failed.
  const [step, setStep] = useState<Step>(null);
  const [needsApproval, setNeedsApproval] = useState(false);

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

      const covered = async () =>
        (await reader.readContract({
          address: USDG,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [address, ROUTER],
        })) >= price;

      try {
        // Approve only when short. An allowance already covering the price means a second
        // prompt for nothing, and two wallet popups is where people give up. It is also
        // what makes a retry after a stuck approval a single prompt.
        const approve = !(await covered());
        setNeedsApproval(approve);
        if (approve) {
          setStep('approve');
          // registerViaPartner pulls the USDG, so it must not be sent before the
          // allowance is on-chain — settled means read back, not merely signed.
          await settleFromChain(
            () =>
              writeContractAsync({
                address: USDG,
                abi: erc20Abi,
                functionName: 'approve',
                args: [ROUTER, price],
                chainId: robinhood.id,
              }),
            covered,
            'The USDG approval has not confirmed yet. It may still land — try again in a minute and it will skip straight to the registration.',
          );
        }

        // Written down BEFORE the wallet opens. Everything after this point can be lost to
        // the OS discarding a backgrounded page; this is what lets the return trip recover.
        writePending({ label, owner: address });
        setStep('register');

        try {
          await settleFromChain(
            () =>
              writeContractAsync({
                address: ROUTER,
                abi: routerAbi,
                functionName: 'registerViaPartner',
                args: [label, PARTNER],
                chainId: robinhood.id,
              }),
            () => ownsName(label, address),
            `Still waiting on Robinhood Chain. ${label}.hoodfi.eth may still be on its way — check back in a minute before trying again.`,
          );
        } catch (err) {
          // Keep the pending record on a timeout: resume() will notice if it lands. Only a
          // rejection or a revert means nothing is coming.
          if (!(err instanceof Error && err.message.startsWith('Still waiting'))) writePending(null);
          throw err;
        }
        writePending(null);
        setClaimed(label);
      } finally {
        setStep(null);
      }
    },
    [address, writeContractAsync],
  );

  /**
   * Did a registration we lost track of actually land? Ownership answers it.
   *
   * Runs on mount and every time the tab comes back, which is exactly the moment a mobile
   * player returns from their wallet app.
   */
  const resume = useCallback(async () => {
    const pending = readPending();
    if (!pending) return;
    // Not owned yet leaves the card as it is rather than claiming something untrue.
    if (await ownsName(pending.label, pending.owner)) {
      writePending(null);
      setClaimed(pending.label);
    }
  }, []);

  useEffect(() => {
    void resume();
    const onBack = () => void resume();
    document.addEventListener('visibilitychange', onBack);
    window.addEventListener('pageshow', onBack);
    return () => {
      document.removeEventListener('visibilitychange', onBack);
      window.removeEventListener('pageshow', onBack);
    };
  }, [resume]);

  /**
   * The current props, for the mount callback to read.
   *
   * The mount effect runs once and its callback fires later, when the script finishes
   * loading — so anything it closes over is whatever the first render had. That raced
   * with the resume check: on a fast RPC the name came back claimed before the script
   * loaded, the update effect skipped because there was no handle yet, and the widget
   * then mounted with the stale `claimed: null`. Nothing changed afterwards to correct
   * it, so a recovered registration rendered as an empty card.
   */
  const latest = useRef({ canTransact, claimed, connect, onCheck, onSubmit });
  latest.current = { canTransact, claimed, connect, onCheck, onSubmit };

  // Mount once. State changes go through handle.update so a half-typed name survives.
  useEffect(() => {
    let cancelled = false;

    function mount() {
      const api = (window as unknown as { HoodFiWidget?: WidgetApi }).HoodFiWidget;
      if (cancelled || !api || !slot.current || handle.current) return;
      slot.current.replaceChildren();
      const now = latest.current;
      try {
        handle.current = api.mount(slot.current, {
          partner: PARTNER,
          accent: ACCENT,
          theme: 'dark',
          price: '$4.00',
          fonts: false,
          connected: now.canTransact,
          claimed: now.claimed,
          onConnect: now.connect,
          onCheck: now.onCheck,
          onSubmit: now.onSubmit,
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
    handle.current?.update({
      connected: canTransact,
      claimed,
      onConnect: connect,
      onCheck,
      onSubmit,
    });
  }, [canTransact, claimed, connect, onCheck, onSubmit]);

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
      {step && (
        <p className="mt-3 text-[13.5px] leading-[1.6] text-muted" aria-live="polite">
          {needsApproval && (
            <span className="font-mono text-[12.5px]">
              Step {step === 'approve' ? 1 : 2} of 2 ·{' '}
            </span>
          )}
          {step === 'approve'
            ? 'Approve USDG in your wallet — this lets the name be paid for.'
            : 'Confirm the registration in your wallet.'}
        </p>
      )}
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
