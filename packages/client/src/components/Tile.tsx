import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { tileTypeOf, tileFromType } from '@sichuan-mahjong/engine';
import type { TileId } from '@sichuan-mahjong/engine';
import { useLongPress } from '../hooks/useLongPress.js';

// Width only — height comes from the tile's aspect-ratio (see .tile in index.css).
const SIZE_CLASSES = {
  sm: 'w-8',
  md: 'w-10',
  lg: 'w-14',
  xl: 'w-20',
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
  const src = `/tiles/${suit}-${rank}.svg`;
  const [preview, setPreview] = useState(false);

  const longPress = useLongPress(
    () => setPreview(true),
    onClick ? () => onClick(id) : undefined,
  );

  return (
    <>
      <motion.div
        className={[
          'tile select-none overflow-hidden',
          SIZE_CLASSES[size],
          selected ? 'is-selected' : '',
          lastDiscard ? 'tile-last-discard' : '',
          onClick ? 'cursor-pointer' : 'cursor-default',
        ].filter(Boolean).join(' ')}
        animate={{ y: selected ? -10 : 0 }}
        {...(onClick ? { whileHover: { y: selected ? -10 : -3 }, whileTap: { scale: 0.93 } } : {})}
        transition={{ type: 'spring', stiffness: 500, damping: 22 }}
        title={`${suit}-${rank}`}
        onPointerDown={longPress.onPointerDown}
        onPointerLeave={() => { longPress.onPointerLeave(); setPreview(false); }}
        onPointerCancel={() => { longPress.onPointerCancel(); setPreview(false); }}
        onPointerUp={() => { longPress.onPointerUp(); setPreview(false); }}
        onClick={onClick ? () => { if (!longPress.pointerHandledRef.current) onClick(id); } : undefined}
      >
        <img src={src} alt={`${suit}-${rank}`} className="tile-face" draggable={false} />
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
              className={`tile overflow-hidden ${SIZE_CLASSES.xl}`}
            >
              <img src={src} alt={`${suit}-${rank}`} className="tile-face" draggable={false} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export function TileBack({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <div className={`tile ${SIZE_CLASSES[size]}`}>
      <img src="/tiles/back.svg" alt="" className="tile-face" draggable={false} />
    </div>
  );
}
