import type { Meld, PublicMeld } from '@sichuan-mahjong/engine';
import { tileToType } from '@sichuan-mahjong/engine';
import type { TileId } from '@sichuan-mahjong/engine';
import { Tile, TileBack } from './Tile.js';

// Build tile IDs from a Meld for display purposes (using canonical tile IDs)
function meldTileIds(meld: Meld): TileId[] {
  if (meld.kind === 'chow') {
    return meld.tiles.map(t => (tileToType(t) * 4) as TileId);
  }
  const base = (tileToType(meld.tile) * 4) as TileId;
  const count = meld.kind === 'kong' ? 4 : 3;
  return Array.from({ length: count }, (_, i) => (base + i) as TileId);
}

// Views carry PublicMeld: a concealed kong arrives with tile: null (its rank is
// secret until round end — A27), and renders as four backs either way.
export function MeldDisplay({ meld }: { meld: PublicMeld }) {
  if (meld.kind === 'kong' && meld.subtype === 'concealed') {
    return (
      <div className="flex gap-0.5">
        <TileBack size="sm" />
        <TileBack size="sm" />
        <TileBack size="sm" />
        <TileBack size="sm" />
      </div>
    );
  }

  const ids = meldTileIds(meld);
  return (
    <div className="flex gap-0.5">
      {ids.map(id => (
        <Tile key={id} id={id} size="sm" />
      ))}
    </div>
  );
}
