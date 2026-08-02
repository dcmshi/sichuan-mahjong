import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// node:sqlite is a native built-in; Vite 5 can't bundle it — mock before any imports touch it
vi.mock('../src/persistence.js', () => ({
  saveGameWithCode: vi.fn(),
  getGame: vi.fn().mockReturnValue(null),
  saveLiveRoom: vi.fn(),
  loadLiveRooms: vi.fn().mockReturnValue([]),
  deleteLiveRoom: vi.fn(),
}));
import Fastify from 'fastify';
import { registerHttpRoutes } from '../src/http.js';

async function buildApp() {
  const app = Fastify({ logger: false });
  await registerHttpRoutes(app);
  return app;
}

describe('security headers (M1)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    app = await buildApp();
  });
  afterEach(async () => {
    await app.close();
  });

  it('sets them on an API response', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    // The load-bearing one: the spectator watch secret rides in a query string,
    // so a referrer leak would hand it to whatever the player navigates to next.
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
  });

  it('sets them on the crawler routes too, not just on JSON', async () => {
    const res = await app.inject({ method: 'GET', url: '/robots.txt' });
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('does not send HSTS over plain http, where it is meaningless', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.headers['strict-transport-security']).toBeUndefined();
  });

  it('keeps script, style and connections on this origin', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    const csp = String(res.headers['content-security-policy']);
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("object-src 'none'");
    // No wildcard source anywhere — that would undo the point of the policy.
    expect(csp).not.toContain('*');
  });
});
