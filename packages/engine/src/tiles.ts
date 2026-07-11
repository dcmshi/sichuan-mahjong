import { createRng } from './rng.js';

export type Suit = 'man' | 'pin' | 'sou';
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type Tile = { suit: Suit; rank: Rank };

/** 0..26 — suit * 9 + (rank - 1) */
export type TileType = number;

/** 0..107 — tileType * 4 + copy (0..3) */
export type TileId = number;

const SUITS: readonly Suit[] = ['man', 'pin', 'sou'];

export function tileFromType(t: TileType): Tile {
  return { suit: SUITS[Math.floor(t / 9)] as Suit, rank: ((t % 9) + 1) as Rank };
}

export function tileToType(t: Tile): TileType {
  return SUITS.indexOf(t.suit) * 9 + (t.rank - 1);
}

export function tileTypeOf(id: TileId): TileType {
  return Math.floor(id / 4);
}

export function suitOf(id: TileId): Suit {
  return SUITS[Math.floor(tileTypeOf(id) / 9)] as Suit;
}

export function rankOf(id: TileId): Rank {
  return ((tileTypeOf(id) % 9) + 1) as Rank;
}

/** Returns a new sorted array; does not mutate the input. */
export function sortTiles(ids: TileId[]): TileId[] {
  return [...ids].sort((a, b) => a - b);
}

/** Fisher-Yates shuffle of all 108 TileIds using a seeded PRNG. */
export function buildWall(seed: string): TileId[] {
  const wall: TileId[] = Array.from({ length: 108 }, (_, i) => i);
  const rng = createRng(seed);
  for (let i = wall.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    const tmp = wall[i] as TileId;
    wall[i] = wall[j] as TileId;
    wall[j] = tmp;
  }
  return wall;
}
