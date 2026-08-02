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
import Fastify from 'fastify';
import WebSocket from 'ws';
import { registerHttpRoutes } from '../src/http.js';
import { registerWsRoutes } from '../src/ws.js';

// Mirrors MAX_WS_FRAME_BYTES in server.ts, which owns the Fastify instance.
const MAX_WS_FRAME_BYTES = 64 * 1024;

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(fastifyWebsocket, { options: { maxPayload: MAX_WS_FRAME_BYTES } });
  await registerHttpRoutes(app);
  await registerWsRoutes(app);
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return { app, port };
}

describe('WebSocket frame ceiling (H1)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>['app'];
  let port: number;

  beforeEach(async () => {
    ({ app, port } = await buildApp());
  });
  afterEach(async () => {
    await app.close();
  });

  it('closes a socket that sends an oversized frame', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/ZZZZ`);
    await new Promise<void>(resolve => ws.on('open', () => resolve()));
    const closeCode = await new Promise<number>(resolve => {
      ws.on('close', code => resolve(code));
      // Over our cap but far under `ws`'s own 100MB default, so a pass here means
      // the limit being enforced is ours rather than the library's.
      ws.send(JSON.stringify({ t: 'join', name: 'x'.repeat(MAX_WS_FRAME_BYTES * 2) }));
    });
    expect(closeCode).toBe(1009); // "message too big"
  });

  it('leaves a normal-sized frame alone', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/ZZZZ`);
    await new Promise<void>(resolve => ws.on('open', () => resolve()));
    const outcome = await new Promise<string>(resolve => {
      ws.on('close', code => resolve(`closed:${code}`));
      ws.on('message', raw => resolve(raw.toString()));
      setTimeout(() => resolve('accepted'), 300);
      ws.send(JSON.stringify({ t: 'join', name: 'A normal player name' }));
    });
    expect(outcome).not.toContain('closed:1009');
    ws.close();
  });
});
