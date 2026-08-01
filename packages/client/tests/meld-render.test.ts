import type { PublicMeld, Tile } from '@sichuan-mahjong/engine';
import { describe, expect, it } from 'vitest';
import { meldRender } from '../src/components/MeldDisplay.js';

const t = (suit: 'man' | 'pin' | 'sou', rank: number) => ({ suit, rank }) as Tile;

describe('meld rendering', () => {
  it('draws backs for a concealed kong while its rank is still secret', () => {
    // Live rounds project it with tile: null (A27) — there is nothing to show.
    const redacted: PublicMeld = {
      kind: 'kong',
      subtype: 'concealed',
      tile: null,
      claimedFrom: null,
      turnDeclared: 4,
    };
    expect(meldRender(redacted)).toEqual({ ids: null, badged: true });
  });

  it('reveals a concealed kong once the round has sent its tile', () => {
    // The regression this guards: keying off subtype drew backs here too, so
    // the round-end hand reveal showed four blanks with the tile in hand.
    const revealed: PublicMeld = {
      kind: 'kong',
      subtype: 'concealed',
      tile: t('man', 3),
      claimedFrom: null,
      turnDeclared: 4,
    };
    const { ids, badged } = meldRender(revealed);
    expect(ids).toHaveLength(4);
    expect(ids?.every(id => typeof id === 'number')).toBe(true);
    // Still badged: it is a declared group, not four loose tiles beside a hand.
    expect(badged).toBe(true);
  });

  it('draws other melds face up and unbadged', () => {
    const exposedKong: PublicMeld = {
      kind: 'kong',
      subtype: 'exposed',
      tile: t('pin', 5),
      claimedFrom: 2,
      turnDeclared: 7,
    };
    const pung: PublicMeld = { kind: 'pung', tile: t('sou', 9), concealed: false, claimedFrom: 1 };
    const chow: PublicMeld = { kind: 'chow', tiles: [t('man', 1), t('man', 2), t('man', 3)] };

    expect(meldRender(exposedKong)).toMatchObject({ badged: false });
    expect(meldRender(exposedKong).ids).toHaveLength(4);
    expect(meldRender(pung)).toMatchObject({ badged: false });
    expect(meldRender(pung).ids).toHaveLength(3);
    expect(meldRender(chow)).toMatchObject({ badged: false });
    expect(meldRender(chow).ids).toHaveLength(3);
  });
});
