import type { Seat } from '@sichuan-mahjong/engine';

// Alphabet excludes I, O, 0, 1 to avoid confusion
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export type LobbySlot = {
  name: string;
  isBot: boolean;
  token: string;
  connected: boolean;
  difficulty?: 'easy' | 'medium';
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
  let code: string;
  do {
    code = generateCode();
  } while (store.has(code));

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
