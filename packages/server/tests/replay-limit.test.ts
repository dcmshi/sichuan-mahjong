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
import { installLimits } from '../src/limits.js';
import { profileFor } from '../src/profile.js';

/**
 * The suite runs with SM_RATE_LIMIT_OFF (see vitest.config.ts), so — following
 * limits.test.ts — this installs its own profile with the ceiling made tiny
 * rather than making the test patient.
 */
function tightProfile() {
  return {
    ...profileFor(false, {} as NodeJS.ProcessEnv),
    joinLimit: { limit: 3, windowMs: 60_000 },
    rateLimitEnabled: true,
  };
}

async function buildApp() {
  const app = Fastify({ logger: false });
  await registerHttpRoutes(app);
  return app;
}

describe('/api/replay/:id (M2)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    app = await buildApp();
  });
  afterEach(async () => {
    installLimits(profileFor(false)); // restore the suite-wide (disabled) limiter
    await app.close();
  });

  it('still answers a well-formed id', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/replay/1' });
    // Persistence is mocked empty, so 404 is the honest answer rather than a leak.
    expect(res.statusCode).toBe(404);
  });

  it('rejects a non-numeric id before reaching storage', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/replay/abc' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'invalid_id' });
  });

  it('spends the join budget, so it is no longer the one route with none', async () => {
    installLimits(tightProfile());
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({ method: 'GET', url: `/api/replay/${i + 1}` });
      codes.push(res.statusCode);
    }
    // Three get through on a budget of three; the rest are refused.
    expect(codes.filter(c => c === 404)).toHaveLength(3);
    expect(codes.filter(c => c === 429)).toHaveLength(2);
  });

  it('shares that budget with lobby lookups rather than getting its own', async () => {
    installLimits(tightProfile());
    await app.inject({ method: 'GET', url: '/api/lobby/ZZZZ' });
    await app.inject({ method: 'GET', url: '/api/lobby/ZZZZ' });
    await app.inject({ method: 'GET', url: '/api/replay/1' });
    // Budget of three is now spent, whichever route spent it.
    const res = await app.inject({ method: 'GET', url: '/api/replay/2' });
    expect(res.statusCode).toBe(429);
  });
});
