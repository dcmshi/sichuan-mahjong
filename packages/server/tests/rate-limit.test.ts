import { describe, expect, it } from 'vitest';
import { profileFor } from '../src/profile.js';
import { createRateLimiter } from '../src/rateLimit.js';

/**
 * `now` is injectable throughout so none of this sleeps — a limiter test that
 * waits out a real window is a slow test that still only proves one boundary.
 */
describe('rate limiter', () => {
  const window = { limit: 3, windowMs: 1000 };

  it('allows up to the limit, then refuses', () => {
    const rl = createRateLimiter(window);
    expect([1, 2, 3].map(() => rl.take('a', 0))).toEqual([true, true, true]);
    expect(rl.take('a', 0)).toBe(false);
  });

  it('counts each key separately', () => {
    const rl = createRateLimiter(window);
    for (let i = 0; i < 3; i++) rl.take('a', 0);
    expect(rl.take('a', 0)).toBe(false);
    expect(rl.take('b', 0)).toBe(true);
  });

  it('starts a fresh window once the old one has passed', () => {
    const rl = createRateLimiter(window);
    for (let i = 0; i < 3; i++) rl.take('a', 0);
    expect(rl.take('a', 999)).toBe(false);
    expect(rl.take('a', 1000)).toBe(true);
  });

  it('reports what is left without spending it', () => {
    const rl = createRateLimiter(window);
    expect(rl.remaining('a', 0)).toBe(3);
    rl.take('a', 0);
    expect(rl.remaining('a', 0)).toBe(2);
    expect(rl.remaining('a', 0)).toBe(2);
    expect(rl.remaining('never-seen', 0)).toBe(3);
  });

  it('drops expired buckets on sweep', () => {
    const rl = createRateLimiter(window);
    rl.take('a', 0);
    rl.take('b', 0);
    expect(rl.size()).toBe(2);
    expect(rl.sweep(500)).toBe(0);
    expect(rl.sweep(1000)).toBe(2);
    expect(rl.size()).toBe(0);
  });

  it('caps its own table rather than growing with the attack it is stopping', () => {
    // The failure this guards: one key per source address, unbounded, is the
    // memory exhaustion the limiter exists to prevent.
    const rl = createRateLimiter(window, { maxKeys: 10 });
    for (let i = 0; i < 500; i++) rl.take(`addr-${i}`, 0);
    expect(rl.size()).toBeLessThanOrEqual(10);
  });

  it('evicts rather than refusing when the table is full', () => {
    // Refusing would let anyone with a wide address pool lock everybody out —
    // a denial of service delivered through the anti-denial-of-service code.
    const rl = createRateLimiter(window, { maxKeys: 4 });
    for (let i = 0; i < 100; i++) expect(rl.take(`addr-${i}`, 0)).toBe(true);
  });

  it('is a no-op when disabled, which is how the suites run', () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1000 }, { enabled: false });
    for (let i = 0; i < 50; i++) expect(rl.take('a', 0)).toBe(true);
    expect(rl.size()).toBe(0);
  });
});

describe('runtime profile', () => {
  it('is stricter hosted than local on every axis', () => {
    const hosted = profileFor(true, {} as NodeJS.ProcessEnv);
    const local = profileFor(false, {} as NodeJS.ProcessEnv);

    expect(hosted.createLimit.limit).toBeLessThan(local.createLimit.limit);
    expect(hosted.joinLimit.limit).toBeLessThan(local.joinLimit.limit);
    expect(hosted.maxConcurrentGames).toBeLessThan(local.maxConcurrentGames);
    expect(hosted.lobbyTtlMs).toBeLessThan(local.lobbyTtlMs);
    expect(hosted.roomIdleTtlMs).toBeLessThan(local.roomIdleTtlMs);
  });

  it('trusts a hop count when hosted and nothing when not', () => {
    // `true` would resolve req.ip to the leftmost X-Forwarded-For entry, which
    // the client writes — every per-IP limit becomes spoofable by header. A hop
    // count takes the address from infrastructure instead.
    const hosted = profileFor(true, {} as NodeJS.ProcessEnv);
    expect(hosted.trustProxy).toBe(1);
    expect(hosted.trustProxy).not.toBe(true);
    expect(profileFor(false, {} as NodeJS.ProcessEnv).trustProxy).toBe(false);
  });

  it('takes a hop override, and ignores junk rather than trusting everything', () => {
    expect(profileFor(true, { SM_TRUST_PROXY: '2' } as NodeJS.ProcessEnv).trustProxy).toBe(2);
    expect(profileFor(true, { SM_TRUST_PROXY: '0' } as NodeJS.ProcessEnv).trustProxy).toBe(0);
    expect(profileFor(true, { SM_TRUST_PROXY: 'yes' } as NodeJS.ProcessEnv).trustProxy).toBe(1);
  });

  it('keeps rate limiting on unless the test seam says otherwise', () => {
    expect(profileFor(true, {} as NodeJS.ProcessEnv).rateLimitEnabled).toBe(true);
    expect(profileFor(false, {} as NodeJS.ProcessEnv).rateLimitEnabled).toBe(true);
    const off = { SM_RATE_LIMIT_OFF: '1' } as NodeJS.ProcessEnv;
    expect(profileFor(false, off).rateLimitEnabled).toBe(false);
  });
});
