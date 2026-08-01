import { applyAction } from '../../src/actions.js';
import { isWinningHand } from '../../src/hand.js';
import { type DEFAULT_CONFIG, createGame } from '../../src/state.js';
import type { Seat } from '../../src/state.js';
import { suitOf } from '../../src/tiles.js';

// Plain module (no `.test.` in the filename), so Vitest's default include
// glob (`**/*.{test,spec}.?(c|m)[jt]s?(x)`) does not collect it as a test
// file — importing it does not re-register any describe/it blocks.
export function runFullGame(seed: string, config?: Partial<typeof DEFAULT_CONFIG>) {
  let state = createGame(
    seed,
    [
      { name: 'P0', isBot: true },
      { name: 'P1', isBot: true },
      { name: 'P2', isBot: true },
      { name: 'P3', isBot: true },
    ],
    { enableHuanSanZhang: false, voidDiscardRule: 'strict', ...config },
  );

  // Void declarations
  for (let i = 0; i < 4; i++) {
    const seat = i as Seat;
    const player = state.players[seat]!;
    const counts: Record<string, number> = { man: 0, pin: 0, sou: 0 };
    for (const t of player.hand) counts[suitOf(t)]!++;
    const voidSuit = (['man', 'pin', 'sou'] as const).reduce((a, b) =>
      counts[a]! <= counts[b]! ? a : b,
    );
    const firstDiscard = player.hand.find(t => suitOf(t) === voidSuit) ?? null;
    const r = applyAction(state, { t: 'declareVoid', seat, suit: voidSuit, firstDiscard });
    if (!r.ok) throw new Error(`declareVoid failed: ${r.reason}`);
    state = r.state;
  }

  let safety = 15_000;
  while (state.phase === 'play') {
    if (--safety <= 0) throw new Error('safety limit reached');

    if (state.pendingClaims !== null) {
      const exp = applyAction(state, { t: 'claimWindowExpire' });
      if (!exp.ok) throw new Error(`claimWindowExpire: ${exp.reason}`);
      state = exp.state;
      continue;
    }

    const seat = state.turn;
    const isEastFirstTurn = seat === state.dealer && !state.firstTurnDone[seat];

    if (!isEastFirstTurn && state.turnDrawNeeded) {
      const dr = applyAction(state, { t: 'draw', seat });
      if (!dr.ok) throw new Error(`draw: ${dr.reason}`);
      state = dr.state;
      if (state.phase !== 'play') break;
    }

    if (state.pendingClaims !== null) continue;

    const currentPlayer = state.players[seat]!;
    if (isWinningHand(currentPlayer.hand, currentPlayer.melds, currentPlayer.voidedSuit)) {
      const hr = applyAction(state, { t: 'declareHuOnDraw', seat });
      if (hr.ok) {
        state = hr.state;
        continue;
      }
    }

    // The separated face-down tile is the mandatory first discard. (A35)
    if (currentPlayer.pendingFirstDiscard !== null) {
      const flip = applyAction(state, { t: 'flipFirstDiscard', seat });
      if (!flip.ok) throw new Error(`flipFirstDiscard: ${flip.reason}`);
      state = flip.state;
      continue;
    }
    const voidTiles = currentPlayer.hand.filter(t => suitOf(t) === currentPlayer.voidedSuit);
    const tile = voidTiles.length > 0 ? voidTiles[0]! : currentPlayer.hand[0]!;
    const disc = applyAction(state, { t: 'discard', seat, tile });
    if (!disc.ok) throw new Error(`discard: ${disc.reason}`);
    state = disc.state;
  }

  return state;
}
