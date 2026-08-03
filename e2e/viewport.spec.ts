/**
 * Vertical-overflow guard (viewport-audit.md R5).
 *
 * `ui-clicks.spec.ts` fails on sideways scroll but nothing watched vertical, so
 * the audit's findings could quietly come back the next time a row is added to
 * the board. Runs on the smallest supported phone, because that is where the
 * budget is tightest.
 *
 * Each screen is asserted on the guarantee it actually makes, which is not the
 * same guarantee:
 *
 *  - **Play** promises to fit. R1 made the root `h-dvh` with `overflow-y-auto`,
 *    which moves overflow off the document and into the element — so
 *    `documentElement.scrollHeight` is now a constant and asserting on it would
 *    pass no matter how badly the board overflowed. The check has to be on the
 *    scroll container itself.
 *  - **Round end** does *not* promise to fit; the audit is explicit that
 *    scrolling a results screen is fine. What it promises is that the two
 *    primary controls are always reachable, which is what R3's sticky bar is
 *    for. Asserting that screen fits would fail by design.
 */
import { type Page, expect, test } from '@playwright/test';

const BASE = 'http://localhost:8080';

type E2E = {
  huanSubmit: () => boolean;
  voidSubmit: () => boolean;
  autoPlay: () => boolean;
  getPhase: () => string | null;
  getScreen: () => string;
};

const e2e = (page: Page) => ({
  huanSubmit: () => page.evaluate(() => (window as unknown as { __e2e: E2E }).__e2e.huanSubmit()),
  voidSubmit: () => page.evaluate(() => (window as unknown as { __e2e: E2E }).__e2e.voidSubmit()),
  autoPlay: () => page.evaluate(() => (window as unknown as { __e2e: E2E }).__e2e.autoPlay()),
  getPhase: () => page.evaluate(() => (window as unknown as { __e2e: E2E }).__e2e.getPhase()),
  getScreen: () => page.evaluate(() => (window as unknown as { __e2e: E2E }).__e2e.getScreen()),
});

/**
 * Overflow of the play screen's scroll container, in px (0 means it fits), plus
 * the height of every row inside it. Overflow alone says nothing about which row
 * grew, and CI uploads no Playwright artifacts — the row list in the failure
 * message is the only evidence a CI-only failure leaves behind.
 */
function boardSample(page: Page): Promise<{ overflow: number; rows: string }> {
  return page.evaluate(() => {
    const el = document.querySelector('.board-felt');
    if (!el) return { overflow: 0, rows: '' };
    const rows = Array.from(el.children)
      .map(c => {
        const row = c as HTMLElement;
        return `${row.className.split(' ').slice(0, 2).join('.')}=${row.offsetHeight}`;
      })
      .join(' ');
    return { overflow: Math.max(0, el.scrollHeight - el.clientHeight), rows };
  });
}

/**
 * The claim bar against the hand. Deciding whether to pung is a judgement about
 * the tiles you hold, and a `fixed` bar reserved no room and covered them for the
 * whole 10-second window. (N8)
 *
 * Returns null when no window is open. `settled` matters: `Reorder.Item` animates
 * the hand on any layout change, so a sample taken as the bar appears catches
 * tiles still travelling from where they used to sit and reports an overlap that
 * is a frame old. The caller waits before trusting a count.
 */
function claimOverlap(
  page: Page,
): Promise<{ crossing: number; barTop: number; lowestTile: number } | null> {
  return page.evaluate(() => {
    const barEl = document.querySelector('.claim-panel');
    if (!barEl) return null;
    const bar = barEl.getBoundingClientRect();
    const tiles = Array.from(document.querySelectorAll('ul li .tile'))
      .map(t => t.getBoundingClientRect())
      .filter(r => r.height > 0);
    if (tiles.length === 0) return null;
    return {
      crossing: tiles.filter(r => r.bottom > bar.top + 0.5).length,
      barTop: Math.round(bar.top),
      lowestTile: Math.round(Math.max(...tiles.map(r => r.bottom))),
    };
  });
}

/**
 * The same reading, once two consecutive samples agree — so the hand has stopped
 * moving. Returns null if the window closed while settling, which is a bot having
 * resolved it and not a failure.
 */
async function settledClaimOverlap(page: Page) {
  let prev = await claimOverlap(page);
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(100);
    const now = await claimOverlap(page);
    if (now === null) return null;
    if (prev !== null && now.lowestTile === prev.lowestTile && now.barTop === prev.barTop) {
      return now;
    }
    prev = now;
  }
  return prev;
}

/**
 * The turn indicator, and the hand cue that goes with it. (N7/N13)
 *
 * N7 was the indicator rendering at **zero width** on this viewport: the icon
 * cluster is `flex-shrink-0` and the indicator was the only shrinkable child, so
 * it absorbed the whole shortfall and truncated away. Nothing caught it — this
 * spec watched vertical overflow, and `ui-clicks` fails on document-level sideways
 * scroll, which a shortfall inside a clipped row never causes.
 *
 * So the check is on the rendered width, not on the text being in the DOM: the
 * text was always there, which is exactly why it went unnoticed.
 */
function turnCue(page: Page): Promise<{ width: number; yours: boolean; handRing: boolean } | null> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-turn-indicator]');
    if (!el) return null;
    return {
      width: Math.round(el.getBoundingClientRect().width),
      yours: el.getAttribute('data-your-turn') === 'true',
      handRing: document.querySelector('.hand-your-turn') !== null,
    };
  });
}

/**
 * Discard trays drawing outside where they belong. Two distinct faults, both live
 * before the density pass and each invisible to the other's check:
 *
 *  - The left tray cut its third tile in half — 110px of tiles in an 80px box, so
 *    it overflowed *itself*. Caught by scrollWidth, and by a tile's box escaping
 *    the tray's.
 *  - The right tray was 211.6px wide in an 80px column, spilling 132px leftward
 *    across the well. Its own box fit its content perfectly, so neither check
 *    above sees it; what it overflowed was the column. Caught by overlapping the
 *    well, which is the defect as a player sees it — discards drawn over the
 *    middle of the table.
 */
function trayProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const bad: string[] = [];
    const well = document.querySelector('.play-well')?.getBoundingClientRect();
    const trays = Array.from(document.querySelectorAll('.discard-tray')) as HTMLElement[];
    for (const [i, el] of trays.entries()) {
      const box = el.getBoundingClientRect();
      if (el.scrollWidth > el.clientWidth) {
        bad.push(`tray ${i}: scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}`);
      }
      for (const t of Array.from(el.querySelectorAll('.tile'))) {
        const tile = t.getBoundingClientRect();
        if (tile.right > box.right + 0.5 || tile.left < box.left - 0.5) {
          bad.push(
            `tray ${i}: a tile spans ${Math.round(tile.left)}..${Math.round(tile.right)} in a box of ${Math.round(box.left)}..${Math.round(box.right)}`,
          );
        }
      }
      // The across opponent's tray sits above the well, so only horizontal
      // overlap counts as spilling into it.
      if (well && box.width > 0 && box.left < well.right - 0.5 && box.right > well.left + 0.5) {
        const vertical = box.top < well.bottom - 0.5 && box.bottom > well.top + 0.5;
        if (vertical) {
          bad.push(
            `tray ${i}: spans ${Math.round(box.left)}..${Math.round(box.right)}, over a well of ${Math.round(well.left)}..${Math.round(well.right)}`,
          );
        }
      }
    }
    return bad;
  });
}

test('play fits the viewport, and the round-end controls stay reachable', async ({ page }) => {
  test.setTimeout(180_000);
  const g = e2e(page);

  await page.goto(BASE);
  await page.click('text=Practice (vs Bots)');
  // Practice runs the canonical ruleset, which opens on the void declaration.
  // 換三張 is an opt-in house rule, so only submit through it if a host enabled it.
  await expect.poll(() => g.getPhase(), { timeout: 30_000 }).toMatch(/^(huan|voidDeclare)$/);
  if ((await g.getPhase()) === 'huan') await g.huanSubmit();
  await expect.poll(() => g.getPhase(), { timeout: 20_000 }).toBe('voidDeclare');
  await g.voidSubmit();
  await expect.poll(() => g.getPhase(), { timeout: 20_000 }).toBe('play');

  // Peak across the round, not one moment — the board grows as the trays fill.
  let peak = 0;
  let worstRows = '';
  const clipped = new Set<string>();
  let claimWindows = 0;
  let worstClaim = 0;
  let worstClaimDetail = '';
  let narrowestTurnCue = Number.POSITIVE_INFINITY;
  let yourTurns = 0;
  let yourTurnsWithoutRing = 0;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if ((await g.getScreen()) === 'roundEnd') break;
    if ((await g.getPhase()) === 'play') {
      const s = await boardSample(page);
      if (s.overflow > peak) {
        peak = s.overflow;
        worstRows = s.rows;
      }
      for (const problem of await trayProblems(page)) clipped.add(problem);

      const cue = await turnCue(page);
      if (cue) {
        narrowestTurnCue = Math.min(narrowestTurnCue, cue.width);
        // The claim bar is the cue during a claim window, so the ring stands down
        // there on purpose — don't count those samples against it.
        if (cue.yours && (await claimOverlap(page)) === null) {
          yourTurns++;
          if (!cue.handRing) yourTurnsWithoutRing++;
        }
      }

      // Sampled before autoPlay resolves the claim, which is the only moment the
      // bar is up. Polled to a stable pair rather than waited out on a fixed
      // timeout: a single sleep long enough for the hand's layout animation on
      // one machine is too short on another, and the guard then fails
      // intermittently — which is worse than not having it.
      if ((await claimOverlap(page)) !== null) {
        const settled = await settledClaimOverlap(page);
        if (settled !== null) {
          claimWindows++;
          if (settled.crossing > worstClaim) {
            worstClaim = settled.crossing;
            worstClaimDetail = `${settled.crossing} tiles under the bar; bar top ${settled.barTop}, lowest tile ${settled.lowestTile}`;
          }
        }
      }
    }
    await g.autoPlay();
    await page.waitForTimeout(130);
  }
  expect(
    peak,
    `play screen must not overflow its scroll container at any point in a round (rows at peak: ${worstRows})`,
  ).toBe(0);
  expect(
    [...clipped],
    'no discard tray may draw outside its column — that is what cuts a tile in half or lays discards over the well',
  ).toEqual([]);
  // Without this the check below passes for free on a round that happened to
  // offer this seat no claim, which is how N8 went unguarded.
  expect(claimWindows, 'the round should have opened at least one claim window').toBeGreaterThan(0);
  expect(
    worstClaim,
    `no hand tile may sit under the claim bar — whether to pung is a judgement about the hand it would cover (${worstClaimDetail})`,
  ).toBe(0);
  // N7: it rendered at exactly 0 here, with the text present the whole time. 40px
  // is well under a fitting indicator and well over a truncated one.
  expect(
    narrowestTurnCue,
    'the turn indicator must have real width on the narrowest phone — it truncated to nothing',
  ).toBeGreaterThan(40);
  expect(yourTurns, 'the round should have given this seat a turn').toBeGreaterThan(0);
  // N13: the top-bar text is at the opposite end of the screen from the hand, so
  // the ring on the hand is the cue that actually gets seen.
  expect(
    yourTurnsWithoutRing,
    `the hand must be ringed while the turn is yours (${yourTurnsWithoutRing} of ${yourTurns} samples were not)`,
  ).toBe(0);

  await expect(page.locator('text=Round End')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(700); // let the row entrance settle

  const vh = (await page.viewportSize())?.height ?? 0;
  const nextRound = page.getByRole('button', { name: /Next Round/ });
  const inView = async () => {
    const box = await nextRound.boundingBox();
    expect(box, 'the Next Round button should exist on the round-end screen').not.toBeNull();
    return box !== null && box.y >= 0 && box.y + box.height <= vh + 1;
  };

  expect(await inView(), 'round-end controls must be reachable on arrival').toBe(true);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);
  expect(await inView(), 'round-end controls must stay reachable when scrolled').toBe(true);
});
