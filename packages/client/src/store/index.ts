import type {
  GameEvent,
  LobbyPlayer,
  PlayerView,
  RoundResult,
  Seat,
  ServerMsg,
  SpectatorView,
} from '@sichuan-mahjong/engine';
import { create } from 'zustand';
import { type Lang, applyDocumentLang, loadLang, persistLang } from '../i18n/index.js';
import { clearSession, persistSession } from '../session.js';
import { closeConnection } from '../ws/client.js';

export type HistoryItem = { id: number; event: GameEvent };

/**
 * A round is at most ~80 discards plus claims, so this holds a whole one with
 * room to spare; the cap exists so a very long match can't grow the array
 * without bound rather than to truncate anything a player would look for.
 */
const HISTORY_MAX = 200;

function appendHistory(prev: HistoryItem[], events: GameEvent[]): HistoryItem[] {
  if (events.length === 0) return prev;
  let id = prev.at(-1)?.id ?? 0;
  const added = events.map(event => ({ id: ++id, event }));
  return [...prev, ...added].slice(-HISTORY_MAX);
}

export type Screen =
  | 'landing'
  | 'hostSetup'
  | 'joinForm'
  | 'lobby'
  | 'game'
  | 'roundEnd'
  | 'matchEnd'
  | 'about'
  | 'spectateForm'
  | 'spectate';

export interface GameStore {
  screen: Screen;

  // Session
  code: string;
  token: string;
  /** Spectator secret for this room, held only by the host that created it. (C5) */
  watchToken: string;
  seat: Seat | null;
  isHost: boolean;
  playerName: string;

  // Lobby
  lobbyPlayers: LobbyPlayer[];
  canStart: boolean;

  // Game
  view: PlayerView | null;
  lastEvents: GameEvent[];
  /**
   * Every event of the current round, oldest first, for the history panel.
   * `lastEvents` is the transient batch the feed announces and then forgets; this
   * is what lets a player who looked away find out what they missed, which the
   * feed can't do — it holds two lines for 3.5s, one on a short viewport. (O2)
   *
   * Ids are assigned here because events carry no identity of their own and two
   * identical discards are indistinguishable otherwise. Raw events, not
   * formatted lines: the store has no translator, and a player switching
   * language mid-round should see the whole list switch with them.
   */
  history: HistoryItem[];

  // Spectator
  spectatorView: SpectatorView | null;

  // Round end
  roundResult: RoundResult | null;

  // Cumulative scores across rounds this match (seat → total)
  matchScores: Record<number, number>;
  // Round indices already folded into matchScores — a replayed roundEnd must not
  // be counted twice. (A39)
  countedRounds: number[];

  // Connection status
  connected: boolean;
  reconnecting: boolean;
  /** Set once the socket has stopped retrying — the player needs a way out. (F6) */
  connectionLost: boolean;
  /** Solo-vs-bots game started from the landing screen. */
  isPractice: boolean;

  // Last server rejection. `seq` increments on every arrival so an identical
  // error repeated back-to-back still re-triggers the toast. (F1)
  lastError: { code: string; message: string; seq: number } | null;

  // Settings
  soundEnabled: boolean;
  toggleSound: () => void;
  lang: Lang;
  setLang: (l: Lang) => void;

  // Actions
  goTo: (s: Screen) => void;
  setPlayerName: (n: string) => void;
  setCode: (c: string) => void;
  setWatchToken: (t: string) => void;
  setConnected: (v: boolean) => void;
  setReconnecting: (v: boolean) => void;
  setIsPractice: (v: boolean) => void;
  setConnectionLost: () => void;
  handleServerMsg: (msg: ServerMsg) => void;
  clearError: () => void;
  resetSession: () => void;
}

export const useStore = create<GameStore>((set, get) => ({
  screen: 'landing',
  code: '',
  token: '',
  watchToken: '',
  seat: null,
  isHost: false,
  playerName: '',
  lobbyPlayers: [],
  canStart: false,
  view: null,
  lastEvents: [],
  history: [],
  spectatorView: null,
  roundResult: null,
  matchScores: {},
  countedRounds: [],
  connected: false,
  reconnecting: false,
  connectionLost: false,
  isPractice: false,
  lastError: null,
  soundEnabled: true,
  lang: loadLang(),
  setLang: lang => {
    persistLang(lang);
    applyDocumentLang(lang);
    set({ lang });
  },

  goTo: screen => set({ screen }),
  setPlayerName: playerName => set({ playerName }),
  setCode: code => set({ code }),
  setWatchToken: watchToken => set({ watchToken }),
  setConnected: connected => set({ connected, reconnecting: false, connectionLost: false }),
  setReconnecting: reconnecting => set({ reconnecting }),
  setIsPractice: v => set({ isPractice: v }),
  setConnectionLost: () => set({ connectionLost: true, reconnecting: false, connected: false }),
  toggleSound: () => set(s => ({ soundEnabled: !s.soundEnabled })),

  handleServerMsg: msg => {
    switch (msg.t) {
      case 'joined': {
        const isHost = msg.seat === 0 && get().isHost;
        set({ token: msg.token, seat: msg.seat, isHost });
        // Survive a refresh: the seat token is the only way back in. (F2)
        persistSession({
          code: get().code,
          token: msg.token,
          name: get().playerName,
          isHost,
          isPractice: get().isPractice,
        });
        break;
      }

      case 'lobby': {
        set({
          lobbyPlayers: msg.players,
          canStart: msg.canStart,
          isHost: msg.isHost,
        });
        // `joined` arrives before the host flag is known, so re-persist here —
        // otherwise a refreshed host would come back as an ordinary player. (F2)
        const { code, token, playerName } = get();
        if (token)
          persistSession({
            code,
            token,
            name: playerName,
            isHost: msg.isHost,
            isPractice: get().isPractice,
          });
        break;
      }

      case 'view':
        set({
          view: msg.view,
          lastEvents: msg.events,
          history: appendHistory(get().history, msg.events),
          screen: 'game',
        });
        break;

      case 'roundEnd': {
        // Accumulate match scores — but only once per round. A client that
        // reconnects at round end is handed the same result again (the A9 path),
        // and incrementing on every arrival inflated the match totals by that
        // round's delta each time. (A39)
        // Spectators get the same payload but must not be navigated onto the
        // player round-end screen; they render the reveals in place.
        const screen = get().screen === 'spectate' ? 'spectate' : 'roundEnd';
        const { roundIndex } = msg.results;
        if (get().countedRounds.includes(roundIndex)) {
          set({ roundResult: msg.results, screen });
          break;
        }
        const next = { ...get().matchScores };
        for (const p of msg.results.players) {
          next[p.seat] = (next[p.seat] ?? 0) + p.scoreDelta;
        }
        set({
          roundResult: msg.results,
          matchScores: next,
          countedRounds: [...get().countedRounds, roundIndex],
          // The history panel covers the round in progress, so the finished
          // round's moves are dropped here rather than bleeding into the next
          // one. Only on the first arrival: a replayed roundEnd (the A9
          // reconnect path) takes the branch above and touches nothing.
          history: [],
          screen,
        });
        break;
      }

      case 'spectate':
        set({
          spectatorView: msg.view,
          lastEvents: msg.events,
          history: appendHistory(get().history, msg.events),
          screen: 'spectate',
        });
        break;

      case 'matchEnd':
        // Used to call resetSession(), which dropped everyone straight back to
        // the landing screen with no standings and no idea what happened. Keep
        // matchScores and the last roundResult (for names) for the recap. (F9)
        closeConnection();
        clearSession();
        set({
          screen: 'matchEnd',
          token: '',
          view: null,
          spectatorView: null,
          connected: false,
          reconnecting: false,
          connectionLost: false,
        });
        break;

      case 'error':
        set({
          lastError: {
            code: msg.code,
            message: msg.message,
            seq: (get().lastError?.seq ?? 0) + 1,
          },
        });
        break;
    }
  },

  clearError: () => set({ lastError: null }),

  resetSession: () => {
    closeConnection(); // drop the live socket so it doesn't linger/reconnect
    clearSession();
    set({
      screen: 'landing',
      code: '',
      token: '',
      watchToken: '',
      seat: null,
      isHost: false,
      lobbyPlayers: [],
      canStart: false,
      view: null,
      lastEvents: [],
      history: [],
      spectatorView: null,
      roundResult: null,
      matchScores: {},
      countedRounds: [],
      connected: false,
      reconnecting: false,
      connectionLost: false,
      isPractice: false,
      lastError: null,
    });
  },
}));
