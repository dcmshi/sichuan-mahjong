import type { Window } from './profile.js';

/**
 * A fixed-window counter per key, hand-rolled because the need is small and the
 * server's dependency list is worth keeping short.
 *
 * The one non-obvious requirement: **a rate limiter must not itself be the
 * memory-exhaustion vector it exists to prevent.** One key per source address,
 * unbounded, is exactly the allocation an attacker wanted in the first place —
 * so entries expire, and `maxKeys` caps the table by evicting whatever expires
 * soonest rather than by refusing (refusing would let anyone with a wide address
 * pool lock out everybody else).
 */

type Bucket = { count: number; resetAt: number };

export type RateLimiter = {
  /** Record a hit. False means the caller is over its limit for this window. */
  take(key: string, now?: number): boolean;
  /** How many hits remain in the current window, without recording one. */
  remaining(key: string, now?: number): number;
  /** Drop expired buckets. Returns how many went. */
  sweep(now?: number): number;
  size(): number;
};

const DEFAULT_MAX_KEYS = 10_000;

export function createRateLimiter(
  window: Window,
  opts: { enabled?: boolean; maxKeys?: number } = {},
): RateLimiter {
  const { limit, windowMs } = window;
  const enabled = opts.enabled ?? true;
  const maxKeys = opts.maxKeys ?? DEFAULT_MAX_KEYS;
  const buckets = new Map<string, Bucket>();

  function evictOne(): void {
    let oldestKey: string | null = null;
    let oldestAt = Number.POSITIVE_INFINITY;
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt < oldestAt) {
        oldestAt = bucket.resetAt;
        oldestKey = key;
      }
    }
    if (oldestKey !== null) buckets.delete(oldestKey);
  }

  function bucketFor(key: string, now: number): Bucket {
    const existing = buckets.get(key);
    if (existing && existing.resetAt > now) return existing;

    if (!existing && buckets.size >= maxKeys) {
      sweep(now);
      if (buckets.size >= maxKeys) evictOne();
    }
    const fresh: Bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, fresh);
    return fresh;
  }

  function sweep(now = Date.now()): number {
    let dropped = 0;
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) {
        buckets.delete(key);
        dropped++;
      }
    }
    return dropped;
  }

  return {
    take(key, now = Date.now()) {
      if (!enabled) return true;
      const bucket = bucketFor(key, now);
      if (bucket.count >= limit) return false;
      bucket.count++;
      return true;
    },
    remaining(key, now = Date.now()) {
      if (!enabled) return limit;
      const bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) return limit;
      return Math.max(0, limit - bucket.count);
    },
    sweep,
    size: () => buckets.size,
  };
}
