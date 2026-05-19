import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import WebSocket from 'ws';
import { registerHttpRoutes } from '../src/http.js';
import { registerWsRoutes } from '../src/ws.js';
import { tileTypeOf } from '@sichuan-mahjong/engine';
import type { ServerMsg, ClientMsg, Seat, TileId } from '@sichuan-mahjong/engine';

// ---------------------------------------------------------------------------
// Test app factory
// ---------------------------------------------------------------------------

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(fastifyWebsocket);
  await registerHttpRoutes(app);
  await registerWsRoutes(app);
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return { app, port };
}

// ---------------------------------------------------------------------------
// HTTP tests
// ---------------------------------------------------------------------------

describe('HTTP routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>['app'];

  beforeEach(async () => {
    ({ app } = await buildApp());
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /healthz returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('POST /api/lobby creates a lobby with code and token', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/lobby' });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ code: string; hostToken: string }>();
    expect(body.code).toMatch(/^[A-Z2-9]{4}$/);
    expect(typeof body.hostToken).toBe('string');
    expect(body.hostToken.length).toBeGreaterThan(10);
  });

  it('GET /api/lobby/:code returns lobby info', async () => {
    const create = await app.inject({ method: 'POST', url: '/api/lobby' });
    const { code } = create.json<{ code: string }>();
    const res = await app.inject({ method: 'GET', url: `/api/lobby/${code}` });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ exists: boolean }>().exists).toBe(true);
  });

  it('GET /api/lobby/:code returns 404 for unknown code', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/lobby/ZZZZ' });
    expect(res.statusCode).toBe(404);
  });

  it('GET /j/:code redirects with code param', async () => {
    const res = await app.inject({ method: 'GET', url: '/j/ABCD', redirect: false });
    expect(res.statusCode).toBe(302);
    expect(res.headers['location']).toBe('/?code=ABCD');
  });
});

// ---------------------------------------------------------------------------
// WebSocket helpers
// ---------------------------------------------------------------------------

function wsConnect(port: number, code: string, token?: string): WebSocket {
  const url = token
    ? `ws://127.0.0.1:${port}/ws/${code}?token=${token}`
    : `ws://127.0.0.1:${port}/ws/${code}`;
  return new WebSocket(url);
}

function wsNextMessage(ws: WebSocket): Promise<ServerMsg> {
  return new Promise((resolve, reject) => {
    ws.once('message', (data: Buffer) => {
      try { resolve(JSON.parse(data.toString()) as ServerMsg); }
      catch (e) { reject(e); }
    });
    ws.once('error', reject);
  });
}

function wsSend(ws: WebSocket, msg: ClientMsg): void {
  ws.send(JSON.stringify(msg));
}

async function waitOpen(ws: WebSocket): Promise<void> {
  if (ws.readyState === WebSocket.OPEN) return;
  return new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
}

// Auto-play a client for all phases until roundEnd
function autoPlay(ws: WebSocket, seat: Seat): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Seat ${seat} timed out waiting for roundEnd`)),
      60_000,
    );

    ws.on('message', (data: Buffer) => {
      let msg: ServerMsg;
      try { msg = JSON.parse(data.toString()) as ServerMsg; }
      catch { return; }

      if (msg.t === 'roundEnd') {
        clearTimeout(timeout);
        resolve();
        return;
      }
      if (msg.t !== 'view') return;

      const { view } = msg;
      const { phase, you } = view;

      if (phase === 'huan') {
        // Pick 3 tiles of the suit with the most tiles
        const bySuit: TileId[][] = [[], [], []];
        for (const t of you.hand) {
          const si = Math.floor(tileTypeOf(t) / 9);
          bySuit[si]?.push(t);
        }
        const chosen = bySuit.find(tiles => tiles.length >= 3);
        if (chosen && chosen.length >= 3) {
          wsSend(ws, {
            t: 'action',
            action: { t: 'huanSelect', seat, tiles: [chosen[0]!, chosen[1]!, chosen[2]!] },
          });
        }
        return;
      }

      if (phase === 'voidDeclare') {
        // Pick suit with fewest tiles as void
        const bySuit: TileId[][] = [[], [], []];
        for (const t of you.hand) {
          const si = Math.floor(tileTypeOf(t) / 9);
          bySuit[si]?.push(t);
        }
        let minIdx = 0;
        if ((bySuit[1]?.length ?? 0) < (bySuit[minIdx]?.length ?? 0)) minIdx = 1;
        if ((bySuit[2]?.length ?? 0) < (bySuit[minIdx]?.length ?? 0)) minIdx = 2;
        const suits = ['man', 'pin', 'sou'] as const;
        const suit = suits[minIdx]!;
        const firstDiscard = (bySuit[minIdx]?.[0] ?? null) as TileId | null;
        wsSend(ws, { t: 'action', action: { t: 'declareVoid', seat, suit, firstDiscard } });
        return;
      }

      if (phase === 'play') {
        const action = view.yourLegalActions.find(a => a.t !== 'pass') ?? view.yourLegalActions[0];
        if (action) wsSend(ws, { t: 'action', action });
      }
    });
  });
}

// ---------------------------------------------------------------------------
// WebSocket integration tests
// ---------------------------------------------------------------------------

describe('WebSocket: lobby flow', () => {
  let app: Awaited<ReturnType<typeof buildApp>>['app'];
  let port: number;

  beforeEach(async () => {
    ({ app, port } = await buildApp());
  });

  afterEach(async () => {
    await app.close();
  });

  it('4 clients join and receive joined + lobby messages', async () => {
    const create = await app.inject({ method: 'POST', url: '/api/lobby' });
    const { code, hostToken } = create.json<{ code: string; hostToken: string }>();

    const names = ['Alice', 'Bob', 'Carol', 'Dan'];
    const sockets: WebSocket[] = [];

    for (let i = 0; i < 4; i++) {
      const ws = wsConnect(port, code, i === 0 ? hostToken : undefined);
      await waitOpen(ws);
      sockets.push(ws);

      wsSend(ws, { t: 'join', name: names[i]! });
      const joined = await wsNextMessage(ws);

      expect(joined.t).toBe('joined');
      if (joined.t === 'joined') {
        expect(joined.seat).toBe(i);
        expect(typeof joined.token).toBe('string');
      }
    }

    for (const ws of sockets) ws.close();
  }, 10_000);
});

describe('WebSocket: full game', () => {
  let app: Awaited<ReturnType<typeof buildApp>>['app'];
  let port: number;

  beforeEach(async () => {
    ({ app, port } = await buildApp());
  });

  afterEach(async () => {
    await app.close();
  });

  it('4 auto-playing clients complete a full round', async () => {
    const create = await app.inject({ method: 'POST', url: '/api/lobby' });
    const { code, hostToken } = create.json<{ code: string; hostToken: string }>();

    const sockets: WebSocket[] = [];

    for (let i = 0; i < 4; i++) {
      const ws = wsConnect(port, code, i === 0 ? hostToken : undefined);
      await waitOpen(ws);
      sockets.push(ws);
      wsSend(ws, { t: 'join', name: `P${i}` });
      // Drain joined message
      await wsNextMessage(ws);
    }

    // Brief pause to let lobby broadcasts settle, then drain them
    await new Promise(r => setTimeout(r, 50));
    for (const ws of sockets) ws.removeAllListeners('message');

    // Start auto-play handlers BEFORE sending startGame so we don't miss the first view
    const roundEndPromises = sockets.map((ws, i) => autoPlay(ws, i as Seat));

    // Host triggers game start
    wsSend(sockets[0]!, { t: 'startGame' });

    await Promise.all(roundEndPromises);

    for (const ws of sockets) ws.close();
  }, 90_000);
});

// ---------------------------------------------------------------------------
// Lobby code format
// ---------------------------------------------------------------------------

describe('Lobby code generation', () => {
  it('generated codes only contain allowed characters', async () => {
    const { generateCode } = await import('../src/lobby.js');
    const allowed = /^[A-HJ-NP-Z2-9]{4}$/;
    for (let i = 0; i < 50; i++) {
      expect(generateCode()).toMatch(allowed);
    }
  });
});
