/**
 * A19: exercise the real UI interaction layer with genuine clicks — the thing the
 * other e2e specs deliberately skip (they drive actions through window.__e2e because
 * Framer Motion intercepts pointer events). Here we click actual tiles/buttons:
 *   - huan: tap 3 same-suit tiles + Confirm
 *   - void: tap a suit + Confirm
 *   - play: tap-to-select then tap-to-discard (Reorder.Item pointer gesture)
 * window.__e2e is used only to *observe* the phase, never to act.
 */
import { expect, test } from '@playwright/test';

const BASE = 'http://localhost:8080';

const getPhase = (page: import('@playwright/test').Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __e2e?: { getPhase(): string | null } }).__e2e?.getPhase() ?? null,
  );

/** Fail if the page overflows horizontally — on a phone this means clipped UI. */
async function expectNoHorizontalOverflow(page: import('@playwright/test').Page, where: string) {
  const o = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
  }));
  expect(o.scrollW, `${where}: page must not scroll horizontally`).toBeLessThanOrEqual(
    o.innerW + 1,
  );
}

test('opening played via real UI clicks (huan tiles, void suit, discard tap)', async ({
  page,
}, testInfo) => {
  // Attach a screenshot per phase so each viewport project leaves a reviewable
  // record of how the layout renders on that device (A24).
  const snap = async (name: string) =>
    testInfo.attach(name, { body: await page.screenshot(), contentType: 'image/png' });

  await page.goto(BASE);

  // Practice mode auto-creates a lobby + 3 bots and starts the game.
  await page.getByRole('button', { name: /Practice/i }).click();
  await expect.poll(() => getPhase(page), { timeout: 20_000 }).toBe('huan');

  // ── Huan: click 3 same-suit tiles (identified by their alt="suit-rank"), Confirm ──
  const handTiles = page.locator('div.flex.flex-wrap img[alt]');
  await expect.poll(() => handTiles.count()).toBeGreaterThanOrEqual(13);
  const alts = await handTiles.evaluateAll(els => els.map(e => e.getAttribute('alt') ?? ''));
  const bySuit: Record<string, number[]> = {};
  alts.forEach((a, i) => {
    const s = a.split('-')[0]!;
    if (!bySuit[s]) bySuit[s] = [];
    bySuit[s]!.push(i);
  });
  const suit = Object.keys(bySuit).find(s => (bySuit[s]?.length ?? 0) >= 3);
  expect(suit, 'hand should have ≥3 tiles of some suit').toBeTruthy();
  await expectNoHorizontalOverflow(page, 'huan');
  await snap('huan');
  for (const i of bySuit[suit!]!.slice(0, 3)) await handTiles.nth(i).click();
  await page.getByRole('button', { name: /Confirm Swap/i }).click();

  // Bots submit automatically → void-declaration phase.
  await expect.poll(() => getPhase(page), { timeout: 15_000 }).toBe('voidDeclare');

  // ── Void: click the first suit button, then the confirm ("Void <suit>") ──
  await page.locator('div.flex.gap-3 > button').first().click();
  // The screen lists the tiles of the chosen suit; holding ≥1 means one gets
  // separated face down, which is what turn 1 must then flip (A35).
  const voidSuitTiles = await page.locator('div.flex.flex-wrap.gap-1 img[alt]').count();
  await page.getByRole('button', { name: /Void /i }).click();

  await expect.poll(() => getPhase(page), { timeout: 15_000 }).toBe('play');

  // ── Landscape phones don't get a board to tap. R4 Phase 1 blocks play there
  //    with a rotate-to-portrait overlay, because the board needs roughly twice
  //    the viewport height and scrolling to it moves the hand off screen. On
  //    those projects the correct assertion is that the overlay is up, not that
  //    tiles are tappable underneath it. (viewport-audit.md R4) ──
  const vp = page.viewportSize();
  const isLandscapePhone = vp !== null && vp.height <= 480 && vp.width > vp.height;
  if (isLandscapePhone) {
    const overlay = page.locator('.rotate-overlay');
    await expect(overlay).toBeVisible({ timeout: 10_000 });
    await expectNoHorizontalOverflow(page, 'play (rotate prompt)');
    await snap('play-rotate-prompt');
    return;
  }

  // ── Play: round-1 dealer is the host (us), so it's our turn first. ──
  const hand = page.locator('ul li img[alt]');
  await expect.poll(() => hand.count(), { timeout: 10_000 }).toBeGreaterThan(0);
  await expectNoHorizontalOverflow(page, 'play');
  await snap('play');

  // The tile set aside at void declaration is the mandatory first discard, so
  // turn 1 offers exactly one action: flip it. No hand tile is discardable yet.
  // (Unless we were an indicator user — a hand missing a whole suit — in which
  // case there's nothing to flip and we discard normally.) (A35)
  const flipButton = page.getByRole('button', { name: /Flip your first discard/i });
  if (voidSuitTiles > 0) {
    await expect(flipButton).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('ul li:not(.opacity-60)')).toHaveCount(0);
    await flipButton.click();
    await expect(flipButton).toBeHidden({ timeout: 10_000 });
  }

  // ── Wait for our next turn, then tap a discardable hand tile to select it and
  //    tap again to discard. ──
  const discardable = page.locator('ul li:not(.opacity-60)');
  await expect.poll(() => discardable.count(), { timeout: 30_000 }).toBeGreaterThan(0);
  const before = await hand.count();

  await discardable.first().click(); // select
  await expect(page.getByText('Tap again to discard')).toBeVisible({ timeout: 5_000 });
  await discardable.first().click(); // discard

  // The discard registered iff our hand shrank by (at least) one tile.
  await expect.poll(() => hand.count(), { timeout: 10_000 }).toBeLessThan(before);
});
