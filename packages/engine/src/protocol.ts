import type { GameAction, GameEvent } from './actions.js';
import type { HuRecord, Seat } from './state.js';
import type { PlayerView, SpectatorView } from './views.js';

export type LobbyPlayer = {
  seat: Seat;
  name: string;
  isBot: boolean;
  connected: boolean;
  difficulty?: 'easy' | 'medium';
};

// (A30: an `events: GameEvent[]` field used to ride along here — it was always
// [] and nothing read it.)
export type RoundResult = {
  /**
   * 0-based index of this round within the match. A client can be handed the
   * same round's result more than once (every reconnect at round end replays it,
   * the A9 path), so anything cumulative must be keyed on this rather than
   * incremented on arrival. (A39)
   */
  roundIndex: number;
  players: Array<{ seat: Seat; name: string; scoreDelta: number; hu: HuRecord | null }>;
};

export type ClientMsg =
  | { t: 'join'; name: string }
  | { t: 'leave' }
  | { t: 'addBot'; difficulty: 'easy' | 'medium' }
  | { t: 'kickBot'; seat: Seat }
  | { t: 'startGame' }
  | { t: 'nextRound' }
  | { t: 'endMatch' }
  | { t: 'action'; action: GameAction };

export type ServerMsg =
  | { t: 'joined'; seat: Seat; token: string }
  | { t: 'lobby'; players: LobbyPlayer[]; canStart: boolean; isHost: boolean }
  | { t: 'view'; view: PlayerView; events: GameEvent[] }
  | { t: 'spectate'; view: SpectatorView; events: GameEvent[] }
  | { t: 'roundEnd'; results: RoundResult }
  | { t: 'matchEnd' }
  | { t: 'error'; code: string; message: string };
