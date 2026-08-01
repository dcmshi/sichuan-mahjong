import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WsClient } from '../src/ws/client.js';

/** Every constructed socket, newest last — the client makes a fresh one per retry. */
let sockets: FakeSocket[] = [];

class FakeSocket {
  static readonly OPEN = 1;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  readonly sent: string[] = [];

  constructor(readonly url: string) {
    sockets.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
  }

  /** Simulate the server accepting the connection. */
  open(): void {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }

  /** Simulate the connection dropping (or never establishing). */
  drop(): void {
    this.readyState = 3;
    this.onclose?.();
  }
}

function callbacks() {
  return {
    onMessage: vi.fn(),
    onConnect: vi.fn(),
    onDisconnect: vi.fn(),
    onGiveUp: vi.fn(),
  };
}

beforeEach(() => {
  sockets = [];
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', FakeSocket);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('WsClient reconnect (F6)', () => {
  it('stops retrying and reports giving up instead of looping forever', () => {
    const cbs = callbacks();
    new WsClient('ws://host/ws/ABCD', cbs);

    // Fail every attempt, the way an expired token does.
    for (let i = 0; i < 40 && !cbs.onGiveUp.mock.calls.length; i++) {
      sockets[sockets.length - 1]!.drop();
      vi.advanceTimersByTime(10_000);
    }

    expect(cbs.onGiveUp).toHaveBeenCalledTimes(1);

    // No further sockets are opened once it has given up.
    const settled = sockets.length;
    vi.advanceTimersByTime(120_000);
    expect(sockets.length).toBe(settled);
  });

  it('F21: queues the join handshake but drops actions sent while disconnected', () => {
    const client = new WsClient('ws://host/ws/ABCD', callbacks());
    const first = sockets[0]!;

    // Both are sent before the socket opens, exactly as a screen would.
    client.send({ t: 'join', name: 'Dave' });
    client.send({ t: 'action', action: { t: 'discard', seat: 0, tile: 4 } });

    first.open();
    expect(first.sent).toEqual([JSON.stringify({ t: 'join', name: 'Dave' })]);
  });

  it('F21: nothing is replayed after a drop and reconnect', () => {
    const client = new WsClient('ws://host/ws/ABCD', callbacks());
    sockets[0]!.open();
    sockets[0]!.drop();

    client.send({ t: 'action', action: { t: 'discard', seat: 0, tile: 4 } });
    client.send({ t: 'startGame' });

    vi.advanceTimersByTime(1000);
    const reconnected = sockets[sockets.length - 1]!;
    reconnected.open();
    expect(reconnected.sent).toEqual([]);
  });

  it('a successful connect resets the retry budget', () => {
    const cbs = callbacks();
    new WsClient('ws://host/ws/ABCD', cbs);

    for (let i = 0; i < 5; i++) {
      sockets[sockets.length - 1]!.drop();
      vi.advanceTimersByTime(10_000);
    }
    sockets[sockets.length - 1]!.open();
    expect(cbs.onConnect).toHaveBeenCalled();

    // Five more failures must not trip the cap now the counter is back to 0.
    for (let i = 0; i < 5; i++) {
      sockets[sockets.length - 1]!.drop();
      vi.advanceTimersByTime(10_000);
    }
    expect(cbs.onGiveUp).not.toHaveBeenCalled();
  });
});
