/**
 * Spaces: the real TableDO + Space against fake sockets and a fake Realtime
 * SFU that records every call, so "the server enforces who can speak" is
 * checked at the point where audio would actually flow.
 *
 *   npm run test:space
 */
import { TableDO, spaceSfu } from '../src/table';
import { SPACE_LIMITS, type Sfu } from '../src/space';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---------------- fakes ---------------- */

function fakeSfu() {
  let n = 0;
  const calls: string[] = [];
  const closed: string[] = []; // "session:mid"
  /** Publisher sessions whose audio isn't flowing yet (SFU: not_found_track_error). */
  const notReady = new Set<string>();
  const sfu: Sfu = {
    async newSession() { calls.push('new'); return `s${++n}`; },
    async addTracks(sid, body) {
      calls.push(`add:${sid}:${body.tracks.map((t) => t.location).join(',')}`);
      if (body.tracks[0]?.location === 'local') {
        return { sessionDescription: { type: 'answer', sdp: 'v=0 answer' }, tracks: body.tracks };
      }
      return {
        sessionDescription: { type: 'offer', sdp: 'v=0 offer' },
        requiresImmediateRenegotiation: true,
        tracks: body.tracks.map((t, i) => notReady.has(t.sessionId!)
          ? { ...t, mid: '', errorCode: 'not_found_track_error', errorDescription: 'Track not found on remote peer' }
          : { ...t, mid: String(10 + i) }),
      };
    },
    async renegotiate(sid) { calls.push(`reneg:${sid}`); },
    async closeTracks(sid, mids) { for (const m of mids) closed.push(`${sid}:${m}`); },
  };
  return { sfu, calls, closed, notReady };
}

function fakeState() {
  const store = new Map<string, unknown>();
  return {
    blockConcurrencyWhile: (fn: () => Promise<void>) => fn(),
    storage: {
      get: async (k: string) => store.get(k),
      put: async (k: string, v: unknown) => { store.set(k, v); },
      setAlarm: async () => {},
      deleteAlarm: async () => {},
      deleteAll: async () => { store.clear(); },
    },
  };
}

const noDb = {
  prepare() {
    const s = { bind: () => s, run: async () => ({ meta: { changes: 1 } }), first: async () => null, all: async () => ({ results: [] }) };
    return s;
  },
};

type Listener = (evt: any) => void;
class FakeSocket {
  sent: any[] = [];
  listeners = new Map<string, Listener[]>();
  closed = false;
  accept() {}
  send(data: string) { if (!this.closed) this.sent.push(JSON.parse(data)); }
  close() { this.closed = true; }
  addEventListener(type: string, fn: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  drop() { this.closed = true; for (const fn of this.listeners.get('close') ?? []) fn({}); }
  space() { return [...this.sent].reverse().find((m) => m.type === 'state')?.state.space; }
  errors() { return this.sent.filter((m) => m.type === 'error').map((m) => m.error); }
  notices() { return this.sent.filter((m) => m.type === 'notice').map((m) => m.text); }
}

const addr = (n: number) => `0x${String(n).repeat(40).slice(0, 40)}`;
const HOST = addr(1);

async function makeTable(extra: object = {}, sfu: Sfu | null = fakeSfu().sfu) {
  spaceSfu.make = () => sfu;
  const table: any = new TableDO(fakeState() as any, { DB: noDb, TABLES: null } as any);
  await table.fetch(new Request('https://do/init', {
    method: 'POST',
    body: JSON.stringify({ id: 't1', name: 'Spaces', smallBlind: 10, host: HOST, space: true, ...extra }),
  }));
  return table;
}

function connect(table: any, address: string) {
  const ws = new FakeSocket();
  table.acceptSocket(ws, { address, handle: null, avatar: null });
  return ws;
}

const say = (ws: FakeSocket, msg: object) => ws.listeners.get('message')![0]({ data: JSON.stringify(msg) });

async function audio(table: any, address: string, op: string, body: object = {}) {
  const res: Response = await table.fetch(new Request(`https://do/space/${op}?address=${address}`, {
    method: 'POST', body: JSON.stringify(body),
  }));
  return { status: res.status, body: (await res.json()) as any };
}

const offer = { type: 'offer', sdp: 'v=0 mic' };

/* ---------------- 1. only the host starts it; nothing reaches the SFU before ---------------- */
{
  const { sfu, calls } = fakeSfu();
  const table = await makeTable({}, sfu);
  const host = connect(table, HOST);
  const guest = connect(table, addr(2));

  check('a fresh table shows the Space, not live', host.space()?.live === false && host.space()?.you === 'host');
  check('joining audio before it is live is refused', (await audio(table, addr(2), 'connect')).status === 409);
  say(guest, { type: 'space:start' });
  check('a guest cannot start the Space', guest.errors().some((e: string) => /host/.test(e)) && !host.space()?.live);
  check('no SFU call before the host starts', calls.length === 0);

  say(host, { type: 'space:start' });
  check('the host starts it', guest.space()?.live === true);
  await table.fetch(new Request('https://do/x')); // noop
  await (table as any).spaceRoom.end('test over');
}

/* ---------------- 2. the server decides who speaks ---------------- */
{
  const { sfu, calls, closed } = fakeSfu();
  const table = await makeTable({}, sfu);
  const host = connect(table, HOST);
  const guest = connect(table, addr(2));
  say(host, { type: 'space:start' });

  const h = await audio(table, HOST, 'connect');
  const g = await audio(table, addr(2), 'connect');
  check('both get an SFU session', h.body.sessionId === 's1' && g.body.sessionId === 's2');

  const denied = await audio(table, addr(2), 'publish', { offer, mid: '0' });
  check('a listener cannot publish a mic', denied.status === 403 && !calls.some((c) => c.startsWith('add:s2:local')));

  const pub = await audio(table, HOST, 'publish', { offer, mid: '0' });
  check('the host publishes and gets an SDP answer', pub.status === 200 && pub.body.answer?.type === 'answer');
  check('the host track is listed for pulling', guest.space()?.tracks.length === 1 && guest.space()?.tracks[0].sessionId === 's1');

  const forged = await audio(table, addr(2), 'pull', { tracks: [{ sessionId: 'someone-elses' }] });
  check('pulling a made-up session id pulls nothing', forged.body.tracks.length === 0);
  const pull = await audio(table, addr(2), 'pull', { tracks: [{ sessionId: 's1' }] });
  check('a listener pulls the live speaker', pull.body.offer?.type === 'offer' && pull.body.requiresImmediateRenegotiation === true);
  const reneg = await audio(table, addr(2), 'renegotiate', { answer: { type: 'answer', sdp: 'v=0' } });
  check('and answers the renegotiation', reneg.status === 200 && calls.includes('reneg:s2'));

  // Hand raise → invite → speak → host mute → removal.
  say(guest, { type: 'space:raise' });
  check('a raised hand shows to the host', host.space()?.hands.map((m: any) => m.address).includes(addr(2)));
  say(host, { type: 'space:invite', address: addr(2) });
  check('invited: on stage, hand lowered, arrives muted',
    guest.space()?.you === 'speaker' && host.space()?.hands.length === 0
    && host.space()?.stage.find((m: any) => m.address === addr(2))?.muted === true);
  const spk = await audio(table, addr(2), 'publish', { offer, mid: '0' });
  check('a speaker can publish', spk.status === 200 && host.space()?.tracks.length === 2);

  say(host, { type: 'space:mute', address: addr(2) });
  await wait(0);
  check('a host mute force-closes the track on the SFU', closed.includes('s2:0') && host.space()?.tracks.length === 1);
  check('and tells the speaker', guest.notices().some((t: string) => /muted/.test(t)));
  check('a muted speaker stays on stage and may unmute', (await audio(table, addr(2), 'publish', { offer, mid: '1' })).status === 200);

  say(host, { type: 'space:remove', address: addr(2) });
  await wait(0);
  check('removal closes the mic', closed.includes('s2:1') && guest.space()?.you === 'listener');
  check('a removed speaker cannot publish again', (await audio(table, addr(2), 'publish', { offer, mid: '2' })).status === 403);

  say(guest, { type: 'space:mute', address: HOST });
  say(guest, { type: 'space:invite', address: addr(2) });
  check('a listener can neither mute the host nor invite', guest.errors().length >= 2 && guest.space()?.you === 'listener');
  await (table as any).spaceRoom.end('test over');
}

/* ---------------- 2b. pulling a speaker who is still connecting ---------------- */
{
  const { sfu, notReady } = fakeSfu();
  const table = await makeTable({}, sfu);
  const host = connect(table, HOST);
  connect(table, addr(2));
  say(host, { type: 'space:start' });
  await audio(table, HOST, 'connect');
  await audio(table, HOST, 'publish', { offer, mid: '0' });
  await audio(table, addr(2), 'connect');
  notReady.add('s1');
  const early = await audio(table, addr(2), 'pull', { tracks: [{ sessionId: 's1' }] });
  check('a not-yet-flowing track is a retry, not a failure',
    early.status === 200 && early.body.tracks[0]?.retry === true && !early.body.tracks[0]?.mid && early.body.offer?.type === 'offer');
  notReady.delete('s1');
  const later = await audio(table, addr(2), 'pull', { tracks: [{ sessionId: 's1' }] });
  check('the retry gets the track', later.body.tracks[0]?.mid === '10' && !later.body.tracks[0]?.retry);
  await (table as any).spaceRoom.end('test over');
}

/* ---------------- 3. co-hosts ---------------- */
{
  const table = await makeTable();
  const host = connect(table, HOST);
  const co = connect(table, addr(2));
  const spk = connect(table, addr(3));
  say(host, { type: 'space:start' });
  say(host, { type: 'space:cohost', address: addr(2), on: true });
  check('the host makes a co-host', co.space()?.you === 'cohost');
  say(co, { type: 'space:invite', address: addr(3) });
  check('a co-host can bring people up', spk.space()?.you === 'speaker');
  say(co, { type: 'space:cohost', address: addr(3), on: true });
  check('a co-host cannot make co-hosts', spk.space()?.you === 'speaker' && co.errors().length === 1);
  say(spk, { type: 'space:remove', address: addr(3) });
  check('a speaker can step down themselves', spk.space()?.you === 'listener');
  await (table as any).spaceRoom.end('test over');
}

/* ---------------- 3b. leaving the audio but staying at the table ---------------- */
{
  const { sfu, closed } = fakeSfu();
  const table = await makeTable({}, sfu);
  const host = connect(table, HOST);
  const guest = connect(table, addr(2));
  say(host, { type: 'space:start' });
  await audio(table, addr(2), 'connect');
  say(host, { type: 'space:invite', address: addr(2) });
  await audio(table, addr(2), 'publish', { offer, mid: '0' });
  say(guest, { type: 'space:hangup' });
  await wait(0);
  check('hanging up closes the mic and leaves the stage',
    closed.includes('s1:0') && guest.space()?.you === 'listener' && guest.space()?.youInAudio === false);
  check('the SFU session is gone too', (await audio(table, addr(2), 'pull', { tracks: [] })).status === 409);
  await (table as any).spaceRoom.end('test over');
}

/* ---------------- 4. private tables: the guest list only ---------------- */
{
  const table = await makeTable({ isPrivate: true, whitelist: [{ address: HOST, handle: null }, { address: addr(2), handle: null }] });
  const host = connect(table, HOST);
  connect(table, addr(2));
  const stranger = connect(table, addr(9));
  say(host, { type: 'space:start' });
  check('a guest may join audio', (await audio(table, addr(2), 'connect')).status === 200);
  check('a stranger with the link may not', (await audio(table, addr(9), 'connect')).status === 403 && stranger.space()?.canJoin === false);
  await (table as any).spaceRoom.end('test over');
}

/* ---------------- 5. caps ---------------- */
{
  const realListeners = SPACE_LIMITS.listeners;
  const realStage = SPACE_LIMITS.stage;
  SPACE_LIMITS.listeners = 2;
  SPACE_LIMITS.stage = 2;
  const table = await makeTable();
  const host = connect(table, HOST);
  for (let i = 2; i <= 4; i++) connect(table, addr(i));
  say(host, { type: 'space:start' });
  await audio(table, addr(2), 'connect');
  await audio(table, addr(3), 'connect');
  check('listeners past the cap are refused', (await audio(table, addr(4), 'connect')).status === 409);
  check('the host always gets in', (await audio(table, HOST, 'connect')).status === 200);
  say(host, { type: 'space:invite', address: addr(2) });
  say(host, { type: 'space:invite', address: addr(3) });
  check('the stage cap holds', host.space()?.stage.length === 2 && host.errors().some((e: string) => /stage holds/.test(e)));
  SPACE_LIMITS.listeners = realListeners;
  SPACE_LIMITS.stage = realStage;
  await (table as any).spaceRoom.end('test over');
}

/* ---------------- 6. automatic endings ---------------- */
{
  const real = { ...SPACE_LIMITS };
  SPACE_LIMITS.hostGoneMs = 40;
  SPACE_LIMITS.emptyStageMs = 10_000;
  SPACE_LIMITS.tickMs = 10;
  const { sfu, closed } = fakeSfu();
  const table = await makeTable({}, sfu);
  const host = connect(table, HOST);
  const guest = connect(table, addr(2));
  say(host, { type: 'space:start' });
  await audio(table, HOST, 'connect');
  await audio(table, HOST, 'publish', { offer, mid: '0' });
  await audio(table, addr(2), 'connect');
  host.drop();
  check('the host dropping closes their mic', closed.includes('s1:0'));
  await wait(20);
  check('a short drop does not end it', guest.space()?.live === true);
  await wait(80);
  check('the host gone past the window ends the Space', guest.space()?.live === false);
  check('listeners are told why', guest.notices().some((t: string) => /host left/.test(t)));

  // Nobody on stage: the host is at the table but never joins audio.
  SPACE_LIMITS.hostGoneMs = 10_000;
  SPACE_LIMITS.emptyStageMs = 40;
  const t2 = await makeTable();
  const h2 = connect(t2, HOST);
  say(h2, { type: 'space:start' });
  await wait(100);
  check('an empty stage ends the Space', h2.space()?.live === false);
  Object.assign(SPACE_LIMITS, real);
}

/* ---------------- 7. no SFU credentials ---------------- */
{
  const table = await makeTable({}, null);
  const host = connect(table, HOST);
  say(host, { type: 'space:start' });
  check('without SFU secrets the Space shows but cannot start',
    host.space()?.enabled === false && host.space()?.live === false && host.errors().length === 1);

  const plain = await makeTable({ space: false });
  const ws = connect(plain, HOST);
  check('a table without a Space has no space view', ws.space() === undefined);
}

console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
