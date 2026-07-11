// xoshiro128** — fast seedable 32-bit PRNG (Blackman & Vigna)

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

// splitmix32 used only to expand a single 32-bit seed into the 4-word state
function splitmix32(h: number): number {
  let z = (h + 0x9e3779b9) | 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) | 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) | 0;
  return (z ^ (z >>> 16)) >>> 0;
}

export interface Rng {
  /** uint32 in [0, 2^32) */
  next(): number;
  /** integer in [0, n) */
  nextInt(n: number): number;
  /** float in [0, 1) */
  nextFloat(): number;
}

export function createRng(seed: string): Rng {
  // Hash string → single uint32
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  h = h >>> 0;

  // Expand into 4-word xoshiro128** state via splitmix32
  const s0 = splitmix32(h);
  const s1 = splitmix32(s0);
  const s2 = splitmix32(s1);
  const s3 = splitmix32(s2);
  const s: [number, number, number, number] = [s0, s1, s2, s3];

  function next(): number {
    const result = Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;
    const t = (s[1] << 9) >>> 0;
    s[2] ^= s[0];
    s[3] ^= s[1];
    s[1] ^= s[2];
    s[0] ^= s[3];
    s[2] ^= t;
    s[3] = rotl(s[3], 11);
    return result;
  }

  return {
    next,
    nextInt(n: number) {
      return next() % n;
    },
    nextFloat() {
      return next() / 0x100000000;
    },
  };
}
