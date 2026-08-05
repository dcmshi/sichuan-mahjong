import { randomInt } from 'node:crypto';
import type { BotDifficulty, Seat } from '@sichuan-mahjong/engine';
import { getRoom } from './room.js';

// Alphabet excludes I, O, 0, 1 to avoid confusion
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 4;

/**
 * A room code is a bearer capability: holding it is what lets you join or watch,
 * because the app has no accounts. So it has to be unpredictable, not merely
 * random-looking — `Math.random()` is xorshift128+, whose state is recoverable
 * from a run of outputs, and anyone can harvest outputs by creating lobbies.
 * That leaks *other people's future codes*, which is worse than the 32^4 space
 * being guessable. On a tailnet neither mattered; on a public URL both do.
 *
 * `randomInt` is CSPRNG-backed and rejection-samples, so it stays uniform for
 * any alphabet length (this one is 32, so there'd be no modulo bias either way —
 * but the next person to edit the alphabet shouldn't have to know that).
 */
export function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

export type LobbySlot = {
  name: string;
  isBot: boolean;
  token: string;
  connected: boolean;
  difficulty?: BotDifficulty;
};

export type Lobby = {
  code: string;
  hostToken: string;
  slots: (LobbySlot | null)[]; // length 4, index = seat
  started: boolean;
  createdAt: number; // for the stale-lobby sweep (A29)
};

const store = new Map<string, Lobby>();

export function createLobby(hostToken: string): Lobby {
  // The room store as well as the lobby store: `startGame` deletes the lobby and
  // leaves the room live under the same code, so a code still very much in use is
  // absent from `store`. Re-issuing one resolves the new host's token against the
  // running game and seats them into another player's hand. `room.ts` imports
  // nothing from here, so this direction has no cycle. (A51)
  let code: string;
  do {
    code = generateCode();
  } while (store.has(code) || getRoom(code) !== undefined);

  const lobby: Lobby = {
    code,
    hostToken,
    slots: [null, null, null, null],
    started: false,
    createdAt: Date.now(),
  };
  store.set(code, lobby);
  return lobby;
}

/** All lobbies currently in the store (for the stale-lobby sweep). */
export function allLobbies(): Lobby[] {
  return [...store.values()];
}

export function getLobby(code: string): Lobby | undefined {
  return store.get(code);
}

export function deleteLobby(code: string): void {
  store.delete(code);
}

/**
 * First open seat, or null if full. With `skipHostSeat`, seat 0 (the host seat)
 * is never returned — used so non-host joiners can't occupy the host's seat. (A8)
 */
export function findOpenSeat(lobby: Lobby, opts?: { skipHostSeat?: boolean }): Seat | null {
  const start = opts?.skipHostSeat ? 1 : 0;
  for (let i = start; i < 4; i++) {
    if (lobby.slots[i] === null) return i as Seat;
  }
  return null;
}

export function canStart(lobby: Lobby): boolean {
  return lobby.slots.every(s => s !== null);
}
