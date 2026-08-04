import type { PlayerView, PublicPlayer, Seat, TileId } from '@sichuan-mahjong/engine';

/** A seat's discards, split the way every tray draws them. */
export type SplitPile = {
  /** The void declaration, held out of the pile and set above it. */
  voidDiscard: TileId | null;
  /** Everything after the declaration, oldest first. */
  pile: TileId[];
};

/**
 * `firstDiscardIsVoid` is false until that seat flips the tile — which is when a
 * real table learns it — so `voidDiscard: null` means either "not flipped yet"
 * or "declared a suit they held none of", and neither is a tile to draw. Callers
 * test `pendingFirstDiscard` separately for the face-down back.
 *
 * Structurally typed rather than taking `PublicPlayer`, because the spectator
 * view has its own player type carrying the same two fields.
 */
export function splitPile(p: {
  discards: readonly TileId[];
  firstDiscardIsVoid: boolean;
}): SplitPile {
  if (!p.firstDiscardIsVoid) return { voidDiscard: null, pile: [...p.discards] };
  return { voidDiscard: p.discards[0] ?? null, pile: p.discards.slice(1) };
}

/** One cell of a river. `null` is the declaration, still face down. (A37) */
export type RiverCell = { id: TileId; declared: boolean } | null;

export type River = {
  /** Oldest first, the declaration heading it when there is one. */
  cells: RiverCell[];
  /** Ordinary discards the cap dropped off the *old* end, for the `+N` badge. */
  hidden: number;
  /**
   * Whether the river carries a declaration at all — flipped or still face down.
   * `OwnZone` draws a ghost when it doesn't and you declared anyway. (N43)
   */
  hasDeclaration: boolean;
};

/**
 * A seat's river as every tray draws it: the declaration pinned at the head,
 * then as many ordinary discards as `cap` leaves room for, oldest first.
 *
 * **The declaration is pinned, so what a cap drops is the oldest *ordinary*
 * discards and never the one tile that says what this seat declared.** It is
 * that seat's first discard, which is where a table puts it.
 *
 * `cap` is the total cell count including the declaration — `null` for your own
 * river, which is uncapped because furiten is decided by what you have already
 * discarded. The three trays each had their own copy of this until A44, and it is
 * the code N42, N43 and N44 each got wrong in a different seat.
 *
 * Structurally typed for the same reason `splitPile` is.
 */
export function riverCells(
  p: {
    discards: readonly TileId[];
    firstDiscardIsVoid: boolean;
    pendingFirstDiscard: boolean;
  },
  cap: number | null = null,
): River {
  const { voidDiscard, pile } = splitPile(p);
  const hasDeclaration = p.pendingFirstDiscard || voidDiscard !== null;
  const room = cap === null ? pile.length : cap - (hasDeclaration ? 1 : 0);
  // `slice(-0)` is `slice(0)` and returns the whole array, so a cap with no room
  // left would show everything rather than nothing. None of the three call sites
  // could reach it — the smallest cap was 9 — but a shared helper shouldn't
  // carry the trap forward.
  const shown = room <= 0 ? [] : pile.slice(-room);
  return {
    cells: [
      ...(hasDeclaration
        ? [voidDiscard === null ? null : { id: voidDiscard, declared: true }]
        : []),
      ...shown.map(id => ({ id, declared: false })),
    ],
    hidden: pile.length - shown.length,
    hasDeclaration,
  };
}

/**
 * The seat a pile was opened for. `you` and `others` are separate fields of the
 * view, and the four places that open a pile don't agree on which one they hold.
 */
export function playerAt(view: PlayerView, seat: Seat): PublicPlayer | null {
  if (view.you.seat === seat) return view.you;
  return view.others.find(o => o.seat === seat) ?? null;
}
