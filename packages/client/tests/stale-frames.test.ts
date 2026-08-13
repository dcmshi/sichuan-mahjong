import type { ServerMsg } from '@sichuan-mahjong/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '../src/store/index.js';
import { WsClient, setWsClient } from '../src/ws/client.js';

/**
 * Frames that arrive after the client has stopped listening. (A70)
 *
 * The server here is ours, so a *hostile* one is not the threat — it controls
 * everything anyway. What is real is a frame already in flight when the player
 * walks out: `closeConnection()` calls `WsClient.close()`, which sets `closed`,
 * calls `ws.close()` and drops its reference — but **leaves `onmessage`
 * attached to the socket it just abandoned.** A close is a handshake, not an
 * instant, and anything the server had already sent still lands.
 *
 * `onclose` guards on `closed`; `onmessage` did not, which is the asymmetry.
 */

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
  open(): void {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }
  /** A frame the server had already put on the wire. */
  deliver(msg: ServerMsg): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

const viewMsg = (): ServerMsg =>
  ({
    t: 'view',
    view: { you: { seat: 0, hand: [] }, others: [], phase: 'play' },
    events: [],
    botPace: { speed: 'normal', pinned: false },
  }) as unknown as ServerMsg;

beforeEach(() => {
  sockets = [];
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', FakeSocket);
  useStore.setState({ screen: 'landing', view: null, code: '', token: '' });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setWsClient(null);
});

describe('a frame that lands after the client has left (A70)', () => {
  it('is ignored once the client is closed', () => {
    const store = useStore.getState();
    const client = new WsClient('ws://host/ws/ABCD', {
      onMessage: m => store.handleServerMsg(m),
      onConnect: () => {},
      onDisconnect: () => {},
      onGiveUp: () => {},
    });
    const socket = sockets[0]!;
    socket.open();

    // Live: the view lands and the game screen opens, as it should.
    socket.deliver(viewMsg());
    expect(useStore.getState().screen).toBe('game');

    // The player leaves. The socket is closing, not closed.
    useStore.setState({ screen: 'landing', view: null });
    client.close();

    // …and the frame the server had already sent arrives.
    socket.deliver(viewMsg());
    expect(
      useStore.getState().screen,
      'a stale view dragged the player back into the game they left',
    ).toBe('landing');
  });

  it('is ignored for every message kind, not just view', () => {
    const store = useStore.getState();
    const client = new WsClient('ws://host/ws/EFGH', {
      onMessage: m => store.handleServerMsg(m),
      onConnect: () => {},
      onDisconnect: () => {},
      onGiveUp: () => {},
    });
    const socket = sockets[0]!;
    socket.open();
    client.close();

    socket.deliver({ t: 'error', code: 'late', message: 'late' } as ServerMsg);
    socket.deliver({ t: 'joined', seat: 2, token: 'zzz' } as ServerMsg);

    const s = useStore.getState();
    expect(s.lastError, 'a stale error raised a toast on the landing screen').toBeNull();
    expect(s.token, 'a stale joined re-seated a player who had left').toBe('');
  });

  it('still delivers everything while the client is open', () => {
    // The guard must be "closed", not "closing" — a live socket that happens to
    // be mid-reconnect still has frames worth having.
    const seen: ServerMsg[] = [];
    new WsClient('ws://host/ws/IJKL', {
      onMessage: m => seen.push(m),
      onConnect: () => {},
      onDisconnect: () => {},
      onGiveUp: () => {},
    });
    const socket = sockets[0]!;
    socket.open();
    socket.deliver({ t: 'matchEnd' } as ServerMsg);
    socket.deliver({ t: 'error', code: 'x', message: 'y' } as ServerMsg);
    expect(seen).toHaveLength(2);
  });
});
