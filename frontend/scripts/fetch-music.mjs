#!/usr/bin/env node
/**
 * Downloads the boombox playlist (lib/playlist.json) into public/music/.
 *
 * Every track is Kevin MacLeod's, from incompetech.com, licensed CC BY 4.0,
 * which allows rehosting as long as each track is credited. The boombox
 * shows that credit on the track it's playing. The originals are 320kbps
 * (~9MB each); they're re-encoded to 128kbps stereo MP3 (~3.5MB), which is
 * plenty for background music and keeps all 54 tracks under ~200MB.
 *
 * public/music/ is gitignored. Run this before `npm run build` on a fresh
 * checkout or the boombox will 404. Tracks already on disk are skipped.
 *
 *   node scripts/fetch-music.mjs
 *
 * Needs ffmpeg on PATH.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'music');
const playlist = JSON.parse(readFileSync(join(root, 'lib', 'playlist.json'), 'utf8'));
const BASE = 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/';

/** incompetech drops a connection now and then mid-file; retry those. */
async function download(url, title) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      if (attempt === 4) throw new Error(`${title}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

mkdirSync(outDir, { recursive: true });
let fetched = 0;
for (const t of playlist) {
  const dest = join(outDir, `${t.slug}.mp3`);
  if (existsSync(dest)) continue;
  const src = join(outDir, `.${t.slug}.src.mp3`);
  writeFileSync(src, await download(BASE + encodeURIComponent(t.file), t.title));
  const tmp = join(outDir, `.${t.slug}.tmp.mp3`);
  // -map_metadata -1 drops the source tags (and embedded cover art).
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-map', '0:a', '-map_metadata', '-1', '-b:a', '128k', tmp]);
  rmSync(src);
  renameSync(tmp, dest); // only a finished encode gets the real name
  fetched++;
  console.log(`${fetched}  ${t.title}`);
}
console.log(`${playlist.length} tracks in public/music (${fetched} fetched now)`);
