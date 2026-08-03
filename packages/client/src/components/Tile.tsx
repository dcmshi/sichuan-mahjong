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
// Not Tailwind's w-*: inside a run the layout box shrinks to the pitch while the
// art keeps this size, and that needs the width as a custom property.
const SIZE_CLASSES = {
  sm: 'tile-sized tile-sm',
  md: 'tile-sized tile-md',
  lg: 'tile-sized tile-lg',
  xl: 'tile-sized tile-xl',
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
   * The void-suit tile this seat set aside at declaration and flipped on turn 1 —
   * the first tile in their tray, and the only public statement of what they
   * declared. Marked so the table can read it back at a glance.
   */
  voidDiscard?: boolean;
  /**
   * Drawn a quarter turn, for the seats sitting at right angles to you. The box
   * carries the landscape footprint and the art is rotated inside it, so the tile
   * measures as what it draws — see `.tile-sideways`. (N10)
   */
  sideways?: boolean;
};

/**
 * A run of tiles held as one group — your hand, or a meld. Carries the strip's
 * single shadow, and laps its tiles so the run shows one shared edge rather than
 * a bevel per tile; see `.tile-run` and `.tile-lap`.
 */
export function TileRun({
  children,
  className = '',
}: { children: React.ReactNode; className?: string }) {
  return <div className={`tile-run tile-lap ${className}`}>{children}</div>;
}

export function Tile({
  id,
  selected = false,
  lastDiscard = false,
  onClick,
  size = 'md',
  interactive = true,
  fill = false,
  voidDiscard = false,
  sideways = false,
}: TileProps) {
  const { suit, rank } = tileFromType(tileTypeOf(id));
  const src = `/tiles/${suit}-${rank}.svg`;
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
          // No overflow clipping: in a run the art is drawn wider than its box
          // and bleeds left over the tile before it.
          'tile select-none',
          fill ? 'w-full' : SIZE_CLASSES[size],
          sideways ? 'tile-sideways' : '',
          selected ? 'is-selected' : '',
          lastDiscard ? 'tile-last-discard' : '',
          voidDiscard ? 'tile-void-discard' : '',
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
              className={`tile ${SIZE_CLASSES.xl}`}
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
  sideways = false,
}: { size?: 'sm' | 'md' | 'lg'; fill?: boolean; sideways?: boolean }) {
  return (
    <div
      className={['tile', fill ? 'w-full' : SIZE_CLASSES[size], sideways ? 'tile-sideways' : '']
        .filter(Boolean)
        .join(' ')}
    >
      <img src="/tiles/back.svg" alt="" className="tile-face" draggable={false} />
    </div>
  );
}
