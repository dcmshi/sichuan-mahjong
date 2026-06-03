import type { GameState, Seat } from './state.js';
import type { TileId } from './tiles.js';
import { tileTypeOf, suitOf } from './tiles.js';
import { isWinningHand } from './hand.js';
import { calcHandScore } from './scoring.js';

/** Counter-clockwise distance from `from` to `to`. Result is 1..3 for adjacent seats, 0 for same. */
export function ccwDist(from: Seat, to: Seat): number {
  return (from - to + 4) % 4;
}

export type ClaimResolution =
  | { kind: 'hu'; winners: Seat[] }
  | { kind: 'kong'; winner: Seat }
  | { kind: 'pung'; winner: Seat }
  | null;

// ---------------------------------------------------------------------------
// Per-kind eligibility checks (without furiten; furiten checked separately)
// ---------------------------------------------------------------------------

function canHuOnTile(state: GameState, seat: Seat, tile: TileId): boolean {
  const player = state.players[seat]!;
  if (player.voidedSuit !== null && suitOf(tile) === player.voidedSuit) return false;
  return isWinningHand([...player.hand, tile], player.melds, player.voidedSuit) !== null;
}

/**
 * Can `seat` declare Hu on `tile`, honoring the skip-Hu (furiten) rule and its
 * greater-value override (§5.5.5)? A furiten player is normally barred from
 * claiming Hu off a discard until their next self-draw, EXCEPT when the new
 * winning hand's value (fan) strictly exceeds the `minFanToOverride` recorded
 * when they entered furiten.
 */
export function canHuConsideringFuriten(state: GameState, seat: Seat, tile: TileId): boolean {
  const player = state.players[seat]!;
  if (!canHuOnTile(state, seat, tile)) return false;
  if (player.furiten === null) return true;
  const score = calcHandScore(
    [...player.hand, tile],
    player.melds,
    player.voidedSuit,
    tile,
    'normal',
    state.config.fanCap,
    state.config.enableHeavenlyEarthly,
  );
  return score.totalFan > player.furiten.minFanToOverride;
}

export function canKongOnTile(state: GameState, seat: Seat, tile: TileId): boolean {
  const player = state.players[seat]!;
  if (state.wallEndReached) return false;
  if (state.drawIndex > state.kongDrawIndex) return false;
  if (player.voidedSuit !== null && suitOf(tile) === player.voidedSuit) return false;
  const count = player.hand.filter(t => tileTypeOf(t) === tileTypeOf(tile)).length;
  return count >= 3;
}

export function canPungOnTile(state: GameState, seat: Seat, tile: TileId): boolean {
  const player = state.players[seat]!;
  if (player.voidedSuit !== null && suitOf(tile) === player.voidedSuit) return false;
  const count = player.hand.filter(t => tileTypeOf(t) === tileTypeOf(tile)).length;
  return count >= 2;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Auto-pass any seat in the pending claim window that cannot make any eligible claim.
 * Modifies `state.pendingClaims.passed` in place (call on a cloned state).
 * Returns true if every seat is now acted (window can resolve immediately).
 */
export function autoPassIneligible(state: GameState): boolean {
  const w = state.pendingClaims!;
  for (let s = 0; s < 4; s++) {
    const seat = s as Seat;
    if (seat === w.from) continue;
    if (state.players[seat]!.status === 'hu') { w.passed[seat] = true; continue; }
    if (w.passed[seat] || w.claims[seat] !== null) continue;

    const tile = w.tile;

    const canHu = canHuConsideringFuriten(state, seat, tile);
    const canKong = !w.afterKong && canKongOnTile(state, seat, tile);
    const canPung = !w.afterKong && canPungOnTile(state, seat, tile);

    if (!canHu && !canKong && !canPung) {
      w.passed[seat] = true;
    }
  }
  return allSeatsActed(state);
}

/** Check if every non-discarder active seat has either claimed or passed. */
export function allSeatsActed(state: GameState): boolean {
  const w = state.pendingClaims!;
  for (let s = 0; s < 4; s++) {
    const seat = s as Seat;
    if (seat === w.from) continue;
    if (state.players[seat]!.status === 'hu') continue;
    if (!w.passed[seat] && w.claims[seat] === null) return false;
  }
  return true;
}

/** Force-pass all seats that haven't acted yet (called on claimWindowExpire). */
export function forcePassAll(state: GameState): void {
  const w = state.pendingClaims!;
  for (let s = 0; s < 4; s++) {
    const seat = s as Seat;
    if (seat === w.from) continue;
    if (!w.passed[seat] && w.claims[seat] === null) {
      w.passed[seat] = true;
    }
  }
}

/** Resolve the claim window. Returns null if all passed with no valid claims. */
export function resolveWindow(state: GameState): ClaimResolution {
  const w = state.pendingClaims!;
  const huWinners: Seat[] = [];
  let kongWinner: Seat | null = null;
  let pungWinner: Seat | null = null;

  for (let s = 0; s < 4; s++) {
    const seat = s as Seat;
    const c = w.claims[seat];
    if (c === null) continue;
    if (seat === w.from) continue;
    if (state.players[seat]!.status === 'hu') continue;

    const tile = w.tile;

    if (c.kind === 'hu') {
      if (!canHuConsideringFuriten(state, seat, tile)) continue;
      huWinners.push(seat);
    } else if (c.kind === 'kong') {
      if (w.afterKong) continue;
      if (!canKongOnTile(state, seat, tile)) continue;
      if (kongWinner === null || ccwDist(w.from, seat) < ccwDist(w.from, kongWinner)) {
        kongWinner = seat;
      }
    } else if (c.kind === 'pung') {
      if (w.afterKong) continue;
      if (!canPungOnTile(state, seat, tile)) continue;
      if (pungWinner === null || ccwDist(w.from, seat) < ccwDist(w.from, pungWinner)) {
        pungWinner = seat;
      }
    }
  }

  if (huWinners.length > 0) {
    // Sort CCW from discarder (nearest first)
    huWinners.sort((a, b) => ccwDist(w.from, a) - ccwDist(w.from, b));
    return { kind: 'hu', winners: huWinners };
  }
  if (kongWinner !== null) return { kind: 'kong', winner: kongWinner };
  if (pungWinner !== null) return { kind: 'pung', winner: pungWinner };
  return null;
}

/**
 * Return seats that should enter furiten after the window resolves:
 * those who could have claimed Hu but didn't (passed or window expired without claiming).
 */
export function furitenSeatsAfterWindow(state: GameState): Seat[] {
  const w = state.pendingClaims!;
  const result: Seat[] = [];
  for (let s = 0; s < 4; s++) {
    const seat = s as Seat;
    if (seat === w.from) continue;
    if (state.players[seat]!.status === 'hu') continue;
    if (state.players[seat]!.furiten !== null) continue;
    if (w.claims[seat]?.kind === 'hu') continue; // claimed Hu, not skipping
    if (canHuOnTile(state, seat, w.tile)) {
      result.push(seat);
    }
  }
  return result;
}
