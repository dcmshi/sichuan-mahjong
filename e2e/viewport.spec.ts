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
