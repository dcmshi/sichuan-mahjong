import { randomUUID } from 'node:crypto';
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

export function revokeToken(token: string): void {
  store.delete(token);
}

/** Drop every token belonging to a lobby/room code (called on teardown). */
export function revokeTokensForCode(code: string): void {
  for (const [token, data] of store) {
    if (data.code === code) store.delete(token);
  }
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
