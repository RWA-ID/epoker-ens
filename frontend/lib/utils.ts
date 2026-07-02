import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn-style class combiner. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 0x1234…abcd short form for addresses without an ENS name. */
export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function displayName(ensName: string | null | undefined, address: string): string {
  return ensName || shortAddress(address);
}

export function formatChips(n: number): string {
  return n.toLocaleString('en-US');
}
