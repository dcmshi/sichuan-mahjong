import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// node:sqlite is a native built-in; Vite can't bundle it — mock before any import touches it.
vi.mock('../src/persistence.js', () => ({
  saveGameWithCode: vi.fn(),
  getGame: vi.fn().mockReturnValue(null),
  saveLiveRoom: vi.fn(),
  loadLiveRooms: vi.fn().mockReturnValue([]),
  deleteLiveRoom: vi.fn(),
  getDb: vi.fn(() => null),
}));
import fastifyWebsocket from '@fastify/websocket';
import type { ClientMsg, ServerMsg } from '@sichuan-mahjong/engine';
import Fastify from 'fastify';
import WebSocket from 'ws';
import { registerHttpRoutes } from '../src/http.js';
import { registerWsRoutes } from '../src/ws.js';

/**
 * Every host-only command on the WS gateway, refused for a non-host. (A42)
 *
 * These are authorization checks on a service anyone with a 4-character code can
 * reach, and until this file no test in the repo named one: `not_host` appeared
 * nowhere in `packages/server/tests` or `e2e/`. A8 put real thought into seat 0
 * being the host seat and nothing checked that what was built on top of it held.
 *
 * Each gate gets two cases. The refusal proves the guard fires; the **positive
 * control** proves the refusal wasn't for some unrelated reason — a typo in the
 * message, a lobby that had already closed — which is the failure mode a
 * negative-only test cannot tell from success. Where a refusal has an observable
 * effect to check, the test asserts the state is unchanged rather than only that
 * an error came back.
 */

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

function wsConnect(port: number, code: string, token?: string): WebSocket {
  const url = token
    ? `ws://127.0.0.1:${port}/ws/${code}?token=${token}`
    : `ws://127.0.0.1:${port}/ws/${code}`;
  return new WebSocket(url);
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

/**
 * The next message matching `pred`. Not `once('message')`: a lobby socket is
 * also receiving `lobby` broadcasts and a game socket a `view` on every action,
 * so taking the literal next frame races whatever else the server is saying.
 */
function wsWaitFor(
  ws: WebSocket,
  pred: (m: ServerMsg) => boolean,
  timeoutMs = 2000,
): Promise<ServerMsg> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMessage);
      reject(new Error('timed out waiting for a matching message'));
    }, timeoutMs);
    function onMessage(data: Buffer) {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(data.toString()) as ServerMsg;
      } catch {
        return;
      }
      if (!pred(msg)) return;
      clearTimeout(timer);
      ws.off('message', onMessage);
      resolve(msg);
    }
    ws.on('message', onMessage);
    ws.once('error', err => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

const errorNamed = (code: string) => (m: ServerMsg) => m.t === 'error' && m.code === code;

/** Long enough for a broadcast to land, short enough not to pad the suite. */
const settle = () => new Promise(r => setTimeout(r, 80));

type LobbyPlayer = { name: string; isBot: boolean; difficulty?: string } | null;

async function lobbyPlayers(
  app: Awaited<ReturnType<typeof buildApp>>['app'],
  code: string,
): Promise<LobbyPlayer[]> {
  const info = await app.inject({ method: 'GET', url: `/api/lobby/${code}` });
  return info.json<{ players: LobbyPlayer[] }>().players;
}

/**
 * The most recent `lobby` broadcast seen on a socket. Bot difficulty rides that
 * message and not `GET /api/lobby/:code`, and a refused command produces no
 * broadcast at all — so "unchanged" has to be read from the last one that did
 * arrive rather than awaited.
 */
function trackLobby(ws: WebSocket): () => LobbyPlayer[] {
  let latest: LobbyPlayer[] = [];
  ws.on('message', (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString()) as ServerMsg;
      if (msg.t === 'lobby') latest = msg.players as LobbyPlayer[];
    } catch {
      /* not our frame */
    }
  });
  return () => latest;
}

describe('A42: host-only lobby commands', () => {
  let app: Awaited<ReturnType<typeof buildApp>>['app'];
  let port: number;
  let code: string;
  let hostToken: string;
  let host: WebSocket;
  let friend: WebSocket;

  beforeEach(async () => {
    ({ app, port } = await buildApp());
    const create = await app.inject({ method: 'POST', url: '/api/lobby' });
    ({ code, hostToken } = create.json<{ code: string; hostToken: string }>());

    host = wsConnect(port, code, hostToken);
    await waitOpen(host);
    wsSend(host, { t: 'join', name: 'Host' });
    await wsWaitFor(host, m => m.t === 'joined');

    // No token, so the gateway never flags `isHost` for this socket. This is the
    // shape of the threat: someone who has the room code and nothing else.
    friend = wsConnect(port, code);
    await waitOpen(friend);
    wsSend(friend, { t: 'join', name: 'Friend' });
    const joined = await wsWaitFor(friend, m => m.t === 'joined');
    if (joined.t === 'joined') expect(joined.seat).not.toBe(0);
  });

  afterEach(async () => {
    for (const ws of [host, friend]) {
      if (ws.readyState === WebSocket.OPEN) ws.close();
    }
    await app.close();
  });

  it('refuses addBot from a non-host, and seats one for the host', async () => {
    wsSend(friend, { t: 'addBot', difficulty: 'easy' });
    const err = await wsWaitFor(friend, errorNamed('not_host'));
    expect(err.t).toBe('error');
    await settle();
    expect((await lobbyPlayers(app, code)).some(p => p?.isBot)).toBe(false);

    wsSend(host, { t: 'addBot', difficulty: 'easy' });
    await settle();
    expect((await lobbyPlayers(app, code)).some(p => p?.isBot)).toBe(true);
  });

  it('refuses setBotDifficulty from a non-host, and applies it for the host', async () => {
    const seen = trackLobby(host);
    wsSend(host, { t: 'addBot', difficulty: 'easy', seat: 2 });
    await settle();
    expect(seen()[2]?.difficulty).toBe('easy');

    wsSend(friend, { t: 'setBotDifficulty', seat: 2, difficulty: 'hard' });
    await wsWaitFor(friend, errorNamed('not_host'));
    await settle();
    expect(seen()[2]?.difficulty).toBe('easy');

    wsSend(host, { t: 'setBotDifficulty', seat: 2, difficulty: 'hard' });
    await settle();
    expect(seen()[2]?.difficulty).toBe('hard');
  });

  it('refuses kickBot from a non-host, and removes one for the host', async () => {
    wsSend(host, { t: 'addBot', difficulty: 'easy', seat: 2 });
    await settle();
    expect((await lobbyPlayers(app, code))[2]?.isBot).toBe(true);

    wsSend(friend, { t: 'kickBot', seat: 2 });
    await wsWaitFor(friend, errorNamed('not_host'));
    await settle();
    // The seat is still occupied — the refusal has to be observable as inaction,
    // not just as an error frame.
    expect((await lobbyPlayers(app, code))[2]?.isBot).toBe(true);

    wsSend(host, { t: 'kickBot', seat: 2 });
    await settle();
    expect((await lobbyPlayers(app, code))[2]).toBeNull();
  });

  it('refuses startGame from a non-host, and starts it for the host', async () => {
    wsSend(host, { t: 'addBot', difficulty: 'easy', seat: 2 });
    wsSend(host, { t: 'addBot', difficulty: 'easy', seat: 3 });
    await settle();

    wsSend(friend, { t: 'startGame' });
    await wsWaitFor(friend, errorNamed('not_host'));
    await settle();
    // Still a lobby: the room never materialised.
    const info = await app.inject({ method: 'GET', url: `/api/lobby/${code}` });
    expect(info.statusCode).toBe(200);

    const dealt = wsWaitFor(host, m => m.t === 'view', 5000);
    wsSend(host, { t: 'startGame' });
    expect((await dealt).t).toBe('view');
  }, 10_000);
});

describe('A42: host-only in-game commands', () => {
  let app: Awaited<ReturnType<typeof buildApp>>['app'];
  let port: number;
  let code: string;
  let host: WebSocket;
  let friend: WebSocket;

  // Host in seat 0, a human friend in seat 1, bots in 2 and 3 — the smallest
  // table that has both a non-host human socket to send from and a bot for
  // `setBotSpeed` to have something to pace.
  beforeEach(async () => {
    ({ app, port } = await buildApp());
    const create = await app.inject({ method: 'POST', url: '/api/lobby' });
    const { code: c, hostToken } = create.json<{ code: string; hostToken: string }>();
    code = c;

    host = wsConnect(port, code, hostToken);
    await waitOpen(host);
    wsSend(host, { t: 'join', name: 'Host' });
    await wsWaitFor(host, m => m.t === 'joined');

    friend = wsConnect(port, code);
    await waitOpen(friend);
    wsSend(friend, { t: 'join', name: 'Friend' });
    await wsWaitFor(friend, m => m.t === 'joined');

    wsSend(host, { t: 'addBot', difficulty: 'easy', seat: 2 });
    wsSend(host, { t: 'addBot', difficulty: 'easy', seat: 3 });
    await settle();

    const dealt = wsWaitFor(friend, m => m.t === 'view', 5000);
    wsSend(host, { t: 'startGame' });
    await dealt;
  }, 15_000);

  afterEach(async () => {
    for (const ws of [host, friend]) {
      if (ws.readyState === WebSocket.OPEN) ws.close();
    }
    await app.close();
  });

  it('refuses nextRound from a non-host seat', async () => {
    wsSend(friend, { t: 'nextRound' });
    const err = await wsWaitFor(friend, errorNamed('not_host'));
    expect(err.t).toBe('error');
    // The round in progress is untouched — a mid-round nextRound from a player
    // would re-deal the table out from under everyone.
    const { getRoom } = await import('../src/room.js');
    expect(getRoom(code)?.getState().phase).not.toBe('roundEnd');
  });

  it('refuses setBotSpeed from a non-host seat, and paces for the host', async () => {
    const { getRoom } = await import('../src/room.js');
    const before = getRoom(code)?.getBotSpeed();

    wsSend(friend, { t: 'setBotSpeed', botSpeed: 'slow' });
    await wsWaitFor(friend, errorNamed('not_host'));
    await settle();
    expect(getRoom(code)?.getBotSpeed()).toBe(before);

    wsSend(host, { t: 'setBotSpeed', botSpeed: 'slow' });
    await settle();
    expect(getRoom(code)?.getBotSpeed()).toBe('slow');
  });

  it('refuses endMatch from a non-host seat, then ends it for the host', async () => {
    const { getRoom } = await import('../src/room.js');

    wsSend(friend, { t: 'endMatch' });
    await wsWaitFor(friend, errorNamed('not_host'));
    await settle();
    // Still live. This is the gate with the largest blast radius: it ends the
    // game for all four seats and tears the room down.
    expect(getRoom(code)).toBeDefined();

    const ended = wsWaitFor(friend, m => m.t === 'matchEnd', 3000);
    wsSend(host, { t: 'endMatch' });
    expect((await ended).t).toBe('matchEnd');
    expect(getRoom(code)).toBeUndefined();
  }, 10_000);
});
