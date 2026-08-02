import { describe, expect, it } from 'vitest';
import { CREDITS } from '../src/cli.js';

/**
 * The release binary embeds the CC-BY-SA tile art (LICENSE §3), so the
 * attribution has to travel inside the executable rather than in a file beside
 * it. `--credits` is the copy a headless operator can reach, and these are the
 * four things CC-BY-SA 4.0 §3(a)(1) actually requires it to carry — asserted so
 * an edit for brevity can't quietly drop one.
 */
describe('--credits', () => {
  it('names the creators', () => {
    expect(CREDITS).toContain('Cangjie6');
    expect(CREDITS).toContain('Jerry Crimson Mann');
    expect(CREDITS).toContain('Dewclouds');
  });

  it('identifies the licence by URI, not just by name', () => {
    expect(CREDITS).toContain('CC BY-SA 4.0');
    expect(CREDITS).toContain('https://creativecommons.org/licenses/by-sa/4.0/');
  });

  it('links back to the source the art came from', () => {
    expect(CREDITS).toContain('commons.wikimedia.org');
  });

  it('indicates that the files were changed', () => {
    // Renamed, and nothing else — but "renamed" is a modification to disclose.
    expect(CREDITS).toMatch(/renamed/i);
  });

  it('tells a redistributor that the binary carries the art', () => {
    // The whole point of resolving O1 this way: someone who passes the
    // executable on is passing CC-BY-SA material on with it.
    expect(CREDITS).toMatch(/embeds the artwork/i);
  });
});
