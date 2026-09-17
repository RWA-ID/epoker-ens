'use client';
/**
 * useTableSocket — WebSocket connection to one table's Durable Object.
 *
 * Handles: auth handshake params, auto-reconnect with backoff, sound
 * effects derived from state transitions, chat log, and typed send
 * helpers for every player intent.
 *
 * Phones are the hard case. Switching to a wallet app (or any app) suspends
 * the page and the OS kills its socket — sometimes without a close event, so
 * the page comes back holding a socket that reads OPEN but is dead. So on
 * returning to the foreground we reconnect at once instead of waiting out a
 * backoff, and a heartbeat catches the zombie. The server holds a dropped
 * player's seat for a grace window; if they were gone longer than that, we
 * sit them back down.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { WORKER_WS_URL } from './config';
import { sfx } from './sounds';
import type {
  ActionType, ChatMessage, ClientMessage, HandLogEntry, HandResultShare, ServerMessage, TableView,
} from './types';

export interface HandResult {
  winners: HandResultShare[];
  board: string[];
  ts: number;
}

interface Identity {
  address: string;
  /** Session token from lib/auth.ts. */
  token: string;
  /** Claimed name — the server verifies it and reads the avatar itself. */
  handle: string | null;
}

export function useTableSocket(tableId: string | null, identity: Identity | null) {
  const [state, setState] = useState<TableView | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [log, setLog] = useState<HandLogEntry[]>([]);
  const [lastResult, setLastResult] = useState<HandResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const prevState = useRef<TableView | null>(null);
  const retries = useRef(0);
  const closedByUs = useRef(false);
  /** Seat we hold (or last held) — cleared by an explicit Leave. */
  const wantSeat = useRef<number | null>(null);

  /** Diff old vs. new state to trigger the right sound effect. */
  const playTransitionSounds = useCallback((next: TableView) => {
    const prev = prevState.current;
    prevState.current = next;
    if (!prev) return;
    if (next.community.length > prev.community.length) sfx.deal();
    if (next.handNumber > prev.handNumber && next.holeCards.length === 2) sfx.deal();
    const wasActing = prev.yourSeat !== null && prev.seats.find((s) => s.seat === prev.yourSeat)?.acting;
    const isActing = next.yourSeat !== null && next.seats.find((s) => s.seat === next.yourSeat)?.acting;
    if (isActing && !wasActing) sfx.yourTurn();
    if (next.pot > prev.pot && next.handNumber === prev.handNumber) sfx.chips();
  }, []);

  useEffect(() => {
    if (!tableId || !identity) return;
    closedByUs.current = false;

    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let pongTimer: ReturnType<typeof setTimeout> | undefined;
    /** First state after a REconnect may need the seat taken back. */
    let reseatCheck = false;
    let everOpened = false;

    // Survives a reload, but only briefly: coming back to a table hours later
    // shouldn't buy you straight back in.
    const seatKey = `epoker:seat:${tableId}:${identity.address}`;
    try {
      const [seat, ts] = (sessionStorage.getItem(seatKey) ?? '').split(':').map(Number);
      if (Number.isInteger(seat) && Date.now() - ts < 10 * 60_000) wantSeat.current = seat;
    } catch { /* storage blocked */ }

    /** Drop the current socket without triggering its own reconnect. */
    const discard = () => {
      if (!ws) return;
      ws.onopen = ws.onmessage = ws.onclose = null;
      try { ws.close(); } catch { /* already dead */ }
      clearTimeout(pongTimer);
    };

    const connect = () => {
      const params = new URLSearchParams({
        token: identity.token,
        name: identity.handle ?? '',
      });
      ws = new WebSocket(`${WORKER_WS_URL}/table/${tableId}/ws?${params}`);
      wsRef.current = ws;

      ws.onopen = () => {
        // Replayed history follows; don't double it up after a reconnect.
        setChat([]);
        setLog([]);
        retries.current = 0;
        setConnected(true);
        setError(null);
        // A page reload counts too: sessionStorage remembers the seat.
        reseatCheck = everOpened || wantSeat.current !== null;
        everOpened = true;
      };

      ws.onmessage = (evt) => {
        const msg = JSON.parse(evt.data) as ServerMessage;
        switch (msg.type) {
          case 'state': {
            const st = msg.state;
            if (st.yourSeat !== null) {
              wantSeat.current = st.yourSeat;
              try { sessionStorage.setItem(seatKey, `${st.yourSeat}:${Date.now()}`); } catch { /* noop */ }
            } else if (reseatCheck && wantSeat.current !== null && st.canSit) {
              // Away longer than the server's grace window: take a seat again,
              // the same one if it's still free.
              const taken = new Set(st.seats.map((s) => s.seat));
              const seat = !taken.has(wantSeat.current)
                ? wantSeat.current
                : Array.from({ length: st.maxPlayers }, (_, i) => i).find((i) => !taken.has(i));
              if (seat !== undefined) ws.send(JSON.stringify({ type: 'sit', seat }));
            }
            reseatCheck = false;
            playTransitionSounds(st);
            setState(st);
            break;
          }
          case 'pong':
            clearTimeout(pongTimer);
            break;
          case 'chat':
            setChat((c) => [...c.slice(-99), msg.message]);
            break;
          case 'log':
            setLog((l) => [...l.slice(-79), msg.entry]);
            break;
          case 'handResult': {
            setLastResult({ winners: msg.winners, board: msg.board, ts: Date.now() });
            sfx.win();
            break;
          }
          case 'error':
            setError(msg.error);
            break;
        }
      };

      ws.onclose = (evt) => {
        setConnected(false);
        wsRef.current = null;
        // 4000 = replaced by a newer tab; don't fight over the seat.
        clearTimeout(pongTimer);
        if (closedByUs.current || evt.code === 4000) return;
        const delay = Math.min(1000 * 2 ** retries.current, 10_000);
        retries.current++;
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    /** Ping; a socket that doesn't answer in time is replaced. */
    const probe = () => {
      if (ws?.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: 'ping' }));
      clearTimeout(pongTimer);
      pongTimer = setTimeout(() => {
        discard();
        setConnected(false);
        connect();
      }, 5000);
    };

    const onVisible = () => {
      if (document.visibilityState !== 'visible' || closedByUs.current) return;
      if (ws?.readyState === WebSocket.OPEN) return probe();
      // Closed or stuck connecting after a suspend: go now, not after backoff.
      clearTimeout(reconnectTimer);
      retries.current = 0;
      discard();
      connect();
    };

    // The server replays recent chat and log lines on every (re)connect.
    setChat([]);
    setLog([]);
    connect();
    const heartbeat = setInterval(probe, 25_000);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      closedByUs.current = true;
      clearTimeout(reconnectTimer);
      clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onVisible);
      window.removeEventListener('online', onVisible);
      discard();
    };
  }, [tableId, identity?.address, identity?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendMsg = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  return {
    state,
    chat,
    log,
    lastResult,
    error,
    connected,
    clearError: () => setError(null),
    sit: (seat: number) => sendMsg({ type: 'sit', seat }),
    leave: () => {
      wantSeat.current = null;
      try {
        if (tableId && identity) sessionStorage.removeItem(`epoker:seat:${tableId}:${identity.address}`);
      } catch { /* noop */ }
      sendMsg({ type: 'leave' });
    },
    act: (action: ActionType, amount?: number) => sendMsg({ type: 'action', action, amount }),
    say: (text: string) => sendMsg({ type: 'chat', text }),
  };
}
