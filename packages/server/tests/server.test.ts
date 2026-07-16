import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// node:sqlite is a native built-in; Vite 5 can't bundle it — mock before any imports touch it
vi.mock('../src/persistence.js', () => ({
  saveGameWithCode: vi.fn(),
  getGame: vi.fn().mockReturnValue(null),
  saveLiveRoom: vi.fn(),
  loadLiveRooms: vi.fn().mockReturnValue([]),
  deleteLiveRoom: vi.fn(),
}));
import fastifyWebsocket from '@fastify/websocket';
import { tileTypeOf } from '@sichuan-mahjong/engine';
import type { ClientMsg, Seat, ServerMsg, TileId } from '@sichuan-mahjong/engine';
import Fastify from 'fastify';
import WebSocket from 'ws';
import { registerHttpRoutes } from '../src/http.js';
import { registerWsRoutes } from '../src/ws.js';

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
    expect(res.headers.location).toBe('/?code=ABCD');
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
      try {
        resolve(JSON.parse(data.toString()) as ServerMsg);
      } catch (e) {
        reject(e);
      }
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

    // Send huan/void at most once per round: several view broadcasts arrive
    // while the phase is still huan/voidDeclare (one per other player's
    // submission), and firing on each would spam duplicate actions whose
    // rejections drown out real warns in the test output. (A26)
    let sentHuan = false;
    let sentVoid = false;

    ws.on('message', (data: Buffer) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(data.toString()) as ServerMsg;
      } catch {
        return;
      }

      if (msg.t === 'roundEnd') {
        clearTimeout(timeout);
        resolve();
        return;
      }
      if (msg.t !== 'view') return;

      // A31 invariant, checked on every broadcast of every full-game test:
      // another seat's drawn tile must never reach this client.
      for (const ev of msg.events) {
        if ((ev.e === 'drew' || ev.e === 'kongReplacement') && ev.seat !== seat && ev.tile !== null) {
          clearTimeout(timeout);
          reject(new Error(`A31: seat ${seat} received seat ${ev.seat}'s ${ev.e} tile ${ev.tile}`));
          return;
        }
      }

      const { view } = msg;
      const { phase, you } = view;

      if (phase === 'huan') {
        if (sentHuan) return;
        sentHuan = true;
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
        if (sentVoid) return;
        sentVoid = true;
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

  it('A8: a non-host who joins before the host never lands in seat 0', async () => {
    const create = await app.inject({ method: 'POST', url: '/api/lobby' });
    const { code, hostToken } = create.json<{ code: string; hostToken: string }>();

    // Friend (no token) joins FIRST — must be placed in seats 1–3, not the host seat.
    const friend = wsConnect(port, code);
    await waitOpen(friend);
    wsSend(friend, { t: 'join', name: 'Friend' });
    const friendJoined = await wsNextMessage(friend);
    expect(friendJoined.t).toBe('joined');
    if (friendJoined.t === 'joined') expect(friendJoined.seat).not.toBe(0);

    // Host connects with the host token and still gets seat 0.
    const host = wsConnect(port, code, hostToken);
    await waitOpen(host);
    wsSend(host, { t: 'join', name: 'Host' });
    const hostJoined = await wsNextMessage(host);
    expect(hostJoined.t).toBe('joined');
    if (hostJoined.t === 'joined') expect(hostJoined.seat).toBe(0);

    friend.close();
    host.close();
  }, 10_000);

  it('A14: an over-long join name is clamped', async () => {
    const create = await app.inject({ method: 'POST', url: '/api/lobby' });
    const { code } = create.json<{ code: string }>();

    const ws = wsConnect(port, code);
    await waitOpen(ws);
    wsSend(ws, { t: 'join', name: 'x'.repeat(200) });
    const joined = await wsNextMessage(ws);
    expect(joined.t).toBe('joined');

    const info = await app.inject({ method: 'GET', url: `/api/lobby/${code}` });
    const players = info.json<{ players: ({ name: string } | null)[] }>().players;
    const occupied = players.filter((p): p is { name: string } => p !== null);
    expect(occupied).toHaveLength(1);
    expect(occupied[0]!.name.length).toBeLessThanOrEqual(24);

    ws.close();
  }, 10_000);

  it('host keeps its seat and can add bots after a lobby WS reconnect', async () => {
    const create = await app.inject({ method: 'POST', url: '/api/lobby' });
    const { code, hostToken } = create.json<{ code: string; hostToken: string }>();

    // Initial host connection + join.
    const ws1 = wsConnect(port, code, hostToken);
    await waitOpen(ws1);
    wsSend(ws1, { t: 'join', name: 'Host' });
    const joined1 = await wsNextMessage(ws1);
    expect(joined1.t).toBe('joined');

    // Simulate a transient drop.
    ws1.close();
    await new Promise(r => setTimeout(r, 60));

    // Reconnect with the same host token → should re-bind to seat 0 seamlessly.
    const ws2 = wsConnect(port, code, hostToken);
    const rejoinP = wsNextMessage(ws2);
    await waitOpen(ws2);
    const rejoined = await rejoinP;
    expect(rejoined.t).toBe('joined');
    if (rejoined.t === 'joined') expect(rejoined.seat).toBe(0);

    // Adding a bot on the reconnected socket must work (the bug: it was dropped).
    wsSend(ws2, { t: 'addBot', difficulty: 'easy' });
    await new Promise(r => setTimeout(r, 80));

    const info = await app.inject({ method: 'GET', url: `/api/lobby/${code}` });
    const players = info.json<{ players: ({ isBot: boolean } | null)[] }>().players;
    expect(players[0]).not.toBeNull(); // host seat preserved across reconnect
    expect(players.some(p => p?.isBot === true)).toBe(true); // addBot took effect

    ws2.close();
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
      room.disconnect(1); // seat 1 drops
      vi.advanceTimersByTime(61_000); // >60s → bot takeover

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
      expect(s.players[0].isBot).toBe(true); // offline human → bot
      expect(s.players[2].isBot).toBe(true);
      expect(s.players[3].isBot).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reconnect within 60s clears the takeover timer, pushes the current view, and keeps the seat human', async () => {
    const { GameRoom } = await import('../src/room.js');
    vi.useFakeTimers();
    try {
      // All-human room so no bot timers fire — isolates the reconnect-grace path.
      const room = new GameRoom('GRACE', [
        { name: 'P0', isBot: false, connected: false },
        { name: 'P1', isBot: false, connected: false }, // drops then reconnects in time
        { name: 'P2', isBot: false, connected: false },
        { name: 'P3', isBot: false, connected: false },
      ]);
      for (const seat of [0, 1, 2, 3] as const) room.connect(seat, fakeWs());
      room.start();
      expect(room.getState().phase).not.toBe('roundEnd');

      room.disconnect(1);
      vi.advanceTimersByTime(30_000); // still inside the 60s grace window

      // Reconnect with a fresh socket — the room should push the current view to it.
      const ws = fakeWs();
      const sendSpy = vi.fn();
      (ws as unknown as { send: typeof sendSpy }).send = sendSpy;
      room.connect(1, ws);
      expect(sendSpy).toHaveBeenCalled(); // current state re-sent on reconnect

      // Advance past the ORIGINAL 60s deadline: the armed timer was cleared on
      // reconnect, so no bot takeover occurs and the seat stays human + connected.
      vi.advanceTimersByTime(61_000);
      const players = room.getLobbyPlayers();
      expect(players[1]!.isBot).toBe(false);
      expect(players[1]!.connected).toBe(true);
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

  it('endMatch tears down the room and revokes its tokens', async () => {
    const { createRoom, getRoom } = await import('../src/room.js');
    const { issueToken, resolveToken } = await import('../src/tokens.js');
    const tok = issueToken('ENDM', 0, 'host');
    const room = createRoom('ENDM', [
      { name: 'Host', isBot: false, connected: false },
      { name: 'Bot 2', isBot: true, connected: false },
      { name: 'Bot 3', isBot: true, connected: false },
      { name: 'Bot 4', isBot: true, connected: false },
    ]);
    room.start();
    expect(getRoom('ENDM')).toBeDefined();
    expect(resolveToken(tok)).toBeDefined();

    room.endMatch();
    expect(getRoom('ENDM')).toBeUndefined(); // room removed from registry
    expect(resolveToken(tok)).toBeUndefined(); // tokens revoked
  });

  it('endMatch cancels pending bot timers so nothing fires after teardown', async () => {
    const { GameRoom } = await import('../src/room.js');
    vi.useFakeTimers();
    try {
      const room = new GameRoom('TMRS', [
        { name: 'B0', isBot: true, connected: false },
        { name: 'B1', isBot: true, connected: false },
        { name: 'B2', isBot: true, connected: false },
        { name: 'B3', isBot: true, connected: false },
      ]);
      room.start(); // schedules bot "think" timers (huan phase)
      const phaseBefore = room.getState().phase; // 'huan'
      room.endMatch(); // tears down → must cancel those timers

      // If the timers weren't cancelled they'd fire here and drive the game
      // forward (bots submit huan/void/...), advancing the phase.
      vi.advanceTimersByTime(60_000);
      expect(room.getState().phase).toBe(phaseBefore);
    } finally {
      vi.useRealTimers();
    }
  });

  it('A11: a torn-down room ignores late actions/disconnects and never re-persists', async () => {
    const persistence = await import('../src/persistence.js');
    const { GameRoom } = await import('../src/room.js');
    vi.useFakeTimers();
    try {
      const room = new GameRoom('A11Z', [
        { name: 'B0', isBot: true, connected: false },
        { name: 'B1', isBot: true, connected: false },
        { name: 'B2', isBot: true, connected: false },
        { name: 'B3', isBot: true, connected: false },
      ]);
      room.connect(0, fakeWs());
      room.start();
      room.endMatch();

      vi.mocked(persistence.saveLiveRoom).mockClear();

      // A client that ignores matchEnd keeps sending — all must be no-ops.
      room.handleAction(0, { t: 'discard', seat: 0, tile: 0 });
      room.disconnect(0, fakeWs());
      vi.advanceTimersByTime(120_000); // no debounced persist, no bot takeover

      expect(vi.mocked(persistence.saveLiveRoom)).not.toHaveBeenCalled();
      expect(room.getState().phase).toBe('huan'); // state never advanced post-teardown
    } finally {
      vi.useRealTimers();
    }
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
// Restore & reconnect grace (A10)
// ---------------------------------------------------------------------------

describe('Restore & reconnect grace', () => {
  const fakeWs = () =>
    ({ readyState: 1, OPEN: 1, send() {} }) as unknown as import('@fastify/websocket').WebSocket;

  it('A10: restoring mid-claim-window rebases the stale deadline instead of expiring instantly', async () => {
    const { GameRoom } = await import('../src/room.js');
    vi.useFakeTimers();
    try {
      const room = new GameRoom('A10RB', [
        { name: 'H0', isBot: false, connected: false },
        { name: 'H1', isBot: false, connected: false },
        { name: 'H2', isBot: false, connected: false },
        { name: 'H3', isBot: false, connected: false },
      ]);
      const snap = JSON.parse(JSON.stringify(room.serialize())) as ReturnType<
        typeof room.serialize
      >;
      snap.state.phase = 'play';
      snap.state.pendingClaims = {
        tile: 0,
        from: 0,
        afterKong: false,
        deadline: 1, // epoch — long past by the time we restore
        passed: [false, false, false, false],
        claims: [null, null, null, null],
      };

      const restored = GameRoom.restore(snap);
      restored.resumeAfterRestore();

      const pc = restored.getState().pendingClaims;
      expect(pc).not.toBeNull(); // window not force-expired on restore
      expect(pc!.deadline).toBeGreaterThan(Date.now()); // deadline rebased into the future
    } finally {
      vi.useRealTimers();
    }
  });

  it('A10: a disconnected human in reconnect grace is not bot-filled during huan; takeover resumes it', async () => {
    const { GameRoom } = await import('../src/room.js');
    vi.useFakeTimers();
    try {
      const room = new GameRoom('A10HN', [
        { name: 'H0', isBot: false, connected: false },
        { name: 'B1', isBot: true, connected: false },
        { name: 'B2', isBot: true, connected: false },
        { name: 'B3', isBot: true, connected: false },
      ]);
      room.connect(0, fakeWs());
      room.start(); // huan phase; bots 1–3 scheduled to submit
      room.disconnect(0); // seat 0 drops before submitting → 60s grace armed

      vi.advanceTimersByTime(1_000); // bots submit huan; seat 0 must be left alone
      expect(room.getState().phase).toBe('huan'); // still waiting on the human
      expect(room.getState().pendingHuan[0]).toBeNull(); // NOT bot-filled during grace
      expect(room.getState().pendingHuan[1]).not.toBeNull(); // bots did submit

      // Grace lapses → takeover bot-fills seat 0 → the round proceeds past huan.
      let guard = 0;
      while (room.getState().phase === 'huan' && guard++ < 100_000) {
        vi.advanceTimersByTime(1_000);
      }
      expect(room.getState().phase).not.toBe('huan');
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// RoundEnd persistence (A9)
// ---------------------------------------------------------------------------

describe('RoundEnd persistence', () => {
  const fakeWs = () =>
    ({ readyState: 1, OPEN: 1, send() {} }) as unknown as import('@fastify/websocket').WebSocket;

  it('A9: persists the games row exactly once even when clients reconnect at round end', async () => {
    const persistence = await import('../src/persistence.js');
    const { GameRoom } = await import('../src/room.js');
    vi.mocked(persistence.saveGameWithCode).mockClear();
    vi.useFakeTimers();
    try {
      const room = new GameRoom('A9RE', [
        { name: 'B0', isBot: true, connected: false },
        { name: 'B1', isBot: true, connected: false },
        { name: 'B2', isBot: true, connected: false },
        { name: 'B3', isBot: true, connected: false },
      ]);
      room.connect(0, fakeWs());
      room.start();

      let guard = 0;
      while (room.getState().phase !== 'roundEnd' && guard++ < 100_000) {
        vi.advanceTimersByTime(200);
      }
      expect(room.getState().phase).toBe('roundEnd');
      expect(vi.mocked(persistence.saveGameWithCode).mock.calls.length).toBe(1);

      // Several reconnects at round end must NOT insert additional rows.
      room.connect(0, fakeWs());
      room.connect(1, fakeWs());
      room.connect(2, fakeWs());
      expect(vi.mocked(persistence.saveGameWithCode).mock.calls.length).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// Malformed input & action whitelist (A2/A4/A5)
// ---------------------------------------------------------------------------

describe('Malformed input & action whitelist', () => {
  const recordingWs = (sink: ServerMsg[]) =>
    ({
      readyState: 1,
      OPEN: 1,
      send: (data: string) => sink.push(JSON.parse(data) as ServerMsg),
    }) as unknown as import('@fastify/websocket').WebSocket;

  const fourSeats = (seat0Human = true) =>
    [
      { name: 'P0', isBot: !seat0Human, connected: false },
      { name: 'P1', isBot: true, connected: false },
      { name: 'P2', isBot: true, connected: false },
      { name: 'P3', isBot: true, connected: false },
    ] as const;

  it('A2: malformed action frames are rejected without throwing (would previously crash the server)', async () => {
    const { GameRoom } = await import('../src/room.js');
    const sent: ServerMsg[] = [];
    const room = new GameRoom('MAL1', [...fourSeats()]);
    room.connect(0, recordingWs(sent));

    // Each of these used to reach `'seat' in action` (TypeError) or return
    // `undefined` from the engine and crash the socket handler.
    expect(() => room.handleAction(0, null)).not.toThrow();
    expect(() => room.handleAction(0, 42)).not.toThrow();
    expect(() => room.handleAction(0, {})).not.toThrow();
    expect(() => room.handleAction(0, { t: 'bogus' })).not.toThrow();

    const errs = sent.filter(m => m.t === 'error');
    expect(errs.length).toBe(4);
  });

  it('A4: claimWindowExpire from a client is rejected (server-issued only)', async () => {
    const { GameRoom } = await import('../src/room.js');
    const sent: ServerMsg[] = [];
    const room = new GameRoom('MAL2', [...fourSeats()]);
    room.connect(0, recordingWs(sent));

    room.handleAction(0, { t: 'claimWindowExpire' });

    const err = sent.find(m => m.t === 'error');
    expect(err?.t).toBe('error');
    if (err?.t === 'error') expect(err.code).toBe('forbidden_action');
  });

  it('A5: a stale socket close does not evict a reconnected socket', async () => {
    const { GameRoom } = await import('../src/room.js');
    const room = new GameRoom('MAL3', [...fourSeats()]);
    const ws1 = recordingWs([]);
    const ws2 = recordingWs([]);

    room.connect(0, ws1);
    room.start();
    room.connect(0, ws2); // reconnect: seat 0 now bound to ws2

    room.disconnect(0, ws1); // stale close of the OLD socket

    // Seat 0 must still be considered connected (ws2 is live).
    expect(room.getLobbyPlayers()[0]!.connected).toBe(true);

    // And a genuine close of the current socket still disconnects.
    room.disconnect(0, ws2);
    expect(room.getLobbyPlayers()[0]!.connected).toBe(false);
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
