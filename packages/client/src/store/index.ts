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
import { type Lang, loadLang, persistLang } from '../i18n/index.js';
import { clearSession, persistSession } from '../session.js';
import { closeConnection } from '../ws/client.js';

export type Screen =
  | 'landing'
  | 'hostSetup'
  | 'joinForm'
  | 'lobby'
  | 'game'
  | 'roundEnd'
  | 'about'
  | 'spectateForm'
  | 'spectate';

export interface GameStore {
  screen: Screen;

  // Session
  code: string;
  token: string;
  seat: Seat | null;
  isHost: boolean;
  playerName: string;

  // Lobby
  lobbyPlayers: LobbyPlayer[];
  canStart: boolean;

  // Game
  view: PlayerView | null;
  lastEvents: GameEvent[];

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
  setConnected: (v: boolean) => void;
  setReconnecting: (v: boolean) => void;
  setConnectionLost: () => void;
  handleServerMsg: (msg: ServerMsg) => void;
  clearError: () => void;
  resetSession: () => void;
}

export const useStore = create<GameStore>((set, get) => ({
  screen: 'landing',
  code: '',
  token: '',
  seat: null,
  isHost: false,
  playerName: '',
  lobbyPlayers: [],
  canStart: false,
  view: null,
  lastEvents: [],
  spectatorView: null,
  roundResult: null,
  matchScores: {},
  countedRounds: [],
  connected: false,
  reconnecting: false,
  connectionLost: false,
  lastError: null,
  soundEnabled: true,
  lang: loadLang(),
  setLang: lang => {
    persistLang(lang);
    set({ lang });
  },

  goTo: screen => set({ screen }),
  setPlayerName: playerName => set({ playerName }),
  setCode: code => set({ code }),
  setConnected: connected => set({ connected, reconnecting: false, connectionLost: false }),
  setReconnecting: reconnecting => set({ reconnecting }),
  setConnectionLost: () => set({ connectionLost: true, reconnecting: false, connected: false }),
  toggleSound: () => set(s => ({ soundEnabled: !s.soundEnabled })),

  handleServerMsg: msg => {
    switch (msg.t) {
      case 'joined': {
        const isHost = msg.seat === 0 && get().isHost;
        set({ token: msg.token, seat: msg.seat, isHost });
        // Survive a refresh: the seat token is the only way back in. (F2)
        persistSession({ code: get().code, token: msg.token, name: get().playerName, isHost });
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
        if (token) persistSession({ code, token, name: playerName, isHost: msg.isHost });
        break;
      }

      case 'view':
        set({
          view: msg.view,
          lastEvents: msg.events,
          screen: 'game',
        });
        break;

      case 'roundEnd': {
        // Accumulate match scores — but only once per round. A client that
        // reconnects at round end is handed the same result again (the A9 path),
        // and incrementing on every arrival inflated the match totals by that
        // round's delta each time. (A39)
        const { roundIndex } = msg.results;
        if (get().countedRounds.includes(roundIndex)) {
          set({ roundResult: msg.results, screen: 'roundEnd' });
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
          screen: 'roundEnd',
        });
        break;
      }

      case 'spectate':
        set({ spectatorView: msg.view, lastEvents: msg.events, screen: 'spectate' });
        break;

      case 'matchEnd':
        get().resetSession();
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
      seat: null,
      isHost: false,
      lobbyPlayers: [],
      canStart: false,
      view: null,
      lastEvents: [],
      spectatorView: null,
      roundResult: null,
      matchScores: {},
      countedRounds: [],
      connected: false,
      reconnecting: false,
      connectionLost: false,
      lastError: null,
    });
  },
}));
