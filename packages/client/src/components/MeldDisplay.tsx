import type { Meld, PublicMeld } from '@sichuan-mahjong/engine';
import { tileToType } from '@sichuan-mahjong/engine';
import type { TileId } from '@sichuan-mahjong/engine';
import { useT } from '../i18n/useT.js';
import { Tile, TileBack, TileRun } from './Tile.js';

// Build tile IDs from a Meld for display purposes (using canonical tile IDs)
function meldTileIds(meld: Meld): TileId[] {
  if (meld.kind === 'chow') {
    return meld.tiles.map(t => (tileToType(t) * 4) as TileId);
  }
  const base = (tileToType(meld.tile) * 4) as TileId;
  const count = meld.kind === 'kong' ? 4 : 3;
  return Array.from({ length: count }, (_, i) => (base + i) as TileId);
}

/**
 * A group of tiles with a corner badge naming it. Four bare tiles are hard to
 * tell from a fragment of a hand at a glance, and at round end melds render
 * right beside the hand they belong to. (F23)
 */
function BadgedGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative">
      <TileRun>{children}</TileRun>
      <span className="absolute -top-1 -right-1 px-1 rounded bg-amber-500 text-black text-[8px] font-bold leading-tight">
        {label}
      </span>
    </div>
  );
}

/**
 * How a meld should be drawn.
 *
 * `ids: null` means draw four backs — the only case is a concealed kong while
 * the round is live, whose rank is secret and arrives as `tile: null` (A27).
 * Once the round settles the real tile is sent, in the round-end views and in
 * RoundResult, and it must be shown: keying this off `subtype === 'concealed'`
 * instead of off the tile drew backs in both cases, so the round-end hand
 * reveal showed four blanks with the tile to reveal sitting in the payload.
 *
 * Exported so it can be tested — the client suite runs in Node with no DOM.
 */
export function meldRender(meld: PublicMeld): { ids: TileId[] | null; badged: boolean } {
  if (meld.kind === 'kong' && meld.tile === null) return { ids: null, badged: true };
  // A revealed concealed kong keeps the badge: it is a declared group rather
  // than four loose tiles, which reads even less clearly once the faces show
  // next to a hand.
  const badged = meld.kind === 'kong' && meld.subtype === 'concealed';
  return { ids: meldTileIds(meld), badged };
}

/**
 * A meld in an 80px column — the side opponents' form. They used to render no
 * melds at all, so a player who had ponged simply had a smaller hand for no
 * visible reason; but three flush `sm` tiles are ~96px and would spill the
 * column the way their discard tray did before R6. One tile with the meld's name
 * fits, and carries what a player actually reads off an opponent's melds: which
 * tile they've locked away. The kind implies the count.
 *
 * `sideways` turns it the way that seat's discards already lie. It is the same
 * art in a landscape box, so it stands 32px instead of 38.9 — 7px back per meld
 * row in the column where height is scarce — and two of them are 77.7px, which
 * still fits the 80px width. The badge stays upright: it is read, not placed on
 * a table. (N38)
 */
export function MeldChip({ meld, sideways = false }: { meld: PublicMeld; sideways?: boolean }) {
  const t = useT();
  const { ids } = meldRender(meld);
  return (
    <div className="relative flex-shrink-0">
      {ids === null || ids[0] === undefined ? (
        <TileBack size="sm" sideways={sideways} />
      ) : (
        <Tile id={ids[0]} size="sm" interactive={false} sideways={sideways} />
      )}
      <span className="absolute -bottom-1 -right-1 px-0.5 rounded bg-amber-500 text-black text-[8px] font-bold leading-tight">
        {t(meld.kind === 'kong' ? 'claim.kong' : 'claim.pung')}
      </span>
    </div>
  );
}

export function MeldDisplay({ meld }: { meld: PublicMeld }) {
  const t = useT();
  const { ids, badged } = meldRender(meld);

  const tiles =
    ids === null
      ? Array.from({ length: 4 }, (_, i) => <TileBack key={i} size="sm" />)
      : ids.map(id => <Tile key={id} id={id} size="sm" />);

  // A meld is a declared group, so it is drawn as one flush run rather than
  // spaced tiles — which is also how it sits on a real table.
  return badged ? (
    <BadgedGroup label={t('claim.kong')}>{tiles}</BadgedGroup>
  ) : (
    <TileRun>{tiles}</TileRun>
  );
}
