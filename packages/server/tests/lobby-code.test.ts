import { describe, expect, it, vi } from 'vitest';
// node:sqlite is a native built-in; Vite can't bundle it — mock before room.js loads.
vi.mock('../src/persistence.js', () => ({
  saveGameWithCode: vi.fn(),
  getGame: vi.fn().mockReturnValue(null),
  saveLiveRoom: vi.fn(),
  loadLiveRooms: vi.fn().mockReturnValue([]),
  deleteLiveRoom: vi.fn(),
}));

/**
 * `generateCode` is CSPRNG-backed, so a collision cannot be waited for — 32^4 is
 * ~1.05M. Queueing alphabet indices through `randomInt` makes the next draw a
 * chosen code; an empty queue falls through to the real generator, which is what
 * leaves the distribution tests below testing the real thing.
 */
const { forcedIndices } = vi.hoisted(() => ({ forcedIndices: [] as number[] }));
vi.mock('node:crypto', async importOriginal => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return {
    ...actual,
    randomInt: (max: number) =>
      forcedIndices.length > 0 ? forcedIndices.shift()! : actual.randomInt(max),
  };
});

import { CODE_LENGTH, createLobby, deleteLobby, generateCode } from '../src/lobby.js';
import { createRoom, deleteRoom } from '../src/room.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Make the generator's next draw return `code`. */
function forceNextCode(code: string): void {
  for (const ch of code) forcedIndices.push(ALPHABET.indexOf(ch));
}

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

  it('re-rolls a code a live room holds, not only one a live lobby holds', () => {
    // `startGame` deletes the lobby and leaves the room under the same code, so
    // the lobby store on its own does not know the code is still in use. Handing
    // it to a fresh host resolves their token against the running game. (A51)
    const slots = Array.from({ length: 4 }, (_, i) => ({
      name: `P${i}`,
      isBot: true,
      connected: false,
    }));
    createRoom('AAAA', slots);
    forceNextCode('AAAA');
    forceNextCode('BBBB');

    const lobby = createLobby('host-token');
    expect(lobby.code).toBe('BBBB');

    deleteLobby(lobby.code);
    deleteRoom('AAAA');
  });
});
