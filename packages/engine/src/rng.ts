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
    /**
     * `% n`, and **deliberately so** — modulo-biased, measured, and left. (A54)
     *
     * 2³² is not a multiple of most `n`, so the lowest `2³² mod n` results are
     * reachable one extra way each. Across every draw the shuffle makes (n=2..108)
     * the widest that region gets is **96 values out of 2³², at n=100** —
     * 2.24×10⁻⁸. One part in forty-five million, in a game whose every other
     * input is a person deciding something.
     *
     * **The reason this was filed is wrong, and that is the useful part.** It was
     * recorded as unfixable-without-churn: rejection sampling "would change which
     * tiles every seed deals", so every pinned-seed test, e2e guard and
     * layout-probe baseline would regenerate. It would not. A sampler that
     * redraws only on rejection consumes an extra `next()` with probability
     * 6.3×10⁻⁷ per 107-draw shuffle — **0 of 200,000 seeds deal differently**,
     * measured. The churn is about one seed in 1.6 million.
     *
     * What actually argues against changing it is the other side: the defect is
     * unobservable and so is the fix. No feasible sample distinguishes a
     * 2.24×10⁻⁸ excess, and no seed anyone will find takes the rejection branch,
     * so the change would land with no test that could fail if it were wrong.
     * A four-line untestable edit against a bias below every other source of
     * noise is not a trade worth making — but it is a *decision*, not the
     * impossibility it was filed as. A different fix would be a different
     * question: `Math.floor(nextFloat() * n)` really would move every deal.
     *
     * `rng.test.ts` pins a golden sequence. Note what it does and does not do:
     * it cannot tell modulo from rejection sampling, for exactly the reason
     * above — it catches every *other* accidental change to the generator, the
     * seed expansion and the shuffle, which nothing did before.
     */
    nextInt(n: number) {
      return next() % n;
    },
    nextFloat() {
      return next() / 0x100000000;
    },
  };
}
