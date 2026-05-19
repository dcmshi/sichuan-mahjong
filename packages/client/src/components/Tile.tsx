import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { tileTypeOf, tileFromType } from '@sichuan-mahjong/engine';
import type { TileId } from '@sichuan-mahjong/engine';
import { useLongPress } from '../hooks/useLongPress.js';

// Unicode mahjong tile codepoints
const TILE_CHARS: Record<string, string[]> = {
  man: ['🀇', '🀈', '🀉', '🀊', '🀋', '🀌', '🀍', '🀎', '🀏'],
  pin: ['🀙', '🀚', '🀛', '🀜', '🀝', '🀞', '🀟', '🀠', '🀡'],
  sou: ['🀐', '🀑', '🀒', '🀓', '🀔', '🀕', '🀖', '🀗', '🀘'],
};

const SIZE_CLASSES = {
  sm: 'w-8 h-11 text-2xl',
  md: 'w-10 h-14 text-3xl',
  lg: 'w-14 h-20 text-5xl',
  xl: 'w-20 h-28 text-7xl',
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
  const [preview, setPreview] = useState(false);

  const longPress = useLongPress(
    () => setPreview(true),
    onClick ? () => onClick(id) : undefined,
  );

  return (
    <>
      <motion.div
        className={[
          'tile bg-white border-gray-300 text-black select-none',
          SIZE_CLASSES[size],
          lastDiscard ? 'tile-last-discard' : '',
          onClick ? 'cursor-pointer' : 'cursor-default',
        ].filter(Boolean).join(' ')}
        animate={{ y: selected ? -8 : 0, boxShadow: selected ? '0 8px 16px rgba(0,0,0,0.4)' : '0 1px 2px rgba(0,0,0,0.2)' }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        title={`${suit}-${rank}`}
        onPointerDown={longPress.onPointerDown}
        onPointerLeave={() => { longPress.onPointerLeave(); setPreview(false); }}
        onPointerCancel={() => { longPress.onPointerCancel(); setPreview(false); }}
        onPointerUp={() => { longPress.onPointerUp(); setPreview(false); }}
      >
        {char}
      </motion.div>

      {/* Long-press 2× preview */}
      <AnimatePresence>
        {preview && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onPointerUp={() => setPreview(false)}
          >
            <motion.div
              initial={{ scale: 0.5 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.5 }}
              className={`tile bg-white text-black ${SIZE_CLASSES.xl}`}
            >
              {char}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export function TileBack({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return <div className={`tile tile-back ${SIZE_CLASSES[size]}`}>🀫</div>;
}
