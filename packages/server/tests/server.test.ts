import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// node:sqlite is a native built-in; Vite 5 can't bundle it — mock before any imports touch it
vi.mock('../src/persistence.js', () => ({
  saveGameWithCode: vi.fn(),
  getGame: vi.fn().mockReturnValue(null),
  saveLiveRoom: vi.fn(),
  loadLiveRooms: vi.fn().mockReturnValue([]),
  deleteLiveRoom: vi.fn(),
}));
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

  it('host can start the next round, rotating the dealer', async () => {
    const { getRoom } = await import('../src/room.js');
    const create = await app.inject({ method: 'POST', url: '/api/lobby' });
    const { code, hostToken } = create.json<{ code: string; hostToken: string }>();

    const sockets: WebSocket[] = [];
    for (let i = 0; i < 4; i++) {
      const ws = wsConnect(port, code, i === 0 ? hostToken : undefined);
      await waitOpen(ws);
      sockets.push(ws);
      wsSend(ws, { t: 'join', name: `P${i}` });
      await wsNextMessage(ws);
    }
    await new Promise(r => setTimeout(r, 50));
    for (const ws of sockets) ws.removeAllListeners('message');

    const roundEndPromises = sockets.map((ws, i) => autoPlay(ws, i as Seat));
    wsSend(sockets[0]!, { t: 'startGame' });
    await Promise.all(roundEndPromises);

    // Round is over; capture the computed next dealer, then start the next round.
    for (const ws of sockets) ws.removeAllListeners('message');
    const room = getRoom(code)!;
    expect(room.getState().phase).toBe('roundEnd');
    const nextDealer = room.getState().nextDealer;

    expect(room.nextRound()).toBe(true);

    const s = room.getState();
    expect(s.phase).not.toBe('roundEnd');
    expect(s.dealer).toBe(nextDealer);
    expect(s.turn).toBe(nextDealer);
    expect(s.players.every(p => p.scoreDelta === 0)).toBe(true);

    // nextRound is a no-op once the round is live again.
    expect(room.nextRound()).toBe(false);

    for (const ws of sockets) ws.close();
  }, 90_000);
});

// ---------------------------------------------------------------------------
// Spectators
// ---------------------------------------------------------------------------

describe('WebSocket: spectators', () => {
  let app: Awaited<ReturnType<typeof buildApp>>['app'];
  let port: number;

  beforeEach(async () => {
    ({ app, port } = await buildApp());
  });
  afterEach(async () => {
    await app.close();
  });

  it('spectator receives a hand-hiding spectate view; unknown game is rejected', async () => {
    // Unknown game → error + close. The server pushes the message on connect
    // (before the client sends anything), so attach the listener before open.
    const bad = new WebSocket(`ws://127.0.0.1:${port}/ws/ZZZZ?spectate=1`);
    const errP = wsNextMessage(bad);
    await waitOpen(bad);
    const errMsg = await errP;
    expect(errMsg.t).toBe('error');
    if (errMsg.t === 'error') expect(errMsg.code).toBe('no_game');
    bad.close();

    // Start a real game.
    const create = await app.inject({ method: 'POST', url: '/api/lobby' });
    const { code, hostToken } = create.json<{ code: string; hostToken: string }>();
    const sockets: WebSocket[] = [];
    for (let i = 0; i < 4; i++) {
      const ws = wsConnect(port, code, i === 0 ? hostToken : undefined);
      await waitOpen(ws);
      sockets.push(ws);
      wsSend(ws, { t: 'join', name: `P${i}` });
      await wsNextMessage(ws);
    }
    await new Promise(r => setTimeout(r, 30));
    for (const ws of sockets) ws.removeAllListeners('message');
    wsSend(sockets[0]!, { t: 'startGame' });
    await new Promise(r => setTimeout(r, 50));

    // Spectate the live game. The first spectate view is pushed on connect.
    const spec = new WebSocket(`ws://127.0.0.1:${port}/ws/${code}?spectate=1`);
    const specP = wsNextMessage(spec);
    await waitOpen(spec);
    const msg = await specP;
    expect(msg.t).toBe('spectate');
    if (msg.t === 'spectate') {
      expect(msg.view.players).toHaveLength(4);
      for (const p of msg.view.players) {
        expect('hand' in p).toBe(false);
        expect(typeof p.handCount).toBe('number');
      }
    }

    spec.close();
    for (const ws of sockets) ws.close();
  }, 20_000);
});

// ---------------------------------------------------------------------------
// Reconnection >60s reclaim (§6.5)
// ---------------------------------------------------------------------------

describe('Reconnection reclaim', () => {
  const fakeWs = () =>
    ({ readyState: 1, OPEN: 1, send() {} }) as unknown as import('@fastify/websocket').WebSocket;

  it('reconnected human reclaims their seat at the next round; still-offline human stays a bot', async () => {
    const { GameRoom } = await import('../src/room.js');
    vi.useFakeTimers();
    try {
      const room = new GameRoom('RCLM', [
        { name: 'P0', isBot: false, connected: false }, // human, will stay offline
        { name: 'P1', isBot: false, connected: false }, // human, drops then reconnects
        { name: 'P2', isBot: true, connected: false },
        { name: 'P3', isBot: true, connected: false },
      ]);

      room.connect(1, fakeWs());
      room.start();
      room.disconnect(1);              // seat 1 drops
      vi.advanceTimersByTime(61_000);  // >60s → bot takeover

      // All seats are now bot/offline-driven — let the round play out.
      let guard = 0;
      while (room.getState().phase !== 'roundEnd' && guard++ < 100_000) {
        vi.advanceTimersByTime(200);
      }
      expect(room.getState().phase).toBe('roundEnd');

      // Seat 1's human reconnects before the next round; seat 0 stays offline.
      room.connect(1, fakeWs());
      expect(room.nextRound()).toBe(true);

      const s = room.getState();
      expect(s.players[1].isBot).toBe(false); // reclaimed
      expect(s.players[0].isBot).toBe(true);  // offline human → bot
      expect(s.players[2].isBot).toBe(true);
      expect(s.players[3].isBot).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// Host-shutdown live-state resume
// ---------------------------------------------------------------------------

describe('Live-room resume', () => {
  const fakeWs = () =>
    ({ readyState: 1, OPEN: 1, send() {} }) as unknown as import('@fastify/websocket').WebSocket;

  it('serialize/restore round-trips game state, slots, and human seats', async () => {
    const { GameRoom } = await import('../src/room.js');
    const room = new GameRoom('SNAP', [
      { name: 'Alice', isBot: false, connected: false },
      { name: 'Bob', isBot: false, connected: false },
      { name: 'Bot 3', isBot: true, connected: false },
      { name: 'Bot 4', isBot: true, connected: false },
    ]);
    room.connect(0, fakeWs());
    room.start();

    const before = room.getState();
    const snap = room.serialize();
    expect(snap.code).toBe('SNAP');
    expect(snap.isHumanSeat).toEqual([true, true, false, false]);

    // Round-trip through JSON, as the DB would.
    const restored = GameRoom.restore(JSON.parse(JSON.stringify(snap)));
    const after = restored.getState();

    expect(after.phase).toBe(before.phase);
    expect(after.turn).toBe(before.turn);
    expect(after.dealer).toBe(before.dealer);
    expect(after.players.map(p => p.hand.length)).toEqual(before.players.map(p => p.hand.length));
    expect(after.seed).toBe(before.seed);
    // Restored room has no live connections.
    expect(restored.getLobbyPlayers().every(p => !p.connected)).toBe(true);
  });

  it('restoreRoomsFromDisk recreates rooms and re-registers tokens', async () => {
    const persistence = await import('../src/persistence.js');
    const { GameRoom, restoreRoomsFromDisk, getRoom } = await import('../src/room.js');
    const { resolveToken } = await import('../src/tokens.js');

    // Build a room, snapshot it, then feed that snapshot back via the mocked loader.
    const room = new GameRoom('RSTR', [
      { name: 'Alice', isBot: false, connected: false },
      { name: 'Bot 2', isBot: true, connected: false },
      { name: 'Bot 3', isBot: true, connected: false },
      { name: 'Bot 4', isBot: true, connected: false },
    ]);
    room.start();
    const snap = room.serialize();
    // Inject a token that should be re-registered on restore.
    snap.tokens = [{ token: 'tok-rstr-0', code: 'RSTR', seat: 0, role: 'host' }];

    vi.mocked(persistence.loadLiveRooms).mockReturnValueOnce([
      { code: 'RSTR', snapshot: JSON.parse(JSON.stringify(snap)) },
    ]);

    const n = restoreRoomsFromDisk();
    expect(n).toBe(1);
    expect(getRoom('RSTR')).toBeDefined();
    const td = resolveToken('tok-rstr-0');
    expect(td).toEqual({ code: 'RSTR', seat: 0, role: 'host' });
  });
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
