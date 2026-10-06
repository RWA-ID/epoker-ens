'use client';
/**
 * Space audio — one WebRTC connection per person to Cloudflare's Realtime SFU.
 *
 * Speakers send one mic track; everyone receives the speakers' tracks. Every
 * SFU call goes through the worker (lib/api.ts `space`), which holds the app
 * secret and decides who may speak — this file never sees a credential.
 *
 * Negotiation, per Cloudflare's connection recipes:
 *  - receiving: the worker asks the SFU for the tracks, the SFU makes the offer,
 *    we answer and the worker passes our answer back (`renegotiate`). This is
 *    also how a listener's connection comes up in the first place.
 *  - sending: we make the offer with the mic, the SFU answers.
 * The SFU wants complete SDP (no trickle ICE), so every description waits for
 * candidate gathering. Mutations on one session must not overlap, so they run
 * through a single queue.
 *
 * The "who's talking" glow is measured here, in each browser, from the audio
 * itself — nothing about it crosses the network.
 */
import type { SpaceTrack } from './types';
import type { SpaceOp } from './api';

type Request = <T>(op: SpaceOp, body?: unknown) => Promise<T>;
type Sdp = { type: 'offer' | 'answer'; sdp: string };

const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }];
/** Level (0–1 RMS) above which someone counts as talking. */
const TALK_LEVEL = 0.04;

interface Pulled {
  address: string;
  sessionId: string;
  mid: string;
  el?: HTMLAudioElement;
  analyser?: AnalyserNode;
}

export class SpaceAudio {
  private pc: RTCPeerConnection;
  private sessionId: string | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private ctx: AudioContext;
  private mic: MediaStreamTrack | null = null;
  private micTransceiver: RTCRtpTransceiver | null = null;
  private micAnalyser: AnalyserNode | null = null;
  /** Pulled speaker tracks, by the speaker's SFU session id. */
  private pulled = new Map<string, Pulled>();
  /** Tracks that arrived before their pull response named the mid. */
  private early = new Map<string, MediaStreamTrack>();
  private meter: ReturnType<typeof setInterval> | null = null;
  private closed = false;

  constructor(
    private request: Request,
    private me: string,
    /** Addresses talking right now — drives the glow. */
    private onTalking: (talking: Set<string>) => void,
    /** The connection dropped for good; the caller should leave or rejoin. */
    private onFailed: () => void,
  ) {
    // Created inside the "Join" click, so the browser lets it play.
    this.ctx = new AudioContext();
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS, bundlePolicy: 'max-bundle' });
    this.pc.ontrack = (e) => this.onTrack(e);
    this.pc.onconnectionstatechange = () => {
      if (this.pc.connectionState === 'failed' && !this.closed) this.onFailed();
    };
  }

  /** Get an SFU session. Called once, from the Join click. */
  async connect() {
    void this.ctx.resume();
    const { sessionId } = await this.request<{ sessionId: string }>('connect');
    this.sessionId = sessionId;
    this.meter = setInterval(() => this.measure(), 150);
  }

  private run<T>(job: () => Promise<T>): Promise<T> {
    const next = this.queue.then(job, job);
    this.queue = next.catch(() => {});
    return next;
  }

  /** Our local description, once ICE gathering is done (or 2.5s, whichever first). */
  private async gathered(): Promise<Sdp> {
    if (this.pc.iceGatheringState !== 'complete') {
      await new Promise<void>((resolve) => {
        const done = () => {
          if (this.pc.iceGatheringState !== 'complete') return;
          this.pc.removeEventListener('icegatheringstatechange', done);
          resolve();
        };
        this.pc.addEventListener('icegatheringstatechange', done);
        setTimeout(resolve, 2500);
      });
    }
    const d = this.pc.localDescription!;
    return { type: d.type as Sdp['type'], sdp: d.sdp };
  }

  /* ---------------- receiving ---------------- */

  /** Match what we pull to the stage's live tracks. Safe to call on every state. */
  sync(tracks: SpaceTrack[]) {
    if (this.closed) return;
    const want = new Map(tracks.filter((t) => t.address !== this.me).map((t) => [t.sessionId, t]));
    const add = [...want.values()].filter((t) => !this.pulled.has(t.sessionId));
    const gone = [...this.pulled.values()].filter((p) => !want.has(p.sessionId));
    if (!add.length && !gone.length) return;

    // Claim them now so a second state broadcast mid-request doesn't re-pull.
    for (const t of add) this.pulled.set(t.sessionId, { address: t.address, sessionId: t.sessionId, mid: '' });
    for (const p of gone) this.dropPulled(p);

    void this.run(async () => {
      if (gone.length) {
        const mids = gone.map((p) => p.mid).filter(Boolean);
        if (mids.length) await this.request('close', { mids }).catch(() => {});
      }
      if (!add.length) return;
      const res = await this.request<{
        offer?: Sdp;
        requiresImmediateRenegotiation?: boolean;
        tracks: { mid?: string; sessionId?: string }[];
      }>('pull', { tracks: add.map((t) => ({ sessionId: t.sessionId })) }).catch(() => null);

      if (!res?.tracks?.length) {
        for (const t of add) this.pulled.delete(t.sessionId); // retried on the next state
        return;
      }
      for (const t of res.tracks) {
        const p = t.sessionId ? this.pulled.get(t.sessionId) : undefined;
        if (p && t.mid) p.mid = t.mid;
      }
      if (res.offer) {
        await this.pc.setRemoteDescription(res.offer);
        await this.pc.setLocalDescription(await this.pc.createAnswer());
        if (res.requiresImmediateRenegotiation) {
          await this.request('renegotiate', { answer: await this.gathered() });
        }
      }
      // ontrack can fire before we knew which mid was whose.
      for (const p of this.pulled.values()) {
        const early = p.mid ? this.early.get(p.mid) : undefined;
        if (early) { this.early.delete(p.mid); this.play(p, early); }
      }
    });
  }

  private onTrack(e: RTCTrackEvent) {
    const mid = e.transceiver.mid;
    if (!mid) return;
    const p = [...this.pulled.values()].find((x) => x.mid === mid);
    if (p) this.play(p, e.track);
    else this.early.set(mid, e.track);
  }

  private play(p: Pulled, track: MediaStreamTrack) {
    const stream = new MediaStream([track]);
    p.el?.pause();
    const el = new Audio();
    el.autoplay = true;
    el.srcObject = stream;
    void el.play().catch(() => { /* resumes on the next tap — see resume() */ });
    p.el = el;
    // Measured only; not connected to the speakers (the <audio> plays it).
    // Chrome needs the stream on a media element as well for this to get data.
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 512;
    this.ctx.createMediaStreamSource(stream).connect(analyser);
    p.analyser = analyser;
  }

  private dropPulled(p: Pulled) {
    if (p.el) { p.el.pause(); p.el.srcObject = null; }
    this.pulled.delete(p.sessionId);
  }

  /** iOS may block playback until a tap; call from any click in the Space. */
  resume() {
    void this.ctx.resume();
    for (const p of this.pulled.values()) void p.el?.play().catch(() => {});
  }

  /* ---------------- sending ---------------- */

  get publishing() { return !!this.mic && this.mic.readyState === 'live'; }

  /** Turn the mic on: asks permission the first time, then publishes via the worker. */
  publish() {
    return this.run(async () => {
      if (this.closed) return;
      if (this.mic?.readyState === 'live' && this.micTransceiver?.currentDirection === 'sendonly') {
        this.mic.enabled = true;
        return;
      }
      this.stopMic();
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const mic = media.getAudioTracks()[0];
      this.mic = mic;
      this.micTransceiver = this.pc.addTransceiver(mic, { direction: 'sendonly' });
      await this.pc.setLocalDescription(await this.pc.createOffer());
      const offer = await this.gathered();
      const mid = this.micTransceiver.mid;
      if (!mid) throw new Error('no mid for the mic');
      const { answer } = await this.request<{ answer: Sdp }>('publish', { offer, mid });
      await this.pc.setRemoteDescription(answer);

      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = 512;
      this.ctx.createMediaStreamSource(new MediaStream([mic])).connect(analyser);
      this.micAnalyser = analyser;
    });
  }

  /** Self-mute: the track keeps running but sends silence (almost no data). */
  setMuted(muted: boolean) {
    if (this.mic) this.mic.enabled = !muted;
  }

  /** The worker closed our track (host mute or removal): let the mic go. */
  stopMic() {
    if (this.mic) this.mic.stop();
    if (this.micTransceiver) {
      try { this.micTransceiver.stop(); } catch { /* already stopped */ }
    }
    this.mic = null;
    this.micTransceiver = null;
    this.micAnalyser = null;
  }

  /* ---------------- glow ---------------- */

  private buf = new Float32Array(512);
  private level(a: AnalyserNode) {
    a.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (const v of this.buf) sum += v * v;
    return Math.sqrt(sum / this.buf.length);
  }

  private measure() {
    const talking = new Set<string>();
    if (this.micAnalyser && this.mic?.enabled && this.level(this.micAnalyser) > TALK_LEVEL) talking.add(this.me);
    for (const p of this.pulled.values()) {
      if (p.analyser && this.level(p.analyser) > TALK_LEVEL) talking.add(p.address);
    }
    this.onTalking(talking);
  }

  /* ---------------- teardown ---------------- */

  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.meter) clearInterval(this.meter);
    this.stopMic();
    for (const p of [...this.pulled.values()]) this.dropPulled(p);
    this.pc.close();
    void this.ctx.close().catch(() => {});
    this.onTalking(new Set());
  }
}
