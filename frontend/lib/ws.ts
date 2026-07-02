'use client';
/**
 * useTableSocket — WebSocket connection to one table's Durable Object.
 *
 * Handles: auth handshake params, auto-reconnect with backoff, sound
 * effects derived from state transitions, chat log, and typed send
 * helpers for every player intent.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { WORKER_WS_URL } from './config';
import { sfx } from './sounds';
import type {
  ActionType, ChatMessage, ClientMessage, HandResultShare, ServerMessage, TableView,
} from './types';

export interface HandResult {
  winners: HandResultShare[];
  board: string[];
  ts: number;
}

interface Identity {
  address: string;
  sig: string;
  ensName: string | null;
  avatar: string | null;
}

export function useTableSocket(tableId: string | null, identity: Identity | null) {
  const [state, setState] = useState<TableView | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [lastResult, setLastResult] = useState<HandResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const prevState = useRef<TableView | null>(null);
  const retries = useRef(0);
  const closedByUs = useRef(false);

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

    const connect = () => {
      const params = new URLSearchParams({
        address: identity.address,
        sig: identity.sig,
        name: identity.ensName ?? '',
        avatar: identity.avatar ?? '',
      });
      ws = new WebSocket(`${WORKER_WS_URL}/table/${tableId}/ws?${params}`);
      wsRef.current = ws;

      ws.onopen = () => {
        retries.current = 0;
        setConnected(true);
        setError(null);
      };

      ws.onmessage = (evt) => {
        const msg = JSON.parse(evt.data) as ServerMessage;
        switch (msg.type) {
          case 'state':
            playTransitionSounds(msg.state);
            setState(msg.state);
            break;
          case 'chat':
            setChat((c) => [...c.slice(-99), msg.message]);
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
        if (closedByUs.current || evt.code === 4000) return;
        const delay = Math.min(1000 * 2 ** retries.current, 10_000);
        retries.current++;
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      closedByUs.current = true;
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [tableId, identity?.address, identity?.sig]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendMsg = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  return {
    state,
    chat,
    lastResult,
    error,
    connected,
    clearError: () => setError(null),
    sit: (seat: number) => sendMsg({ type: 'sit', seat }),
    leave: () => sendMsg({ type: 'leave' }),
    act: (action: ActionType, amount?: number) => sendMsg({ type: 'action', action, amount }),
    say: (text: string) => sendMsg({ type: 'chat', text }),
  };
}
