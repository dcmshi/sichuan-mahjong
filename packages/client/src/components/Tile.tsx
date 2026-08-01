import { tileFromType, tileTypeOf } from '@sichuan-mahjong/engine';
import type { TileId } from '@sichuan-mahjong/engine';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { useLongPress } from '../hooks/useLongPress.js';
import { useT } from '../i18n/useT.js';

type Translate = ReturnType<typeof useT>;

/**
 * Localized name for a tile, e.g. "3 of Characters". The tile's `alt` stays the
 * internal `man-3` id (e2e selectors key off it), so this is the only thing a
 * screen reader should ever read out. (F16)
 */
export function tileLabel(id: TileId, t: Translate): string {
  const { suit, rank } = tileFromType(tileTypeOf(id));
  return t('tile.label', { rank, suit: t(`tile.${suit}`) });
}

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
  /**
   * When false, the tile attaches no pointer/long-press handlers and is purely
   * visual — used inside a draggable hand (Reorder.Item) where the parent owns
   * the tap + drag gestures, so they don't fight the tile's own handlers.
   */
  interactive?: boolean;
  /** Fill the parent's width (height follows the aspect-ratio) instead of a fixed size. */
  fill?: boolean;
  /**
   * Draw the flat face — glyph on a plain cell — instead of the standalone 3D
   * tile. Used wherever tiles sit flush against each other (hand, melds, discard
   * trays); singletons like the well's last discard keep the 3D art, because a
   * lone tile should look like a lone tile. See `.tile-cell` in index.css.
   */
  flat?: boolean;
};

/**
 * A run of tiles held as one group — your hand, or a meld. Carries the strip's
 * single shadow; see `.tile-run`.
 */
export function TileRun({
  children,
  className = '',
}: { children: React.ReactNode; className?: string }) {
  return <div className={`tile-run ${className}`}>{children}</div>;
}

export function Tile({
  id,
  selected = false,
  lastDiscard = false,
  onClick,
  size = 'md',
  interactive = true,
  fill = false,
  flat = false,
}: TileProps) {
  const { suit, rank } = tileFromType(tileTypeOf(id));
  const src = flat ? `/tiles/flat/${suit}-${rank}.svg` : `/tiles/${suit}-${rank}.svg`;
  const [preview, setPreview] = useState(false);
  const t = useT();
  const label = tileLabel(id, t);

  const longPress = useLongPress(() => setPreview(true), onClick ? () => onClick(id) : undefined);

  const clickable = interactive && onClick !== undefined;
  // Keyboard equivalent of the tap. Without it a tile could only be played
  // with a pointer, and announced itself as the untranslated id "man-3". (F16)
  const a11yProps = clickable
    ? {
        role: 'button',
        tabIndex: 0,
        'aria-label': label,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          onClick?.(id);
        },
      }
    : { role: 'img', 'aria-label': label };

  const pointerProps = interactive
    ? {
        onPointerDown: longPress.onPointerDown,
        onPointerLeave: () => {
          longPress.onPointerLeave();
          setPreview(false);
        },
        onPointerCancel: () => {
          longPress.onPointerCancel();
          setPreview(false);
        },
        onPointerUp: () => {
          longPress.onPointerUp();
          setPreview(false);
        },
        onClick: onClick
          ? () => {
              if (!longPress.pointerHandledRef.current) onClick(id);
            }
          : undefined,
      }
    : {};

  return (
    <>
      <motion.div
        className={[
          'tile select-none overflow-hidden',
          flat ? 'tile-cell' : '',
          fill ? 'w-full' : SIZE_CLASSES[size],
          selected ? 'is-selected' : '',
          lastDiscard ? 'tile-last-discard' : '',
          clickable ? 'cursor-pointer focus-visible:outline focus-visible:outline-2' : '',
          clickable ? 'focus-visible:outline-amber-400' : 'cursor-default',
        ]
          .filter(Boolean)
          .join(' ')}
        animate={{ y: selected ? -10 : 0 }}
        {...(interactive && onClick
          ? { whileHover: { y: selected ? -10 : -3 }, whileTap: { scale: 0.93 } }
          : {})}
        transition={{ type: 'spring', stiffness: 500, damping: 22 }}
        title={label}
        {...a11yProps}
        {...pointerProps}
      >
        {/* alt is the stable internal id, not a name: e2e selectors match on it,
            and the wrapper's aria-label is what gets announced. */}
        <img
          src={src}
          alt={`${suit}-${rank}`}
          className={flat ? 'tile-glyph' : 'tile-face'}
          draggable={false}
        />
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

export function TileBack({
  size = 'md',
  fill = false,
  flat = false,
}: { size?: 'sm' | 'md' | 'lg'; fill?: boolean; flat?: boolean }) {
  return (
    <div className={`tile ${flat ? 'tile-cell' : ''} ${fill ? 'w-full' : SIZE_CLASSES[size]}`}>
      <img
        src={flat ? '/tiles/flat/back.svg' : '/tiles/back.svg'}
        alt=""
        className={flat ? 'tile-glyph' : 'tile-face'}
        draggable={false}
      />
    </div>
  );
}
