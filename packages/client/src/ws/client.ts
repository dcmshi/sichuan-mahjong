import type { ClientMsg, ServerMsg } from '@sichuan-mahjong/engine';

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

  constructor(
    private readonly url: string,
    private readonly cbs: Callbacks,
  ) {
    this.connect();
  }

  send(msg: ClientMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
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

// Module-level singleton so any component can send actions without prop drilling
let _client: WsClient | null = null;

export function setWsClient(c: WsClient | null): void { _client = c; }
export function getWsClient(): WsClient | null { return _client; }

export function sendAction(msg: ClientMsg): void {
  _client?.send(msg);
}
