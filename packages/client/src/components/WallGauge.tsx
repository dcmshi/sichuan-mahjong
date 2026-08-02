import { useT } from '../i18n/useT.js';
import { TileBack } from './Tile.js';

/**
 * Tiles per drawn back. The deal leaves 56 in the wall, so the strip starts at
 * 14 backs and empties over the round.
 */
export const WALL_PER_BACK = 4;

/** Most backs the strip will draw — the well is ~140px wide on a 320px phone. */
export const WALL_MAX_BACKS = 14;

/**
 * How many backs stand for `remaining` tiles. Rounded up, so the wall only reads
 * as empty once it is, and capped so a longer wall can't push the strip past the
 * well it sits in.
 *
 * Exported to be tested: the client suite runs in Node with no DOM.
 */
export function wallBacks(remaining: number): number {
  if (remaining <= 0) return 0;
  return Math.min(Math.ceil(remaining / WALL_PER_BACK), WALL_MAX_BACKS);
}

/**
 * The wall as tiles rather than a number: a run of backs, overlapped much harder
 * than a hand's, which is roughly what the wall looks like from across the table.
 * The exact count stays in the top bar — this is for reading at a glance how much
 * of the round is left, which is what decides whether a hand is still worth
 * chasing.
 */
export function WallGauge({ remaining }: { remaining: number }) {
  const t = useT();
  const backs = wallBacks(remaining);
  return (
    <div
      className="wall-gauge flex"
      role="img"
      aria-label={t('play.wall', { n: remaining })}
      title={t('play.wall', { n: remaining })}
    >
      {Array.from({ length: backs }, (_, i) => (
        <div key={i} className="wall-gauge-tile">
          <TileBack fill />
        </div>
      ))}
    </div>
  );
}
