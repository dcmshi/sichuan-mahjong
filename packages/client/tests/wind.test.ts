import type { Seat } from '@sichuan-mahjong/engine';
import { describe, expect, it } from 'vitest';
import { LANGS, catalog } from '../src/i18n/index.js';
import { seatKey, seatLabelKey, windKey, windOfSeat } from '../src/wind.js';

const SEATS: Seat[] = [0, 1, 2, 3];

describe('windOfSeat', () => {
  it('makes the dealer East, whichever seat the dice gave it to', () => {
    for (const dealer of SEATS) expect(windOfSeat(dealer, dealer)).toBe(0);
  });

  it('runs against the seat index, because play travels counterclockwise', () => {
    // South sits to East's right, which is the seat *below* it.
    for (const dealer of SEATS) {
      expect(windOfSeat(((dealer + 3) % 4) as Seat, dealer)).toBe(1);
      expect(windOfSeat(((dealer + 2) % 4) as Seat, dealer)).toBe(2);
      expect(windOfSeat(((dealer + 1) % 4) as Seat, dealer)).toBe(3);
    }
  });

  it('gives the four seats four different winds, for every dealer', () => {
    for (const dealer of SEATS) {
      const winds = SEATS.map(s => windOfSeat(s, dealer));
      expect(new Set(winds).size, `dealer ${dealer}`).toBe(4);
    }
  });

  it('is never the seat index — not for any dealer, which is the whole bug', () => {
    // Nine screens printed `wind.${seat}`. The tempting reading of that is "right
    // whenever the dealer is seat 0", and it is not: with East at seat 0 the
    // winds are East, North, West, South, so two rows of four still disagree.
    expect(SEATS.map(s => windOfSeat(s, 0))).toEqual([0, 3, 2, 1]);

    for (const dealer of SEATS) {
      const correct = SEATS.filter(s => windOfSeat(s, dealer) === s).length;
      // Two rows right at best (dealers 0 and 2), none at all at worst.
      expect(correct, `dealer ${dealer}`).toBe(dealer % 2 === 0 ? 2 : 0);
    }
  });
});

describe('label keys', () => {
  it('names a wind from the dealer and a chair from the seat', () => {
    // Dealer 2 makes seat 1 South: one seat counterclockwise from East.
    expect(windKey(1, 2)).toBe('wind.1');
    expect(seatKey(1)).toBe('seat.1');
  });

  it('falls back to the chair when no dealer is known', () => {
    // Results stored before N26 carry no dealer, and a rejoin at round end
    // replays one — better to name the chair than to print a guessed wind.
    expect(seatLabelKey(1, undefined)).toBe('seat.1');
    expect(seatLabelKey(1, null)).toBe('seat.1');
    // Seat 0 as a dealer is falsy, and an `||` here would have sent it to the
    // chair — so the one dealer in four that looks most correct would be the
    // one case that silently stopped naming winds at all.
    expect(seatLabelKey(1, 0)).toBe('wind.3');
    expect(seatLabelKey(0, 0)).toBe('wind.0');
  });

  it('resolves in every catalog, and to four distinct labels each', () => {
    for (const { code } of LANGS) {
      const dict = catalog[code];
      const winds = SEATS.map(s => dict[windKey(s, 0)]);
      const seats = SEATS.map(s => dict[seatKey(s)]);
      expect(new Set(winds).size, `${code} winds`).toBe(4);
      expect(new Set(seats).size, `${code} seats`).toBe(4);
      // A chair is not a wind: labelling both the same would put the confusion
      // back in a different place.
      expect(
        winds.some(w => seats.includes(w)),
        `${code} overlap`,
      ).toBe(false);
    }
  });
});
