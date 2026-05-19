import { create } from 'zustand';
import type { Seat, PlayerView, GameEvent, LobbyPlayer, RoundResult, ServerMsg } from '@sichuan-mahjong/engine';

export type Screen = 'landing' | 'hostSetup' | 'joinForm' | 'lobby' | 'game' | 'roundEnd';

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

  // Connection status
  connected: boolean;
  reconnecting: boolean;

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
  connected: false,
  reconnecting: false,

  goTo: (screen) => set({ screen }),
  setPlayerName: (playerName) => set({ playerName }),
  setCode: (code) => set({ code }),
  setConnected: (connected) => set({ connected, reconnecting: false }),
  setReconnecting: (reconnecting) => set({ reconnecting }),

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

      case 'roundEnd':
        set({ roundResult: msg.results, screen: 'roundEnd' });
        break;

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
      connected: false,
      reconnecting: false,
    }),
}));
