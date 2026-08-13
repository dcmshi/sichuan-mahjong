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
import { deleteRoom } from '../src/room.js';
import { lobbyConnectionCodes, registerWsRoutes } from '../src/ws.js';

/**
 * What outlives a lobby. (A61)
 *
 * `startGame` hands each lobby socket to the room and deletes the lobby's
 * connection map — but `bindGameSocket` replaces only the socket's *message*
 * listener, so the lobby's `close` handler is still attached. It used to reach
 * for the map through `getLobbyConns`, which creates one when it is missing:
 * every game that started and then had a socket close left an empty `Map`
 * behind, under a code no sweep visits again, for the life of the process.
 *
 * Nothing else could see it. `sweepStaleLobbies` walks the lobby store, and by
 * then the lobby is gone — which is why the guard is written against the
 * connection map directly.
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

function wsWaitFor(ws: WebSocket, pred: (m: ServerMsg) => boolean, timeoutMs = 2000) {
  return new Promise<ServerMsg>((resolve, reject) => {
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
  });
}

const settle = () => new Promise(r => setTimeout(r, 120));

describe('a started game leaves no lobby state behind (A61)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>['app'];
  let port: number;
  let code: string;
  let hostToken: string;
  let host: WebSocket;

  beforeEach(async () => {
    // The pace comes from vitest.config.ts's SM_BOT_DELAY_MS=150, and setting it
    // here would do nothing: `paceOverride` is read once when room.ts loads.
    ({ app, port } = await buildApp());
    const create = await app.inject({ method: 'POST', url: '/api/lobby' });
    ({ code, hostToken } = create.json<{ code: string; hostToken: string }>());

    host = new WebSocket(`ws://127.0.0.1:${port}/ws/${code}?token=${hostToken}`);
    await waitOpen(host);
    wsSend(host, { t: 'join', name: 'Host' });
    await wsWaitFor(host, m => m.t === 'joined');
  });

  afterEach(async () => {
    if (host.readyState === WebSocket.OPEN) host.close();
    deleteRoom(code);
    await app.close();
  });

  it('drops the connection map when the last game socket closes', async () => {
    for (let i = 0; i < 3; i++) wsSend(host, { t: 'addBot', difficulty: 'easy' });
    await settle();
    wsSend(host, { t: 'startGame', rules: {} });
    await wsWaitFor(host, m => m.t === 'view');

    // startGame transfers the sockets and deletes the map.
    expect(lobbyConnectionCodes()).not.toContain(code);

    host.close();
    await settle();

    // The lobby close handler still runs here — it must read the map, never
    // create one.
    expect(lobbyConnectionCodes()).not.toContain(code);
  });
});
