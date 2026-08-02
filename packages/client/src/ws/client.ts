import type { ClientMsg, ServerMsg } from '@sichuan-mahjong/engine';
import { useStore } from '../store/index.js';

const BACKOFF_MS = [500, 1000, 2000, 4000, 10_000];
/**
 * Stop after this many consecutive failed reconnects (~47s of backoff). An
 * expired or invalid token fails the same way every time, and retrying it
 * forever left the UI on "Reconnecting…" with no way out. (F6)
 */
const MAX_RETRIES = 8;

type Callbacks = {
  onMessage: (msg: ServerMsg) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onGiveUp: () => void;
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
      return;
    }
    // Only `join` survives a closed socket: screens send it synchronously right
    // after constructing the client, before the socket has opened. Everything
    // else is a user action taken while visibly disconnected, and flushing the
    // queue verbatim on reconnect delivered stale discards and lobby commands a
    // round late. Dropping them is the honest outcome. (F21)
    if (msg.t === 'join') this.queue.push(data);
  }

  close(): void {
    this.closed = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
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
      try {
        this.cbs.onMessage(JSON.parse(e.data) as ServerMsg);
      } catch {
        /* ignore malformed */
      }
    };

    ws.onclose = () => {
      if (this.closed) return;
      this.cbs.onDisconnect();
      if (this.retries >= MAX_RETRIES) {
        this.closed = true;
        this.ws = null;
        this.cbs.onGiveUp();
        return;
      }
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

export function makeSpectateUrl(code: string, watch: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws/${code}?spectate=1&watch=${encodeURIComponent(watch)}`;
}

/**
 * How a watch grant is written down: `CODE.token`. One string to copy, and
 * distinct from the play code, so reading the play code aloud no longer hands
 * out a viewing seat as well. (C5)
 */
export function makeWatchRef(code: string, watch: string): string {
  return `${code}.${watch}`;
}

/** The link the host shares. Origin-relative, like everything else the app builds. */
export function makeWatchLink(code: string, watch: string): string {
  return `${window.location.origin}/?watch=${encodeURIComponent(makeWatchRef(code, watch))}`;
}

/**
 * Read a watch grant back out of whatever the user pasted — the whole link, the
 * `?watch=` value, or the bare `CODE.token`. Pure, so it is testable without a
 * DOM: the client suite has no jsdom.
 */
export function parseWatchRef(input: string): { code: string; watch: string } | null {
  let raw = input.trim();
  if (!raw) return null;

  // A pasted link: pull the query parameter out and keep going with its value.
  const query = raw.indexOf('watch=');
  if (query !== -1) raw = decodeURIComponent(raw.slice(query + 'watch='.length).split('&')[0]!);

  const dot = raw.indexOf('.');
  if (dot === -1) return null;

  const code = raw.slice(0, dot).trim().toUpperCase();
  const watch = raw.slice(dot + 1).trim();
  if (code.length !== 4 || !watch) return null;
  return { code, watch };
}

// Module-level singleton so any component can send actions without prop drilling
let _client: WsClient | null = null;

export function setWsClient(c: WsClient | null): void {
  _client = c;
}
export function getWsClient(): WsClient | null {
  return _client;
}

/** Close and drop the active client, if any. Safe to call when none exists. */
export function closeConnection(): void {
  _client?.close();
  _client = null;
}

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
  // Tear down any prior connection so sockets don't accumulate across games.
  closeConnection();
  const store = useStore.getState();
  const client: WsClient = new WsClient(url, {
    onMessage: msg => {
      store.handleServerMsg(msg);
      onMessage?.(msg, client);
    },
    onConnect: () => store.setConnected(true),
    onDisconnect: () => store.setReconnecting(true),
    onGiveUp: () => store.setConnectionLost(),
  });
  setWsClient(client);
  return client;
}
