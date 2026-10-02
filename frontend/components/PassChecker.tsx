'use client';
/**
 * House Pass eligibility check, by address — no wallet connection needed.
 *
 * Paste an address (or a name: mainnet resolution covers hoodfi.eth subnames
 * over CCIP) and it answers for every free stage:
 *
 *   CCFF00     the published snapshot (public/pass/ccff00-snapshot.json, block
 *              78244737). That list is final, so this answer is too. A wallet
 *              that missed it gets a live `balanceOf` only to word the reply.
 *   Whitelist  the worker's live counter, GET /whitelist?address= (no auth).
 *   HoodFi     a live `balanceOf` on the registry. That stage snapshots on
 *              October 13, so owning a name today is a promise to keep it.
 *
 * The Robinhood RPC refuses a share of calls, so a failed read says "couldn't
 * check" and never "no" — reading a throttle as "you hold none" is the same
 * bug that once demoted players to a bare address at the table.
 */
import { useState } from 'react';
import { createPublicClient, http, isAddress, parseAbi, type Address } from 'viem';
import { normalize } from 'viem/ens';
import { getEnsAddress } from '@wagmi/core';
import { robinhood } from '@/lib/chains';
import { ROBINHOOD_RPC_URL, HOODFI_REGISTRY } from '@/lib/config';
import { wagmiConfig } from '@/lib/appkit';
import { api } from '@/lib/api';
import { useIdentity } from '@/lib/identity';
import { CCFF00_SNAPSHOT, fmt } from '@/lib/housePass';
import { Button } from '@/components/ui/button';

/** CCFF00 on Robinhood Chain (verified on-chain: name/symbol CCFF00). */
export const CCFF00_CONTRACT = '0x505A22Ffed8d37ebE580FfD98d2Cdb0021189146' as const;

const BALANCE_ABI = parseAbi(['function balanceOf(address owner) view returns (uint256)']);

const client = createPublicClient({ chain: robinhood, transport: http(ROBINHOOD_RPC_URL) });

/** null = couldn't read (throttled or down), never "zero". */
async function balanceOf(contract: Address, owner: Address): Promise<number | null> {
  for (let i = 0; i < 2; i++) {
    try {
      const b = await client.readContract({ address: contract, abi: BALANCE_ABI, functionName: 'balanceOf', args: [owner] });
      return Number(b);
    } catch {
      if (i === 0) await new Promise((r) => setTimeout(r, 400));
    }
  }
  return null;
}

let snapshot: Promise<string[]> | null = null;
function picked(): Promise<string[]> {
  snapshot ??= fetch(CCFF00_SNAPSHOT.url)
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<{ picked: string[] }>;
    })
    .then((d) => d.picked)
    .catch((err) => {
      snapshot = null; // let the next click retry
      throw err;
    });
  return snapshot;
}

type Tone = 'in' | 'out' | 'unknown';
interface Row {
  stage: string;
  tone: Tone;
  text: string;
}

async function checkAll(address: Address): Promise<Row[]> {
  const lower = address.toLowerCase();
  const [list, held, wl, names] = await Promise.all([
    picked().catch(() => null),
    balanceOf(CCFF00_CONTRACT, address),
    api.whitelist(lower).catch(() => null),
    balanceOf(HOODFI_REGISTRY, address),
  ]);

  const rank = list ? list.indexOf(lower) + 1 : 0;
  const ccff00: Row = !list
    ? { stage: 'CCFF00', tone: 'unknown', text: 'Couldn’t load the snapshot list. Try again.' }
    : rank > 0
      ? { stage: 'CCFF00', tone: 'in', text: `In: #${fmt(rank)} of ${fmt(CCFF00_SNAPSHOT.cap)} at the ${CCFF00_SNAPSHOT.date} snapshot. One free pass, guaranteed.` }
      : held
        ? { stage: 'CCFF00', tone: 'out', text: `Holds ${fmt(held)} CCFF00 but missed the ${fmt(CCFF00_SNAPSHOT.cap)}-wallet cut. Take a whitelist spot or a HoodFi name below.` }
        : { stage: 'CCFF00', tone: 'out', text: `Not on the ${CCFF00_SNAPSHOT.date} snapshot.` };

  const whitelist: Row = !wl
    ? { stage: 'Whitelist', tone: 'unknown', text: 'Couldn’t reach the whitelist. Try again.' }
    : wl.joined && wl.position
      ? wl.position <= wl.cap
        ? { stage: 'Whitelist', tone: 'in', text: `Signed up: #${fmt(wl.position)} of ${fmt(wl.cap)}.` }
        : { stage: 'Whitelist', tone: 'unknown', text: `Signed up: waitlist #${fmt(wl.position - wl.cap)}. Spots open up as picked CCFF00 holders come off the list.` }
      : rank > 0
        ? { stage: 'Whitelist', tone: 'out', text: 'Not signed up, and no need: this wallet already mints in the CCFF00 stage.' }
        : { stage: 'Whitelist', tone: 'out', text: wl.open ? 'Not signed up yet. Connect below to take a spot.' : 'Not signed up, and sign-ups are closed.' };

  const hoodfi: Row =
    names === null
      ? { stage: 'HoodFi name', tone: 'unknown', text: 'Couldn’t reach Robinhood Chain just now — that RPC drops calls. Try again.' }
      : names > 0
        ? { stage: 'HoodFi name', tone: 'in', text: `Owns ${names === 1 ? 'a hoodfi.eth name' : `${fmt(names)} hoodfi.eth names`}. Keep one through the October 13 snapshot.` }
        : { stage: 'HoodFi name', tone: 'out', text: 'No hoodfi.eth name. Mint one before October 13 to get in.' };

  return [ccff00, whitelist, hoodfi];
}

const DOT: Record<Tone, string> = { in: 'bg-acid', out: 'bg-cream/25', unknown: 'bg-[#f2b84b]' };

export function PassChecker() {
  const { address: connected } = useIdentity();
  const [input, setInput] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [checked, setChecked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const check = async () => {
    const raw = (input.trim() || connected || '').trim();
    if (!raw) return setError('Paste a wallet address.');
    setChecking(true);
    setRows(null);
    setError(null);
    try {
      let address: Address;
      if (isAddress(raw)) address = raw;
      else if (raw.includes('.')) {
        const resolved = await getEnsAddress(wagmiConfig, { name: normalize(raw), chainId: 1 }).catch(() => null);
        if (!resolved) throw new Error(`Couldn’t resolve “${raw}” — check the spelling, or paste the 0x address.`);
        address = resolved;
      } else throw new Error('That isn’t an address. It should start with 0x and be 42 characters long.');
      setChecked(address);
      setRows(await checkAll(address));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check failed. Try again.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="mt-4 rounded-card border border-acid/25 bg-acid/[0.05] p-4">
      <div className="flex items-center gap-2.5">
        <span aria-hidden className="h-5 w-5 shrink-0 rounded-[3px] border border-acid/40" style={{ backgroundColor: '#CCFF00' }} />
        <p className="text-[14px] leading-[1.5] text-cream">
          <span className="font-semibold text-acid">Check any wallet.</span>{' '}
          <span className="text-muted">
            The CCFF00 snapshot is in: {fmt(CCFF00_SNAPSHOT.cap)} of {fmt(CCFF00_SNAPSHOT.holders)} holders made it.
          </span>
        </p>
      </div>

      <form
        className="mt-3.5 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!checking) check();
        }}
      >
        <label htmlFor="pass-check-address" className="sr-only">
          Wallet address or name
        </label>
        <input
          id="pass-check-address"
          value={input}
          onChange={(e) => { setInput(e.target.value); setError(null); }}
          placeholder={connected ? `${connected.slice(0, 6)}…${connected.slice(-4)} (yours) or 0x…` : '0x… or name.hoodfi.eth'}
          autoComplete="off"
          spellCheck={false}
          // 16px on touch screens: iOS zooms the page into any smaller input.
          className="min-w-0 flex-1 rounded-btn border border-cream/[0.16] bg-night-950 px-3.5 py-2.5 font-mono text-[16px] text-cream outline-none transition-colors placeholder:text-ghost focus:border-acid md:text-sm"
        />
        <Button type="submit" variant="outline" disabled={checking}>
          {checking ? 'Checking…' : 'Check'}
        </Button>
      </form>

      {error && <p className="mt-3 text-[14px] leading-[1.5] text-muted" role="status">{error}</p>}

      {rows && checked && (
        <div className="mt-3.5" role="status">
          <p className="font-mono text-[11px] tracking-[0.06em] text-faint">
            {checked.slice(0, 6)}…{checked.slice(-4)}
          </p>
          <ul className="mt-2 grid gap-2">
            {rows.map((r) => (
              <li key={r.stage} className="flex gap-2.5 text-[14px] leading-[1.5]">
                <span aria-hidden className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${DOT[r.tone]}`} />
                <p className={r.tone === 'in' ? 'text-cream' : 'text-muted'}>
                  <span className={r.tone === 'in' ? 'font-semibold text-acid' : 'font-semibold text-cream'}>{r.stage}</span>
                  {' — '}
                  {r.text}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
