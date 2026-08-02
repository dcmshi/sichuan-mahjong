import { motion } from 'framer-motion';

/**
 * A die as a CSS 3D cube.
 *
 * **No physics library, on purpose.** The result is decided by `rng.ts` before
 * anything is drawn — it has to be, or replays stop reproducing — so a physics
 * engine would have to be *rigged* to land on a predetermined face, which is
 * harder than animating to it. Six divs and a transform get the whole effect
 * for no dependency, against three.js + cannon-es at roughly 600KB on a
 * mobile-first PWA.
 */

/** Opposite faces sum to 7, as on a real die. */
const FACES = { front: 1, back: 6, right: 3, left: 4, top: 5, bottom: 2 } as const;

/**
 * The rotation that brings `value` to the front, in degrees. Exported because
 * the client has no DOM in tests — this is the part worth asserting.
 */
export function faceRotation(value: number): { x: number; y: number } {
  switch (value) {
    case FACES.front:
      return { x: 0, y: 0 };
    case FACES.back:
      return { x: 0, y: 180 };
    case FACES.right:
      return { x: 0, y: -90 };
    case FACES.left:
      return { x: 0, y: 90 };
    case FACES.top:
      return { x: -90, y: 0 };
    case FACES.bottom:
      return { x: 90, y: 0 };
    default:
      return { x: 0, y: 0 };
  }
}

/** Which of the nine grid cells carry a pip, for each face. */
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function Face({ value, transform }: { value: number; transform: string }) {
  const on = new Set(PIPS[value] ?? []);
  return (
    <span
      className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-[8%] p-[12%] rounded-[18%] bg-stone-50 border border-stone-300 shadow-inner"
      style={{ transform, backfaceVisibility: 'hidden' }}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={on.has(i) ? 'rounded-full bg-stone-800' : ''} />
      ))}
    </span>
  );
}

type Props = {
  value: number;
  /** Size in px. The cube's depth is half of this, so it reads as a die. */
  size?: number;
  /** Full turns to add on the way. 0 lands it flat, for the skip path. */
  spins?: number;
  durationMs: number;
  delayMs?: number;
};

export function Die({ value, size = 44, spins = 2, durationMs, delayMs = 0 }: Props) {
  const half = size / 2;
  const target = faceRotation(value);
  const faces: [number, string][] = [
    [FACES.front, `translateZ(${half}px)`],
    [FACES.back, `rotateY(180deg) translateZ(${half}px)`],
    [FACES.right, `rotateY(90deg) translateZ(${half}px)`],
    [FACES.left, `rotateY(-90deg) translateZ(${half}px)`],
    [FACES.top, `rotateX(90deg) translateZ(${half}px)`],
    [FACES.bottom, `rotateX(-90deg) translateZ(${half}px)`],
  ];

  return (
    <span
      className="inline-block"
      style={{ width: size, height: size, perspective: size * 6 }}
      // The face is the information; the cube is decoration. Screen readers get
      // the number and skip the six divs.
      role="img"
      aria-label={String(value)}
    >
      <motion.span
        className="relative block w-full h-full"
        style={{ transformStyle: 'preserve-3d' }}
        initial={{ rotateX: target.x - 360 * spins, rotateY: target.y - 360 * spins, y: -size * 2 }}
        animate={{ rotateX: target.x, rotateY: target.y, y: 0 }}
        transition={{
          duration: durationMs / 1000,
          delay: delayMs / 1000,
          ease: [0.2, 0.9, 0.3, 1],
        }}
      >
        {faces.map(([v, transform]) => (
          <Face key={v} value={v} transform={transform} />
        ))}
      </motion.span>
    </span>
  );
}
