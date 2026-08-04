import type { Seat } from './state.js';
import type { Tile } from './tiles.js';

export type KongSubtype = 'concealed' | 'exposed' | 'promoted' | 'postponed';

/**
 * A set a player has *laid down*: a pung or a kong, and **never a chow.**
 *
 * Sichuan has no chow claims — Hu > Kong > Pung is the whole priority order, and
 * nothing in the engine has ever constructed one. The union carried a third
 * `chow` variant until A47, which bought two unreachable branches (in
 * `playerSuitCount`, on the flower-pig payment path, and in the client's
 * `meldTileIds`) and an invitation to invent semantics for a set that does not
 * exist.
 *
 * **Not to be confused with `WinShape`'s chow in `hand.ts`, which is real.** A
 * *winning hand* absolutely contains runs; they simply can't be claimed off a
 * discard, so they are never melds. Restoring this variant for symmetry with
 * that one would be re-adding dead code.
 */
export type Meld =
  | { kind: 'pung'; tile: Tile; concealed: boolean; claimedFrom: Seat | null }
  | {
      kind: 'kong';
      tile: Tile;
      subtype: KongSubtype;
      claimedFrom: Seat | null;
      turnDeclared: number;
    };
