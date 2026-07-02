#!/usr/bin/env node
/**
 * Pin the static build (out/) to IPFS via Pinata.
 * Usage:  npm run build && node pin.mjs
 * Reads PINATA_JWT from .env.local (or the environment).
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

// --- load PINATA_JWT from .env.local if not already in the env ---
if (!process.env.PINATA_JWT && existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^PINATA_JWT=(.+)$/);
    if (m) process.env.PINATA_JWT = m[1].trim();
  }
}
const JWT = process.env.PINATA_JWT;
if (!JWT) {
  console.error('PINATA_JWT missing — set it in frontend/.env.local');
  process.exit(1);
}
if (!existsSync('out')) {
  console.error('out/ not found — run `npm run build` first');
  process.exit(1);
}

// --- collect every file under out/ ---
function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    statSync(p).isDirectory() ? walk(p, files) : files.push(p);
  }
  return files;
}
const files = walk('out');
console.log(`Pinning ${files.length} files from out/ …`);

const form = new FormData();
for (const path of files) {
  const rel = relative('out', path);
  form.append('file', new Blob([readFileSync(path)]), `epoker/${rel}`);
}
form.append('pinataMetadata', JSON.stringify({ name: `epoker-eth-${new Date().toISOString().slice(0, 10)}` }));

const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
  method: 'POST',
  headers: { Authorization: `Bearer ${JWT}` },
  body: form,
});
const data = await res.json();
if (!res.ok) {
  console.error('Pinata error:', data);
  process.exit(1);
}
console.log('\n✅ Pinned!');
console.log('CID       :', data.IpfsHash);
console.log('Preview   :', `https://gateway.pinata.cloud/ipfs/${data.IpfsHash}`);
console.log('ENS       : set epoker.eth contenthash to', `ipfs://${data.IpfsHash}`);
