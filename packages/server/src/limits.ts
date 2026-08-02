import type { FastifyRequest } from 'fastify';
import { allLobbies } from './lobby.js';
import { type RuntimeProfile, profileFor } from './profile.js';
import { type RateLimiter, createRateLimiter } from './rateLimit.js';
import { roomCount } from './room.js';

/**
 * The process-wide limiters, installed once at boot from the active profile.
 *
 * These are shared rather than per-route because the thing being limited is a
 * *client*, not an endpoint: guessing codes over `GET /api/lobby/:code` and
 * guessing them by opening sockets are the same attack, and giving each its own
 * budget would just double the allowance.
 */

let creates: RateLimiter = createRateLimiter(profileFor(false).createLimit);
let joins: RateLimiter = createRateLimiter(profileFor(false).joinLimit);
let active: RuntimeProfile = profileFor(false);

export function installLimits(profile: RuntimeProfile): void {
  active = profile;
  const enabled = profile.rateLimitEnabled;
  creates = createRateLimiter(profile.createLimit, { enabled });
  joins = createRateLimiter(profile.joinLimit, { enabled });
}

/**
 * The key a limit is counted against.
 *
 * `req.ip` is only as trustworthy as the `trustProxy` setting that produced it
 * — see the note on `RuntimeProfile.trustProxy`. With no proxy configured this
 * is the socket address, which a client cannot forge over TCP.
 */
export function clientKey(req: Pick<FastifyRequest, 'ip'>): string {
  return req.ip || 'unknown';
}

export function allowCreate(key: string): boolean {
  return creates.take(key);
}

export function allowJoin(key: string): boolean {
  return joins.take(key);
}

/**
 * Whether the instance is already holding as many games as it will. Per-IP
 * limits alone do not bound total memory: a botnet, or simply a lot of honest
 * traffic, still adds up on a 512MB box.
 */
export function atGameCapacity(): boolean {
  return allLobbies().length + roomCount() >= active.maxConcurrentGames;
}

export function sweepLimiters(): number {
  return creates.sweep() + joins.sweep();
}

/** For tests and diagnostics. */
export function limiterSizes(): { creates: number; joins: number } {
  return { creates: creates.size(), joins: joins.size() };
}
