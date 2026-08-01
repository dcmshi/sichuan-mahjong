import { describe, expect, it } from 'vitest';
import { normalizeFans } from '../src/persistence.js';

// Its own file because server.test.ts mocks ../src/persistence.js wholesale;
// this needs the real implementation.
describe('replay back-compat', () => {
  it('reads a replay row written before fans became structured', () => {
    // Old rows hold the display form the engine used to bake in.
    expect(normalizeFans(['AllPungs×2', 'Kong'])).toEqual([
      { fan: 'AllPungs', count: 2 },
      { fan: 'Kong', count: 1 },
    ]);
  });

  it('passes already-structured fans through untouched', () => {
    const structured = [{ fan: 'SevenPairs', count: 1 }];
    expect(normalizeFans(structured)).toEqual(structured);
  });

  it('tolerates a missing or malformed fans field', () => {
    expect(normalizeFans(undefined)).toEqual([]);
    expect(normalizeFans(null)).toEqual([]);
  });
});
