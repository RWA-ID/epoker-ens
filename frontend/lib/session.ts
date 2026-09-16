'use client';
/**
 * Getting genuinely disconnected.
 *
 * A "reset" that only sweeps localStorage clears wagmi's *pointer* to the
 * WalletConnect session and leaves the session itself behind, because WC v2
 * (as bundled by AppKit) stores it in IndexedDB. The reload then rebuilds the
 * same broken link from the same data and the button looks like it did
 * nothing — which is the last thing somebody tries before deciding the site is
 * broken. So: sweep both.
 *
 * `indexedDB.deleteDatabase()` does not resolve while any tab still holds the
 * database open, including other tabs the player has on the site, so it is
 * bounded rather than awaited outright — an unbounded await would hang the one
 * button that exists to un-hang everything else. The localStorage sweep alone
 * is usually enough to come back disconnected.
 */

const WALLET_KEY_PREFIXES = ['@appkit', 'wagmi.', 'wc@', 'walletconnect', 'W3M_', 'w3m', 'privy:'];
const WC_DATABASE = 'WALLET_CONNECT_V2_INDEXED_DB';

/** Only the wallet's own keys — other things live in this origin too. */
function sweepLocalStorage(): number {
  if (typeof window === 'undefined') return 0;
  let removed = 0;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const lower = key.toLowerCase();
      if (WALLET_KEY_PREFIXES.some((p) => lower.startsWith(p.toLowerCase()))) {
        doomed.push(key);
      }
    }
    for (const key of doomed) {
      localStorage.removeItem(key);
      removed++;
    }
  } catch {
    /* private mode / blocked storage — nothing to sweep */
  }
  return removed;
}

function deleteWalletConnectDb(timeoutMs = 1500): Promise<void> {
  if (typeof indexedDB === 'undefined') return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    // `blocked` is the normal case, not the edge case: the tab being fixed is
    // rarely the player's only tab on the site.
    const timer = setTimeout(done, timeoutMs);
    try {
      const req = indexedDB.deleteDatabase(WC_DATABASE);
      req.onsuccess = () => {
        clearTimeout(timer);
        done();
      };
      req.onerror = () => {
        clearTimeout(timer);
        done();
      };
      req.onblocked = () => {
        /* let the timer win — the localStorage sweep already broke the link */
      };
    } catch {
      clearTimeout(timer);
      done();
    }
  });
}

/** Clear every trace of a wallet session, then reload. */
export async function resetWalletSession(reload = true): Promise<void> {
  sweepLocalStorage();
  clearAllSignatures();
  await deleteWalletConnectDb();
  if (reload && typeof window !== 'undefined') window.location.reload();
}

/** Drop cached sign-in signatures for every address. */
export function clearAllSignatures(): void {
  if (typeof window === 'undefined') return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith('epoker:sig:')) doomed.push(key);
    }
    for (const key of doomed) sessionStorage.removeItem(key);
  } catch {
    /* nothing cached */
  }
}
