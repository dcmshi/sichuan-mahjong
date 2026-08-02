import { describe, expect, it } from 'vitest';
import { CODE_LENGTH, createLobby, deleteLobby, generateCode } from '../src/lobby.js';

/**
 * The room code is the whole access control — there are no accounts, so holding
 * the code is what admits you. These assert the shape a player relies on (short,
 * unambiguous, case-handled by the caller) and the distribution properties that
 * make guessing impractical. They cannot prove the source is a CSPRNG; that is
 * what reading `generateCode` is for.
 */
describe('room codes', () => {
  it('is four characters from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      // No I/O/0/1 — they are the pairs that get misread aloud or mistyped.
      expect(generateCode()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
    }
    expect(CODE_LENGTH).toBe(4);
  });

  it('does not repeat itself across a large sample', () => {
    // 32^4 is ~1.05M, so 2000 draws should collide vanishingly rarely. A
    // generator stuck on a constant or a short cycle fails here loudly.
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) seen.add(generateCode());
    expect(seen.size).toBeGreaterThan(1990);
  });

  it('uses the whole alphabet in every position', () => {
    // Catches an off-by-one in the range that would quietly shrink the keyspace
    // — e.g. randomInt(len - 1), which can never emit the last character.
    const perPosition = Array.from({ length: CODE_LENGTH }, () => new Set<string>());
    for (let i = 0; i < 4000; i++) {
      const code = generateCode();
      for (let p = 0; p < CODE_LENGTH; p++) perPosition[p].add(code[p]);
    }
    for (const [p, chars] of perPosition.entries()) {
      expect(chars.size, `position ${p}`).toBe(32);
    }
  });

  it('never hands out a code that is already in use', () => {
    const codes = new Set<string>();
    const lobbies = Array.from({ length: 300 }, () => createLobby('host-token'));
    for (const lobby of lobbies) {
      expect(codes.has(lobby.code)).toBe(false);
      codes.add(lobby.code);
    }
    for (const lobby of lobbies) deleteLobby(lobby.code);
  });
});
