import './index.css';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { useStore } from './store/index.js';
import { sendAction } from './ws/client.js';
import { tileTypeOf, tileFromType } from '@sichuan-mahjong/engine';
import type { Suit } from '@sichuan-mahjong/engine';

const el = document.getElementById('root');
if (!el) throw new Error('No #root element');
createRoot(el).render(<App />);

// E2E test helpers — exposed on window so Playwright tests can bypass UI interactions
// (required because Framer Motion 12 consumes pointer events before React can process them).
// Only attached in dev or e2e builds (VITE_E2E=1) so they never ship in releases.
if (import.meta.env.DEV || import.meta.env.VITE_E2E) {
(window as unknown as Record<string, unknown>).__e2e = {
  huanSubmit(): boolean {
    const view = useStore.getState().view;
    if (!view || view.phase !== 'huan') return false;
    const { hand, seat } = view.you;
    const bySuit: Record<string, number[]> = { man: [], pin: [], sou: [] };
    for (const id of hand) {
      const { suit } = tileFromType(tileTypeOf(id));
      bySuit[suit]!.push(id);
    }
    for (const tiles of Object.values(bySuit)) {
      if (tiles.length >= 3) {
        sendAction({ t: 'action', action: { t: 'huanSelect', seat, tiles: tiles.slice(0, 3) as [number, number, number] } });
        return true;
      }
    }
    return false;
  },

  voidSubmit(): boolean {
    const view = useStore.getState().view;
    if (!view || view.phase !== 'voidDeclare') return false;
    const { hand, seat } = view.you;
    const bySuit: Record<string, number[]> = { man: [], pin: [], sou: [] };
    for (const id of hand) {
      const { suit } = tileFromType(tileTypeOf(id));
      bySuit[suit]!.push(id);
    }
    // Pick suit with fewest tiles to minimize mandatory discards
    const [suit, tiles] = (Object.entries(bySuit) as [Suit, number[]][]).sort(([, a], [, b]) => a.length - b.length)[0]!;
    const firstDiscard = tiles[0] ?? null;
    sendAction({ t: 'action', action: { t: 'declareVoid', seat, suit, firstDiscard } });
    return true;
  },

  autoPlay(): boolean {
    const view = useStore.getState().view;
    if (!view || view.phase !== 'play') return false;
    const { seat } = view.you;
    const actions = view.yourLegalActions;

    if (view.claimDeadline !== null) {
      const hu = actions.find(a => a.t === 'claim' && a.claim.kind === 'hu');
      const pass = actions.find(a => a.t === 'pass');
      const act = hu ?? pass;
      if (act) { sendAction({ t: 'action', action: act }); return true; }
      return false;
    }

    if (view.turn === seat) {
      const hu = actions.find(a => a.t === 'declareHuOnDraw' || a.t === 'declareHeavenly');
      const discard = actions.find(a => a.t === 'discard');
      const act = hu ?? discard;
      if (act) { sendAction({ t: 'action', action: act }); return true; }
    }

    return false;
  },

  getPhase(): string | null {
    return useStore.getState().view?.phase ?? null;
  },

  getScreen(): string {
    return useStore.getState().screen;
  },
};
}
