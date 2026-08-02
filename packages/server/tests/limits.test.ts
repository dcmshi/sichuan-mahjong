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
import { registerHttpRoutes } from '../src/http.js';
import { installLimits } from '../src/limits.js';
import { allLobbies, deleteLobby } from '../src/lobby.js';
import { type RuntimeProfile, profileFor } from '../src/profile.js';
import { registerWsRoutes } from '../src/ws.js';

/**
 * The suite runs with SM_RATE_LIMIT_OFF (see vitest.config.ts), so this file
 * installs its own profile with the limits deliberately tiny. That is also the
 * honest way to test a ceiling: shrink the ceiling, not the patience.
 */
function tightProfile(over: Partial<RuntimeProfile> = {}): RuntimeProfile {
  return {
    ...profileFor(false, {} as NodeJS.ProcessEnv),
    createLimit: { limit: 2, windowMs: 60_000 },
    joinLimit: { limit: 3, windowMs: 60_000 },
    maxConcurrentGames: 3,
    rateLimitEnabled: true,
    ...over,
  };
}

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(fastifyWebsocket);
  await registerHttpRoutes(app);
  await registerWsRoutes(app);
  return app;
}

describe('rate limits over HTTP', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
    // The lobby store is module-global and outlives the app, so the capacity
    // test would otherwise be counting rooms an earlier test left behind.
    for (const lobby of allLobbies()) deleteLobby(lobby.code);
    // Hand the rest of the suite back an unlimited server.
    installLimits(profileFor(false));
  });

  it('429s lobby creation past the per-caller budget', async () => {
    installLimits(tightProfile());
    for (let i = 0; i < 2; i++) {
      const ok = await app.inject({ method: 'POST', url: '/api/lobby' });
      expect(ok.statusCode).toBe(201);
    }
    const over = await app.inject({ method: 'POST', url: '/api/lobby' });
    expect(over.statusCode).toBe(429);
    expect(over.json()).toEqual({ error: 'rate_limited' });
  });

  it('429s code lookups, which is the enumeration guard', async () => {
    installLimits(tightProfile());
    for (let i = 0; i < 3; i++) {
      // 404s still cost budget — otherwise guessing wrong would be free, which
      // is exactly what an enumeration does.
      const res = await app.inject({ method: 'GET', url: '/api/lobby/ZZZZ' });
      expect(res.statusCode).toBe(404);
    }
    const over = await app.inject({ method: 'GET', url: '/api/lobby/ZZZZ' });
    expect(over.statusCode).toBe(429);
  });

  it('503s once the instance is holding all the games it will', async () => {
    // Per-IP budgets do not bound total memory; a wide enough pool of callers
    // still adds up on a small box.
    installLimits(tightProfile({ createLimit: { limit: 100, windowMs: 60_000 } }));
    for (let i = 0; i < 3; i++) {
      expect((await app.inject({ method: 'POST', url: '/api/lobby' })).statusCode).toBe(201);
    }
    const full = await app.inject({ method: 'POST', url: '/api/lobby' });
    expect(full.statusCode).toBe(503);
    expect(full.json()).toEqual({ error: 'at_capacity' });
  });

  it('hands out a watch token on create, and never on lookup', async () => {
    installLimits(tightProfile({ createLimit: { limit: 100, windowMs: 60_000 } }));
    const create = await app.inject({ method: 'POST', url: '/api/lobby' });
    const body = create.json<{ code: string; watchToken: string }>();
    expect(body.watchToken).toBeTruthy();

    // Anyone holding a code can read this route, so the watch secret must not
    // be on it — otherwise it grants exactly what the code was meant not to.
    const lookup = await app.inject({ method: 'GET', url: `/api/lobby/${body.code}` });
    expect(JSON.stringify(lookup.json())).not.toContain(body.watchToken);
  });
});
