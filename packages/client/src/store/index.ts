import { create } from 'zustand';
import type { Seat, PlayerView, GameEvent, LobbyPlayer, RoundResult, ServerMsg } from '@sichuan-mahjong/engine';

export type Screen = 'landing' | 'hostSetup' | 'joinForm' | 'lobby' | 'game' | 'roundEnd' | 'about';

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

  // Round end
  roundResult: RoundResult | null;

  // Cumulative scores across rounds this match (seat → total)
  matchScores: Record<number, number>;

  // Connection status
  connected: boolean;
  reconnecting: boolean;

  // Settings
  soundEnabled: boolean;
  toggleSound: () => void;

  // Actions
  goTo: (s: Screen) => void;
  setPlayerName: (n: string) => void;
  setCode: (c: string) => void;
  setConnected: (v: boolean) => void;
  setReconnecting: (v: boolean) => void;
  handleServerMsg: (msg: ServerMsg) => void;
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
  roundResult: null,
  matchScores: {},
  connected: false,
  reconnecting: false,
  soundEnabled: true,

  goTo: (screen) => set({ screen }),
  setPlayerName: (playerName) => set({ playerName }),
  setCode: (code) => set({ code }),
  setConnected: (connected) => set({ connected, reconnecting: false }),
  setReconnecting: (reconnecting) => set({ reconnecting }),
  toggleSound: () => set(s => ({ soundEnabled: !s.soundEnabled })),

  handleServerMsg: (msg) => {
    switch (msg.t) {
      case 'joined':
        set({
          token: msg.token,
          seat: msg.seat,
          isHost: msg.seat === 0 && get().isHost,
        });
        break;

      case 'lobby':
        set({
          lobbyPlayers: msg.players,
          canStart: msg.canStart,
          isHost: msg.isHost,
        });
        break;

      case 'view':
        set({
          view: msg.view,
          lastEvents: msg.events,
          screen: 'game',
        });
        break;

      case 'roundEnd': {
        // Accumulate match scores
        const prev = get().matchScores;
        const next = { ...prev };
        for (const p of msg.results.players) {
          next[p.seat] = (next[p.seat] ?? 0) + p.scoreDelta;
        }
        set({ roundResult: msg.results, matchScores: next, screen: 'roundEnd' });
        break;
      }

      case 'error':
        console.warn('[server error]', msg.code, msg.message);
        break;
    }
  },

  resetSession: () =>
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
      roundResult: null,
      matchScores: {},
      connected: false,
      reconnecting: false,
    }),
}));
