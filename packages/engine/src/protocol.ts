import type { GameAction, GameEvent } from './actions.js';
import type { Meld } from './melds.js';
import type { HuRecord, LedgerEntry, Seat } from './state.js';
import type { TileId } from './tiles.js';
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
  players: Array<{
    seat: Seat;
    name: string;
    scoreDelta: number;
    hu: HuRecord | null;
    /** Concealed hand, revealed: RoundResult is only built once the round ended. */
    hand: TileId[];
    /** Fully revealed, including concealed kongs (secret only until now — A27). */
    melds: Meld[];
    /** Whether this seat was ready at the wall end — what explains a bu-ting line. */
    isReady: boolean;
    /** Every ledger entry where this seat is the payer or the payee. */
    ledger: LedgerEntry[];
  }>;
};

export type ClientMsg =
  | { t: 'join'; name: string }
  | { t: 'leave' }
  | { t: 'addBot'; difficulty: 'easy' | 'medium' }
  | { t: 'kickBot'; seat: Seat }
  /**
   * `rules` carries the host's house-rule choices for the match. Optional so an
   * older client (or a rejoining one) still starts a game on the defaults, and
   * every field is validated at the WS boundary — `ws.ts` trusts nothing.
   */
  | { t: 'startGame'; rules?: { huanSanZhang?: boolean } }
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
