/**
 * Spaces — a live voice room on a table, X Spaces style.
 *
 * Roles, hand raises and mutes live here, inside the table's Durable Object.
 * Cloudflare's Realtime SFU only moves the audio: each person holds one SFU
 * session (one WebRTC connection), speakers publish one audio track into it,
 * and everyone pulls the speakers' tracks out.
 *
 * The worker holds the SFU app secret, so every request that touches the SFU
 * passes through this class — and it refuses anyone who isn't on stage. A host
 * mute force-closes the speaker's track on the SFU; it is not a client-side
 * honour system. Self-mute stays in the browser (a disabled mic sends silence,
 * which costs next to nothing).
 *
 * Billing guards (Realtime SFU: 1,000 GB egress free a month, then $0.05/GB):
 * a listener cap, a stage cap, and two automatic endings — the host and every
 * co-host gone, or nobody on stage for 15 minutes.
 */
import type { SpaceMember, SpaceRole, SpaceTrack, SpaceView } from './poker/types';

/* ------------------------------------------------------------------ */
/*  Limits                                                              */
/* ------------------------------------------------------------------ */

export const SPACE_LIMITS = {
  /** Host + co-hosts + speakers. Each listener pulls every live speaker. */
  stage: 10,
  /** Listeners holding an SFU session. Past this, joining audio is refused. */
  listeners: 100,
  /** The host and every co-host gone this long → the Space ends. */
  hostGoneMs: 2 * 60_000,
  /** Nobody on stage this long → the Space ends. */
  emptyStageMs: 15 * 60_000,
  /** How often the two endings above are checked while a Space is live. */
  tickMs: 30_000,
  /** SFU-touching requests per person. Renegotiation is chatty, so generous. */
  ops: { max: 30, windowMs: 60_000 },
};

/* ------------------------------------------------------------------ */
/*  Realtime SFU client                                                 */
/* ------------------------------------------------------------------ */

export interface Sdp {
  type: 'offer' | 'answer';
  sdp: string;
}

export interface SfuTrack {
  location: 'local' | 'remote';
  mid?: string;
  trackName?: string;
  sessionId?: string;
  errorCode?: string;
  errorDescription?: string;
}

export interface SfuTracksResult {
  sessionDescription?: Sdp;
  requiresImmediateRenegotiation?: boolean;
  tracks?: SfuTrack[];
}

/** The four Realtime SFU calls a Space needs. Swapped for a fake in tests. */
export interface Sfu {
  newSession(): Promise<string>;
  addTracks(sessionId: string, body: { sessionDescription?: Sdp; tracks: SfuTrack[] }): Promise<SfuTracksResult>;
  renegotiate(sessionId: string, answer: Sdp): Promise<void>;
  closeTracks(sessionId: string, mids: string[]): Promise<void>;
}

const SFU_BASE = 'https://rtc.live.cloudflare.com/v1';

/** Realtime SFU over its HTTPS API. https://developers.cloudflare.com/realtime/sfu/https-api/ */
export function realtimeSfu(appId: string, appSecret: string): Sfu {
  const call = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const res = await fetch(`${SFU_BASE}/apps/${appId}${path}`, {
      method,
      headers: { Authorization: `Bearer ${appSecret}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as T & { errorCode?: string; errorDescription?: string };
    if (!res.ok || data.errorCode) {
      throw new Error(`sfu ${path}: ${res.status} ${data.errorCode ?? ''} ${data.errorDescription ?? ''}`.trim());
    }
    return data;
  };
  return {
    async newSession() {
      return (await call<{ sessionId: string }>('POST', '/sessions/new')).sessionId;
    },
    async addTracks(sessionId, body) {
      // Per-track errors come back inside a 200 — the caller decides. (A pull
      // of a speaker whose connection is still coming up fails with
      // not_found_track_error while the rest of the request succeeds.)
      return call<SfuTracksResult>('POST', `/sessions/${sessionId}/tracks/new`, body);
    },
    async renegotiate(sessionId, answer) {
      await call('PUT', `/sessions/${sessionId}/renegotiate`, { sessionDescription: answer });
    },
    async closeTracks(sessionId, mids) {
      // force: stop forwarding now, without waiting on an SDP exchange — the
      // only way to shut off someone else's audio.
      await call('PUT', `/sessions/${sessionId}/tracks/close`, {
        tracks: mids.map((mid) => ({ mid })),
        force: true,
      });
    },
  };
}

/* ------------------------------------------------------------------ */
/*  The Space                                                           */
/* ------------------------------------------------------------------ */

/** What the Space needs from the table that owns it. */
export interface SpaceHost {
  /** The table creator's address — the Space's host. */
  hostAddress: string;
  /** Private tables: only the guest list may listen. */
  canListen(address: string): boolean;
  /** Whether this address has a live table socket right now. */
  isConnected(address: string): boolean;
  /** Display identity for an address with a live socket. */
  identity(address: string): { handle: string | null; avatar: string | null } | null;
  /** Push fresh state to everyone. */
  broadcast(): void;
  /** One notice to one person (e.g. "the host muted you"). */
  notify(address: string, text: string): void;
}

/** Someone's audio connection: their SFU session and, if speaking, their track. */
interface Audio {
  sessionId: string;
  /** Transceiver mid of the published mic track, while publishing. */
  mid?: string;
  ops: number[];
}

export class SpaceError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

/** Track name every speaker publishes under; their session id tells them apart. */
const MIC_TRACK = 'mic';

export class Space {
  private live = false;
  private startedAt: number | null = null;
  private cohosts = new Set<string>();
  private speakers = new Set<string>();
  private hands = new Map<string, number>(); // address → raised at
  private selfMuted = new Set<string>();
  private audio = new Map<string, Audio>();
  private hostGoneSince: number | null = null;
  private emptyStageSince: number | null = null;
  private tick: ReturnType<typeof setInterval> | null = null;

  constructor(private table: SpaceHost, private sfu: Sfu | null) {}

  get isLive() { return this.live; }

  /* ---------------- roles ---------------- */

  roleOf(address: string): SpaceRole {
    if (address === this.table.hostAddress) return 'host';
    if (this.cohosts.has(address)) return 'cohost';
    if (this.speakers.has(address)) return 'speaker';
    return 'listener';
  }

  private onStage(address: string) { return this.roleOf(address) !== 'listener'; }

  private stageCount() {
    return 1 + this.cohosts.size + this.speakers.size;
  }

  private listenerCount() {
    let n = 0;
    for (const address of this.audio.keys()) if (!this.onStage(address)) n++;
    return n;
  }

  /* ---------------- role commands (over the table socket) ---------------- */

  /** A role command from the table socket. Returns an error to show, or null. */
  command(from: string, msg: { type: string; address?: unknown; on?: unknown; muted?: unknown }): string | null {
    const me = this.roleOf(from);
    const isMod = me === 'host' || me === 'cohost';
    const target = typeof msg.address === 'string' ? msg.address.toLowerCase() : '';

    if (msg.type === 'space:start') {
      if (me !== 'host') return 'Only the host can start the Space.';
      if (!this.sfu) return 'Spaces aren’t switched on for HoodPoker yet.';
      if (this.live) return null;
      this.live = true;
      this.startedAt = Date.now();
      this.hostGoneSince = null;
      this.emptyStageSince = null;
      this.tick ??= setInterval(() => this.checkEndings(), SPACE_LIMITS.tickMs);
      this.table.broadcast();
      return null;
    }

    if (!this.live) return 'The Space isn’t live.';

    switch (msg.type) {
      case 'space:end':
        if (me !== 'host') return 'Only the host can end the Space.';
        void this.end('The host ended the Space.');
        return null;

      case 'space:raise':
        if (me !== 'listener') return null;
        if (!this.canListenNow(from)) return 'Join the Space to raise your hand.';
        this.hands.set(from, Date.now());
        break;

      case 'space:lower':
        this.hands.delete(from);
        break;

      case 'space:invite': {
        if (!isMod) return 'Only the host or a co-host can bring people up.';
        if (!/^0x[0-9a-f]{40}$/.test(target) || !this.table.isConnected(target)) return 'They’re not here any more.';
        if (!this.table.canListen(target)) return 'They’re not on this table’s guest list.';
        if (this.onStage(target)) return null;
        if (this.stageCount() >= SPACE_LIMITS.stage) return `The stage holds ${SPACE_LIMITS.stage} people.`;
        this.speakers.add(target);
        this.hands.delete(target);
        this.selfMuted.add(target); // up on stage muted, like X: they unmute when ready
        break;
      }

      case 'space:remove': {
        // Back to the audience — and their mic is shut off on the SFU.
        const role = this.roleOf(target);
        if (target !== from) {
          if (!isMod) return 'Only the host or a co-host can move people off stage.';
          if (role === 'host') return 'The host can’t be removed.';
          if (role === 'cohost' && me !== 'host') return 'Only the host can remove a co-host.';
        } else if (role === 'host') {
          return 'The host stays on stage — end the Space instead.';
        }
        this.cohosts.delete(target);
        this.speakers.delete(target);
        this.selfMuted.delete(target);
        void this.closeMic(target);
        if (target !== from) this.table.notify(target, 'You were moved to the audience.');
        break;
      }

      case 'space:cohost': {
        if (me !== 'host') return 'Only the host can pick co-hosts.';
        if (target === from) return null;
        if (msg.on === true) {
          if (!this.table.isConnected(target)) return 'They’re not here any more.';
          if (!this.table.canListen(target)) return 'They’re not on this table’s guest list.';
          if (!this.onStage(target) && this.stageCount() >= SPACE_LIMITS.stage) {
            return `The stage holds ${SPACE_LIMITS.stage} people.`;
          }
          this.speakers.delete(target);
          this.cohosts.add(target);
          this.hands.delete(target);
        } else if (this.cohosts.delete(target)) {
          this.speakers.add(target); // demoted to speaker, still on stage
        }
        break;
      }

      case 'space:mute': {
        // Enforced: the speaker's track is closed on the SFU. Unlike a removal
        // they stay on stage and may unmute (re-publish), as on X.
        const role = this.roleOf(target);
        if (!isMod) return 'Only the host or a co-host can mute people.';
        if (role === 'listener' || target === from) return null;
        if (role === 'host' || (role === 'cohost' && me !== 'host')) return 'You can’t mute them.';
        this.selfMuted.add(target);
        void this.closeMic(target);
        this.table.notify(target, 'The host muted you — unmute when you’re ready.');
        break;
      }

      case 'space:hangup':
        // Left the audio but kept the table open: off stage (the host stays
        // host), hand down, SFU session dropped.
        this.cohosts.delete(from);
        this.speakers.delete(from);
        this.selfMuted.delete(from);
        this.disconnect(from);
        break;

      case 'space:selfmute':
        // UI hint only (the mic toggle lives in the browser).
        if (msg.muted === true) this.selfMuted.add(from);
        else this.selfMuted.delete(from);
        break;

      default:
        return 'unknown Space command';
    }
    this.checkEndings();
    this.table.broadcast();
    return null;
  }

  /* ---------------- audio (over HTTP — SDP is too big for a socket frame) ---------------- */

  private canListenNow(address: string) {
    return this.live && this.table.isConnected(address) && this.table.canListen(address);
  }

  private budget(address: string): Audio {
    const a = this.audio.get(address);
    if (!a) throw new SpaceError('Join the Space first.', 409);
    const now = Date.now();
    while (a.ops.length && now - a.ops[0] > SPACE_LIMITS.ops.windowMs) a.ops.shift();
    if (a.ops.length >= SPACE_LIMITS.ops.max) throw new SpaceError('Slow down.', 429);
    a.ops.push(now);
    return a;
  }

  /** One SFU-backed request from the router: connect | publish | pull | renegotiate | close. */
  async audioRequest(address: string, op: string, body: Record<string, unknown>): Promise<unknown> {
    if (!this.sfu) throw new SpaceError('Spaces aren’t switched on for HoodPoker yet.', 503);
    if (!this.live) throw new SpaceError('The Space isn’t live.', 409);
    if (!this.table.isConnected(address)) throw new SpaceError('Open the table first.', 409);
    if (!this.table.canListen(address)) throw new SpaceError('This Space is for the table’s guest list.', 403);

    switch (op) {
      case 'connect': {
        // A reconnect replaces the old session; its tracks die with it.
        const old = this.audio.get(address);
        if (old?.mid) await this.sfu.closeTracks(old.sessionId, [old.mid]).catch(() => {});
        if (!old && !this.onStage(address) && this.listenerCount() >= SPACE_LIMITS.listeners) {
          throw new SpaceError('This Space is full.', 409);
        }
        const sessionId = await this.sfu.newSession();
        this.audio.set(address, { sessionId, ops: old?.ops ?? [] });
        this.table.broadcast();
        return { sessionId };
      }

      case 'publish': {
        const a = this.budget(address);
        if (!this.onStage(address)) throw new SpaceError('Only people on stage can speak.', 403);
        const offer = parseSdp(body.offer, 'offer');
        const mid = typeof body.mid === 'string' && body.mid.length <= 16 ? body.mid : null;
        if (!offer || !mid) throw new SpaceError('bad publish request');
        if (a.mid) await this.sfu.closeTracks(a.sessionId, [a.mid]).catch(() => {});
        a.mid = undefined;
        const result = await this.sfu.addTracks(a.sessionId, {
          sessionDescription: offer,
          tracks: [{ location: 'local', mid, trackName: MIC_TRACK }],
        });
        const failed = result.tracks?.find((t) => t.errorCode);
        if (failed) throw new Error(`sfu publish: ${failed.errorCode} ${failed.errorDescription ?? ''}`.trim());
        // Demoted while the SFU was answering — shut it straight back off.
        if (!this.onStage(address) || this.audio.get(address) !== a) {
          await this.sfu.closeTracks(a.sessionId, [mid]).catch(() => {});
          throw new SpaceError('Only people on stage can speak.', 403);
        }
        a.mid = mid;
        this.selfMuted.delete(address);
        this.table.broadcast();
        return { answer: result.sessionDescription };
      }

      case 'pull': {
        // Only tracks that are live on stage right now — never an arbitrary
        // session id a client made up.
        const a = this.budget(address);
        const live = this.tracks();
        const wanted = (Array.isArray(body.tracks) ? body.tracks : [])
          .map((t) => String((t as { sessionId?: unknown })?.sessionId ?? ''))
          .filter((sid) => sid !== a.sessionId && live.some((t) => t.sessionId === sid));
        if (!wanted.length) return { tracks: [] };
        const result = await this.sfu.addTracks(a.sessionId, {
          tracks: [...new Set(wanted)].map((sessionId) => ({ location: 'remote', sessionId, trackName: MIC_TRACK })),
        });
        // A track that failed (usually: its speaker's connection is still
        // coming up) is reported per track; the browser retries it shortly.
        // The SFU still sends an offer that must be answered either way.
        return {
          offer: result.sessionDescription,
          requiresImmediateRenegotiation: !!result.requiresImmediateRenegotiation,
          tracks: (result.tracks ?? []).map((t) => ({
            mid: t.errorCode ? undefined : t.mid || undefined,
            sessionId: t.sessionId,
            retry: t.errorCode ? true : undefined,
          })),
        };
      }

      case 'renegotiate': {
        const a = this.budget(address);
        const answer = parseSdp(body.answer, 'answer');
        if (!answer) throw new SpaceError('bad renegotiate request');
        await this.sfu.renegotiate(a.sessionId, answer);
        return { ok: true };
      }

      case 'close': {
        // Stop pulling tracks of speakers who left. Own session only.
        const a = this.budget(address);
        const mids = (Array.isArray(body.mids) ? body.mids : [])
          .filter((m): m is string => typeof m === 'string' && m.length <= 16 && m !== a.mid)
          .slice(0, SPACE_LIMITS.stage);
        if (mids.length) await this.sfu.closeTracks(a.sessionId, mids);
        return { ok: true };
      }
    }
    throw new SpaceError('not found', 404);
  }

  /** Close someone's published mic on the SFU (mute, removal, leaving). */
  private async closeMic(address: string) {
    const a = this.audio.get(address);
    if (!a?.mid || !this.sfu) return;
    const mid = a.mid;
    a.mid = undefined;
    this.table.broadcast();
    await this.sfu.closeTracks(a.sessionId, [mid]).catch(() => { /* the session may be gone already */ });
  }

  /** Their table socket closed: drop their audio. Their role survives a refresh. */
  disconnect(address: string) {
    this.hands.delete(address);
    if (!this.audio.has(address)) return;
    void this.closeMic(address);
    this.audio.delete(address);
    this.checkEndings();
    this.table.broadcast();
  }

  /** Live speaker tracks everyone should be pulling. */
  private tracks(): SpaceTrack[] {
    const out: SpaceTrack[] = [];
    for (const [address, a] of this.audio) {
      if (a.mid && this.onStage(address)) out.push({ address, sessionId: a.sessionId, trackName: MIC_TRACK });
    }
    return out;
  }

  /* ---------------- endings ---------------- */

  private checkEndings() {
    if (!this.live) return;
    const now = Date.now();
    const mods = [this.table.hostAddress, ...this.cohosts];
    const modHere = mods.some((a) => this.table.isConnected(a));
    this.hostGoneSince = modHere ? null : (this.hostGoneSince ?? now);

    const stage = [this.table.hostAddress, ...this.cohosts, ...this.speakers];
    const stageHere = stage.some((a) => this.audio.has(a));
    this.emptyStageSince = stageHere ? null : (this.emptyStageSince ?? now);

    if (this.hostGoneSince !== null && now - this.hostGoneSince >= SPACE_LIMITS.hostGoneMs) {
      void this.end('The Space ended — the host left.');
    } else if (this.emptyStageSince !== null && now - this.emptyStageSince >= SPACE_LIMITS.emptyStageMs) {
      void this.end('The Space ended — nobody was on stage.');
    }
  }

  /** End the Space: shut every mic off on the SFU and reset roles. */
  async end(reason: string) {
    if (!this.live) return;
    this.live = false;
    this.startedAt = null;
    if (this.tick) { clearInterval(this.tick); this.tick = null; }
    const mics = [...this.audio.values()].filter((a) => a.mid);
    const everyone = [...this.audio.keys()];
    this.audio.clear();
    this.cohosts.clear();
    this.speakers.clear();
    this.hands.clear();
    this.selfMuted.clear();
    for (const address of everyone) this.table.notify(address, reason);
    this.table.broadcast();
    if (this.sfu) {
      await Promise.all(mics.map((a) => this.sfu!.closeTracks(a.sessionId, [a.mid!]).catch(() => {})));
    }
  }

  /* ---------------- view ---------------- */

  view(forAddress: string | null): SpaceView {
    const member = (address: string): SpaceMember => {
      const id = this.table.identity(address);
      return {
        address,
        handle: id?.handle ?? null,
        avatar: id?.avatar ?? null,
        role: this.roleOf(address),
        inAudio: this.audio.has(address),
        speaking: !!this.audio.get(address)?.mid,
        muted: this.selfMuted.has(address) || !this.audio.get(address)?.mid,
      };
    };
    const stage = [this.table.hostAddress, ...this.cohosts, ...this.speakers]
      .filter((a) => this.table.isConnected(a))
      .map(member);
    const hands = [...this.hands.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([address]) => address)
      .filter((a) => this.table.isConnected(a))
      .map(member);
    return {
      enabled: !!this.sfu,
      live: this.live,
      startedAt: this.startedAt,
      host: this.table.hostAddress,
      you: forAddress ? this.roleOf(forAddress) : null,
      youInAudio: forAddress ? this.audio.has(forAddress) : false,
      handRaised: forAddress ? this.hands.has(forAddress) : false,
      canJoin: forAddress ? this.table.canListen(forAddress) : false,
      stage,
      hands,
      listeners: this.listenerCount(),
      tracks: this.live ? this.tracks() : [],
    };
  }
}

function parseSdp(raw: unknown, type: Sdp['type']): Sdp | null {
  const s = raw as Partial<Sdp> | null;
  if (!s || s.type !== type || typeof s.sdp !== 'string' || s.sdp.length > 20_000) return null;
  return { type, sdp: s.sdp };
}
