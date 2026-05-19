import type { Seat, HuRecord } from './state.js';
import type { GameAction, GameEvent } from './actions.js';
import type { PlayerView } from './views.js';

export type LobbyPlayer = {
  seat: Seat;
  name: string;
  isBot: boolean;
  connected: boolean;
};

export type RoundResult = {
  players: Array<{ seat: Seat; name: string; scoreDelta: number; hu: HuRecord | null }>;
  events: GameEvent[];
};

export type ClientMsg =
  | { t: 'join'; name: string }
  | { t: 'leave' }
  | { t: 'addBot'; difficulty: 'easy' | 'medium' }
  | { t: 'kickBot'; seat: Seat }
  | { t: 'startGame' }
  | { t: 'action'; action: GameAction };

export type ServerMsg =
  | { t: 'joined'; seat: Seat; token: string }
  | { t: 'lobby'; players: LobbyPlayer[]; canStart: boolean; isHost: boolean }
  | { t: 'view'; view: PlayerView; events: GameEvent[] }
  | { t: 'roundEnd'; results: RoundResult }
  | { t: 'error'; code: string; message: string };
