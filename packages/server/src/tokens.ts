import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { Seat } from '@sichuan-mahjong/engine';

export type TokenData = {
  code: string;
  seat: Seat;
  role: 'host' | 'player';
};

const store = new Map<string, TokenData>();

export function issueToken(code: string, seat: Seat, role: 'host' | 'player'): string {
  const token = randomUUID();
  store.set(token, { code, seat, role });
  return token;
}

export function resolveToken(token: string): TokenData | undefined {
  return store.get(token);
}

// ---------------------------------------------------------------------------
// Watch tokens (C5)
// ---------------------------------------------------------------------------

/**
 * Spectator secrets, code → token. **Deliberately a separate store from the
 * seat tokens above, not a third `role`.**
 *
 * A seat token resolves to a seat, and the WS handler reconnects whoever
 * presents one straight into that seat. A watch token that lived in the same
 * map would resolve to *some* seat — and a spectator handing it over as
 * `?token=` would be seated as a player. Keeping the two stores apart makes
 * that confusion unrepresentable rather than something a guard has to catch.
 *
 * Keyed by code so it survives `deleteLobby`, which startGame calls: spectating
 * happens during the game, after the lobby it was issued for is gone.
 */
const watchTokens = new Map<string, string>();

export function issueWatchToken(code: string): string {
  const token = randomUUID();
  watchTokens.set(code, token);
  return token;
}

export function watchTokenFor(code: string): string | undefined {
  return watchTokens.get(code);
}

/** Re-register a watch token on restore, alongside the seat tokens. */
export function importWatchToken(code: string, token: string): void {
  watchTokens.set(code, token);
}

/** Constant-time check, so the response time can't be used to recover a token. */
export function isWatchToken(code: string, candidate: string): boolean {
  const expected = watchTokens.get(code);
  if (expected === undefined || candidate.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
}

/** Drop a single token — e.g. its owner left the lobby for good, so the seat it would reclaim no longer exists. */
export function revokeToken(token: string): void {
  store.delete(token);
}

/** Drop every token belonging to a lobby/room code (called on teardown). */
export function revokeTokensForCode(code: string): void {
  for (const [token, data] of store) {
    if (data.code === code) store.delete(token);
  }
  watchTokens.delete(code);
}

/** All issued tokens belonging to a lobby/room code (for snapshotting). */
export function tokensForCode(code: string): Array<{ token: string } & TokenData> {
  const result: Array<{ token: string } & TokenData> = [];
  for (const [token, data] of store) {
    if (data.code === code) result.push({ token, ...data });
  }
  return result;
}

/** Re-register a token with a known value (used when restoring rooms after restart). */
export function importToken(token: string, data: TokenData): void {
  store.set(token, data);
}
