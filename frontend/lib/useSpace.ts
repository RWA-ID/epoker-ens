'use client';
/**
 * useSpace — the table's voice Space, from the browser's side.
 *
 * Roles come from the table socket (`state.space`); audio is a SpaceAudio
 * connection (lib/space-audio.ts) that exists only between "Join" and "Leave".
 * The server is the authority on who may speak: when it says our mic is off
 * (a host mute, a removal, the Space ending) we let the mic go here too.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type ApiAuth, type SpaceOp } from './api';
import { SpaceAudio } from './space-audio';
import type { ClientMessage, SpaceView } from './types';

type SpaceCmd = Extract<ClientMessage, { type: `space:${string}` }>;

export type SpaceStatus = 'off' | 'joining' | 'on';

export function useSpace(
  tableId: string,
  auth: ApiAuth | undefined,
  view: SpaceView | undefined,
  send: (msg: SpaceCmd) => void,
) {
  const [status, setStatus] = useState<SpaceStatus>('off');
  const [muted, setMuted] = useState(true);
  const [micBusy, setMicBusy] = useState(false);
  const [talking, setTalking] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const audio = useRef<SpaceAudio | null>(null);
  /** The server has listed us in audio at least once since we joined. */
  const seen = useRef(false);

  const leave = useCallback(() => {
    audio.current?.close();
    audio.current = null;
    seen.current = false;
    setStatus('off');
    setMuted(true);
  }, []);

  const join = useCallback(async () => {
    if (!auth || audio.current) return;
    setError(null);
    setStatus('joining');
    const request = <T,>(op: SpaceOp, body?: unknown) => api.space<T>(auth, tableId, op, body);
    const a = new SpaceAudio(request, auth.address, setTalking, () => {
      leave();
      setError('Lost the audio connection — tap Listen to rejoin.');
    });
    audio.current = a;
    try {
      await a.connect();
      setStatus('on');
    } catch (err) {
      leave();
      setError(err instanceof Error ? err.message : 'Couldn’t join the Space.');
    }
  }, [auth, tableId, leave]);

  // Pull whoever is live on stage.
  const tracks = view?.tracks;
  useEffect(() => {
    if (status === 'on' && tracks) audio.current?.sync(tracks);
  }, [status, tracks]);

  // The server dropped us (Space ended, socket replaced): tear down.
  const inAudio = !!view?.youInAudio;
  const live = !!view?.live;
  useEffect(() => {
    if (status !== 'on') return;
    if (inAudio) seen.current = true;
    if (!live || (seen.current && !inAudio)) leave();
  }, [status, inAudio, live, leave]);

  // Our mic was shut off server-side (host mute or moved off stage).
  const me = view?.stage.find((m) => m.address === auth?.address);
  const serverSpeaking = !!me?.speaking;
  useEffect(() => {
    const a = audio.current;
    if (!a || micBusy) return;
    if (!serverSpeaking && a.publishing) {
      a.stopMic();
      setMuted(true);
    }
  }, [serverSpeaking, micBusy]);

  const toggleMic = useCallback(async () => {
    const a = audio.current;
    if (!a) return;
    a.resume();
    if (!muted) {
      a.setMuted(true);
      setMuted(true);
      send({ type: 'space:selfmute', muted: true });
      return;
    }
    if (a.publishing && serverSpeaking) {
      a.setMuted(false);
      setMuted(false);
      send({ type: 'space:selfmute', muted: false });
      return;
    }
    setMicBusy(true);
    setError(null);
    try {
      await a.publish();
      a.setMuted(false);
      setMuted(false);
    } catch (err) {
      a.stopMic();
      const denied = err instanceof DOMException && err.name === 'NotAllowedError';
      setError(denied ? 'Allow the microphone in your browser to speak.' : err instanceof Error ? err.message : 'Couldn’t turn the mic on.');
    } finally {
      setMicBusy(false);
    }
  }, [muted, serverSpeaking, send]);

  useEffect(() => () => audio.current?.close(), []);

  return {
    status,
    muted,
    micBusy,
    talking,
    error,
    clearError: () => setError(null),
    join,
    leave: () => {
      // Tell the worker too: off stage, SFU session dropped.
      send({ type: 'space:hangup' });
      leave();
    },
    toggleMic,
    resume: () => audio.current?.resume(),
  };
}

export type SpaceControls = ReturnType<typeof useSpace>;
