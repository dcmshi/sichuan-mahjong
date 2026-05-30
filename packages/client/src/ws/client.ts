import type { ClientMsg, ServerMsg } from '@sichuan-mahjong/engine';
import { useStore } from '../store/index.js';

const BACKOFF_MS = [500, 1000, 2000, 4000, 10_000];

type Callbacks = {
  onMessage: (msg: ServerMsg) => void;
  onConnect: () => void;
  onDisconnect: () => void;
};

export class WsClient {
  private ws: WebSocket | null = null;
  private retries = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private queue: string[] = [];

  constructor(
    private url: string,
    private readonly cbs: Callbacks,
  ) {
    this.connect();
  }

  /** Update the URL used for future reconnects (e.g. once a seat token is issued)
   *  without dropping the live socket. Avoids a connect→close→reconnect cycle. */
  setReconnectUrl(url: string): void {
    this.url = url;
  }

  send(msg: ClientMsg): void {
    const data = JSON.stringify(msg);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    } else {
      this.queue.push(data);
    }
  }

  close(): void {
    this.closed = true;
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
    this.ws?.close();
    this.ws = null;
  }

  private connect(): void {
    if (this.closed) return;
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      this.retries = 0;
      this.cbs.onConnect();
      for (const data of this.queue) ws.send(data);
      this.queue = [];
    };

    ws.onmessage = (e: MessageEvent<string>) => {
      try { this.cbs.onMessage(JSON.parse(e.data) as ServerMsg); }
      catch { /* ignore malformed */ }
    };

    ws.onclose = () => {
      if (this.closed) return;
      this.cbs.onDisconnect();
      const delay = BACKOFF_MS[Math.min(this.retries, BACKOFF_MS.length - 1)] ?? 10_000;
      this.retries++;
      this.timer = setTimeout(() => this.connect(), delay);
    };
  }
}

export function makeWsUrl(code: string, token: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws/${code}?token=${encodeURIComponent(token)}`;
}

export function makeSpectateUrl(code: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws/${code}?spectate=1`;
}

// Module-level singleton so any component can send actions without prop drilling
let _client: WsClient | null = null;

export function setWsClient(c: WsClient | null): void { _client = c; }
export function getWsClient(): WsClient | null { return _client; }

export function sendAction(msg: ClientMsg): void {
  _client?.send(msg);
}

/**
 * Open a game/lobby connection wired to the standard store callbacks
 * (handleServerMsg / setConnected / setReconnecting) and register it as the
 * active client. `onMessage` receives each message plus the client, for
 * screen-specific handling. Replaces the duplicated WsClient setup in screens.
 */
export function connectGame(
  url: string,
  onMessage?: (msg: ServerMsg, client: WsClient) => void,
): WsClient {
  const store = useStore.getState();
  const client: WsClient = new WsClient(url, {
    onMessage: (msg) => {
      store.handleServerMsg(msg);
      onMessage?.(msg, client);
    },
    onConnect: () => store.setConnected(true),
    onDisconnect: () => store.setReconnecting(true),
  });
  setWsClient(client);
  return client;
}
