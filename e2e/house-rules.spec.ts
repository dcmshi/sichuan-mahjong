/**
 * The host's house-rule toggle, end to end.
 *
 * 換三張 is not part of SBR — Novikov gives the deal as prepare wall → choose a
 * forbidden suit → East's turn, with no swap — so `enableHuanSanZhang` defaults
 * off and the huan screen is unreachable unless a host asks for it. Every other
 * spec drives practice mode, which therefore never sees it; this one hosts a
 * lobby, flips the switch, and is the only remaining coverage of the huan picker.
 *
 * Chromium only: it exercises a rule path and a control, not a layout, so the
 * extra viewport projects would add runtime and nothing else.
 */
import { type Page, expect, test } from '@playwright/test';

const BASE = 'http://localhost:8080';

const getPhase = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __e2e: { getPhase: () => string | null } }).__e2e.getPhase(),
  );

test('a host can turn on Swap three tiles, and the deal then opens on huan', async ({ page }) => {
  test.setTimeout(90_000);

  await page.goto(BASE);
  await page.getByRole('button', { name: /Host a Game/i }).click();
  await page.fill('input[placeholder="Your name"]', 'Ruler');
  await page.getByRole('button', { name: /Create Lobby/i }).click();

  // Off on arrival: the canonical ruleset is what you get by touching nothing.
  const toggle = page.getByRole('switch');
  await expect(toggle).toBeVisible({ timeout: 15_000 });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');

  // Each empty seat offers its level directly ("+ Easy" / "+ Medium") rather than
  // one "+ Bot" plus a shared mode selector, so the level a bot is added at is the
  // tap itself. Take the first each time — the count drops as seats fill. (N18)
  for (let i = 0; i < 3; i++) {
    await page
      .getByRole('button', { name: /\+ Easy/i })
      .first()
      .click();
    await page.waitForTimeout(200);
  }
  await expect(page.getByRole('button', { name: /Start Game/i })).toBeEnabled({ timeout: 15_000 });
  await page.getByRole('button', { name: /Start Game/i }).click();

  // The rule reached the engine: with it off this would be 'voidDeclare'.
  await expect.poll(() => getPhase(page), { timeout: 25_000 }).toBe('huan');

  // Tap through the picker the toggle just unlocked — three of one suit, confirm.
  const handTiles = page.locator('div.flex.flex-wrap img[alt]');
  await expect.poll(() => handTiles.count()).toBeGreaterThanOrEqual(13);
  const alts = await handTiles.evaluateAll(els => els.map(e => e.getAttribute('alt') ?? ''));
  const bySuit = new Map<string, number[]>();
  alts.forEach((a, i) => {
    const s = a.split('-')[0] ?? '';
    bySuit.set(s, [...(bySuit.get(s) ?? []), i]);
  });
  const picked = [...bySuit.values()].find(idx => idx.length >= 3);
  expect(picked, 'a 13-tile hand should hold three of some suit').toBeTruthy();
  for (const i of (picked as number[]).slice(0, 3)) await handTiles.nth(i).click();
  await page.getByRole('button', { name: /Confirm Swap/i }).click();

  // Bots submit their own swaps, and the deal moves on to the void declaration.
  await expect.poll(() => getPhase(page), { timeout: 20_000 }).toBe('voidDeclare');
});
