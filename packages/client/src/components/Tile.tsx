import { tileTypeOf, tileFromType } from '@sichuan-mahjong/engine';
import type { TileId } from '@sichuan-mahjong/engine';

// Unicode mahjong tile codepoints
const TILE_CHARS: Record<string, string[]> = {
  man: ['🀇', '🀈', '🀉', '🀊', '🀋', '🀌', '🀍', '🀎', '🀏'],
  pin: ['🀙', '🀚', '🀛', '🀜', '🀝', '🀞', '🀟', '🀠', '🀡'],
  sou: ['🀐', '🀑', '🀒', '🀓', '🀔', '🀕', '🀖', '🀗', '🀘'],
};

export type TileProps = {
  id: TileId;
  selected?: boolean;
  lastDiscard?: boolean;
  onClick?: (id: TileId) => void;
  size?: 'sm' | 'md' | 'lg';
};

export function Tile({ id, selected = false, lastDiscard = false, onClick, size = 'md' }: TileProps) {
  const { suit, rank } = tileFromType(tileTypeOf(id));
  const char = TILE_CHARS[suit]?.[rank - 1] ?? '?';

  const sizeClass = size === 'sm' ? 'w-8 h-11 text-2xl' : size === 'lg' ? 'w-14 h-20 text-5xl' : 'w-10 h-14 text-3xl';

  return (
    <div
      className={[
        'tile bg-white border-gray-300 text-black select-none',
        sizeClass,
        selected ? 'tile-selected' : '',
        lastDiscard ? 'tile-last-discard' : '',
        onClick ? 'cursor-pointer hover:brightness-95 active:scale-95' : 'cursor-default',
      ].filter(Boolean).join(' ')}
      onClick={onClick ? () => onClick(id) : undefined}
      title={`${suit}-${rank}`}
    >
      {char}
    </div>
  );
}

export function TileBack({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = size === 'sm' ? 'w-8 h-11 text-2xl' : size === 'lg' ? 'w-14 h-20 text-5xl' : 'w-10 h-14 text-3xl';
  return (
    <div className={`tile tile-back ${sizeClass}`}>🀫</div>
  );
}
