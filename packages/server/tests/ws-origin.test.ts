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
import { isAllowedOrigin } from '../src/security.js';
import { registerWsRoutes } from '../src/ws.js';

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

const HOSTED = 'sichuan-mahjong.onrender.com';

describe('isAllowedOrigin (H2)', () => {
  it('allows an origin whose host matches the Host header', () => {
    expect(isAllowedOrigin(`https://${HOSTED}`, HOSTED)).toBe(true);
    expect(isAllowedOrigin('http://192.168.1.50:8080', '192.168.1.50:8080')).toBe(true);
    expect(isAllowedOrigin('https://laptop.ts.net:8443', 'laptop.ts.net:8443')).toBe(true);
  });

  it('ignores the scheme, because a proxy terminates TLS before we see it', () => {
    // The browser is on https; this server, behind Render's proxy, is not.
    expect(isAllowedOrigin(`https://${HOSTED}`, HOSTED)).toBe(true);
    expect(isAllowedOrigin(`http://${HOSTED}`, HOSTED)).toBe(true);
  });

  it('refuses a foreign origin', () => {
    expect(isAllowedOrigin('https://evil.example', HOSTED)).toBe(false);
    // A host that merely *contains* ours is still someone else's.
    expect(isAllowedOrigin(`https://${HOSTED}.evil.example`, HOSTED)).toBe(false);
    expect(isAllowedOrigin(`https://evil.example/?x=${HOSTED}`, HOSTED)).toBe(false);
  });

  it('refuses a different port on the same hostname', () => {
    expect(isAllowedOrigin('http://192.168.1.50:9999', '192.168.1.50:8080')).toBe(false);
  });

  it('refuses an opaque origin and an unparseable one', () => {
    expect(isAllowedOrigin('null', 'example.com')).toBe(false);
    expect(isAllowedOrigin('not a url', 'example.com')).toBe(false);
  });

  it('allows a missing origin — non-browser clients send none', () => {
    // An attacker who can set headers can set Origin too; the value here is in
    // constraining what a *browser* does on a hostile page's behalf.
    expect(isAllowedOrigin(undefined, 'example.com')).toBe(true);
    expect(isAllowedOrigin('', 'example.com')).toBe(true);
  });

  it('refuses when there is no Host to compare against', () => {
    expect(isAllowedOrigin('https://example.com', undefined)).toBe(false);
  });
});

describe('WebSocket upgrade origin gate (H2)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>['app'];
  let port: number;

  beforeEach(async () => {
    ({ app, port } = await buildApp());
  });
  afterEach(async () => {
    await app.close();
  });

  it('refuses an upgrade from a foreign Origin', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/ZZZZ`, {
      headers: { Origin: 'https://evil.example' },
    });
    const msg = await new Promise<string>(resolve => {
      ws.on('message', raw => resolve(raw.toString()));
      ws.on('close', () => resolve('closed'));
      ws.on('error', e => resolve(`error:${e.message}`));
    });
    expect(msg).toContain('forbidden_origin');
    ws.close();
  });

  it('lets an upgrade through when the Origin matches the host it asked for', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/ZZZZ`, {
      headers: { Origin: `http://127.0.0.1:${port}` },
    });
    // A socket past the gate is left open waiting for a `join`, so silence is the
    // pass — give any refusal frame time to land before concluding that.
    const outcome = await new Promise<string>(resolve => {
      ws.on('open', () => setTimeout(() => resolve('open, no refusal'), 300));
      ws.on('message', raw => resolve(raw.toString()));
      ws.on('close', code => resolve(`closed:${code}`));
      ws.on('error', e => resolve(`error:${e.message}`));
    });
    expect(outcome).toBe('open, no refusal');
    ws.close();
  });
});
