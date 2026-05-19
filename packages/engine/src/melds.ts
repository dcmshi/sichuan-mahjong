import type { Tile } from './tiles.js';
import type { Seat } from './state.js';

export type KongSubtype = 'concealed' | 'exposed' | 'promoted' | 'postponed';

export type Meld =
  | { kind: 'pung'; tile: Tile; concealed: boolean; claimedFrom: Seat | null }
  | { kind: 'kong'; tile: Tile; subtype: KongSubtype; claimedFrom: Seat | null; turnDeclared: number }
  | { kind: 'chow'; tiles: [Tile, Tile, Tile] };
