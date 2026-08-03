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

  // Practice has a setup screen in front of it now, the way Host does — pick the
  // pace and each bot's level, then start. The defaults are what this suite
  // wants, so it is one extra tap rather than a form to fill in.
  await page.getByRole('button', { name: /Practice \(vs Bots\)/i }).click();
  await page.getByRole('button', { name: /Start Practice/i }).click();
  // Practice runs the canonical ruleset, where the deal opens on the void
  // declaration — 換三張 is a house rule and off by default, so the huan screen
  // only appears if a host turned it on. `house-rules.spec.ts` taps through it
  // there; here it is skipped if absent rather than asserted, so this spec keeps
  // covering the screens practice actually shows.
  await expect.poll(() => getPhase(page), { timeout: 20_000 }).toMatch(/^(huan|voidDeclare)$/);

  if ((await getPhase(page)) === 'huan') {
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
  }

  // Bots submit automatically → void-declaration phase.
  await expect.poll(() => getPhase(page), { timeout: 15_000 }).toBe('voidDeclare');

  // ── Void: click the first suit button, tap which of its tiles leads, then the
  //    confirm ("Void <suit>") ──
  await page.locator('div.flex.gap-3 > button').first().click();
  // The screen shows the whole hand and marks the chosen suit's tiles, so count
  // the marked ones — holding ≥1 means one gets separated face down, which is
  // what turn 1 must then flip (A35). Counting every tile in the container was
  // right when only the chosen suit was rendered; now it would always be 13 and
  // would demand a flip button in the indicator case, which has nothing to flip.
  const voidSuitTiles = await page.locator('[data-void-tile] img[alt]').count();
  // N30: the first discard is a real choice, and the screen has to *show* which
  // tile it is — the bug was that `counts[suit][0]` went out with nothing on
  // screen naming it. Tapping the suit alone is still enough to submit; what it
  // must not be is silent, so exactly one marked tile carries `data-void-first`
  // before any tile is tapped, and tapping one moves the mark to it. A suit the
  // hand has none of is the indicator case and has nothing to mark, which is why
  // this is conditional.
  if (voidSuitTiles > 0) {
    await expect(
      page.locator('[data-void-first]'),
      'the suit button alone must still name the tile that leads',
    ).toHaveCount(1);
    await page.locator('[data-void-tile]').first().click();
    await expect(page.locator('[data-void-first]')).toHaveCount(1);
  }

  // ── The dice reveal has to clear itself. Declaring promptly — which is what
  //    this spec does, and what most players do — used to leave the seating stage
  //    parked over the board for the rest of the round: the phase left
  //    `voidDeclare` mid-reveal, React ran the effect's cleanup and cancelled the
  //    stage timers, and nothing was left to unset the stage. It is
  //    `pointer-events-none`, so it blocked no click and this whole spec passed
  //    with it dimming every screenshot. (N25)
  //
  //    Asserted visible first, deliberately: "the overlay is gone" passes just as
  //    well when the overlay never appeared, and this repo has been bitten by a
  //    guard that could not reach its own case. ──
  const diceOverlay = page.locator('[data-dice-overlay]');
  await expect(diceOverlay, 'the dice reveal should be up at the deal').toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole('button', { name: /Void /i }).click();

  await expect.poll(() => getPhase(page), { timeout: 15_000 }).toBe('play');

  // Two stages of 900+900ms at the medium pace is 5.4s; 15s is slack, not a
  // second chance — a parked overlay never leaves at all.
  await expect(diceOverlay, 'the dice reveal must clear itself once play starts').toHaveCount(0, {
    timeout: 15_000,
  });

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

  // ── Play. The dealer used to be the host, so this was always our turn first.
  //    N2's seating throw makes East whoever rolled highest, so three times in
  //    four we now wait for one to three bot turns — and each of those can open
  //    a 10s claim window — before we act. Every wait below is sized for that
  //    rather than for turn 1. ──
  const hand = page.locator('ul li img[alt]');
  await expect.poll(() => hand.count(), { timeout: 10_000 }).toBeGreaterThan(0);
  await expectNoHorizontalOverflow(page, 'play');
  await snap('play');

  // The tile set aside at void declaration is the mandatory first discard, so
  // our first turn offers exactly one action: flip it. No hand tile is
  // discardable yet. (Unless we were an indicator user — a hand missing a whole
  // suit — in which case there's nothing to flip and we discard normally.) (A35)
  const flipButton = page.getByRole('button', { name: /Flip your first discard/i });
  if (voidSuitTiles > 0) {
    // 60s, not 10: this appears on *our* first turn, which is only the game's
    // first turn when the dice seated us East.
    await expect(flipButton).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('ul li[data-discardable]')).toHaveCount(0);
    await flipButton.click();
    await expect(flipButton).toBeHidden({ timeout: 10_000 });
  }

  // ── Wait for our next turn, then tap a discardable hand tile to select it and
  //    tap again to discard. ──
  const discardable = page.locator('ul li[data-discardable]');
  await expect.poll(() => discardable.count(), { timeout: 30_000 }).toBeGreaterThan(0);
  const before = await hand.count();

  await discardable.first().click(); // select
  await expect(page.getByText('Tap again to discard')).toBeVisible({ timeout: 5_000 });
  await discardable.first().click(); // discard

  // The discard registered iff our hand shrank by (at least) one tile.
  await expect.poll(() => hand.count(), { timeout: 10_000 }).toBeLessThan(before);

  // ── N33: tapping a pile opens all of it, and tapping again dismisses it.
  //    Asserted on a real click rather than through the store, because the thing
  //    that can break is the gesture: the tray's tiles carry their own long press
  //    for the 2× preview, and `usePileTap` is what keeps one press from
  //    answering both. The modal must also render outside every `.discard-tray`,
  //    or `viewport.spec.ts` sees `md` tiles inside an `sm` tray. ──
  const tray = page.locator('.discard-tray').first();
  await expect.poll(() => tray.count(), { timeout: 20_000 }).toBeGreaterThan(0);
  await tray.click();
  const pileModal = page.locator('[data-pile-modal]');
  await expect(pileModal).toBeVisible({ timeout: 5_000 });
  await expect(pileModal.locator('.tile').first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.querySelector('[data-pile-modal]')?.closest('.discard-tray') !== null,
    ),
    'the pile modal must not render inside a discard tray',
  ).toBe(false);
  await snap('pile-modal');
  // The backdrop covers the pile that was tapped, so a second tap in the same
  // place is what closes it — which is how it was asked for.
  const trayBox = (await tray.boundingBox())!;
  await page.mouse.click(trayBox.x + trayBox.width / 2, trayBox.y + trayBox.height / 2);
  await expect(pileModal).toHaveCount(0, { timeout: 5_000 });
});
