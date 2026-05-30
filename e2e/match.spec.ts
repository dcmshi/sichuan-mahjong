/** E2E: host + 3 bots, play TWO full rounds (multi-round), then End Match. */
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:8080';

type E2E = {
  huanSubmit: () => boolean;
  voidSubmit: () => boolean;
  autoPlay: () => boolean;
  getPhase: () => string | null;
  getScreen: () => string;
};
const e2e = (page: import('@playwright/test').Page) => ({
  huanSubmit: () => page.evaluate(() => (window as unknown as { __e2e: E2E }).__e2e.huanSubmit()),
  voidSubmit: () => page.evaluate(() => (window as unknown as { __e2e: E2E }).__e2e.voidSubmit()),
  autoPlay:   () => page.evaluate(() => (window as unknown as { __e2e: E2E }).__e2e.autoPlay()),
  getPhase:   () => page.evaluate(() => (window as unknown as { __e2e: E2E }).__e2e.getPhase()),
  getScreen:  () => page.evaluate(() => (window as unknown as { __e2e: E2E }).__e2e.getScreen()),
});

async function playToRoundEnd(page: import('@playwright/test').Page, g: ReturnType<typeof e2e>) {
  let huanDone = false, voidDone = false;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (g === undefined) break;
    const screen = await g.getScreen();
    if (screen === 'roundEnd') return;
    const phase = await g.getPhase();
    if (phase === null) { await page.waitForTimeout(200); continue; }
    if (phase === 'huan' && !huanDone) { if (await g.huanSubmit()) huanDone = true; await page.waitForTimeout(250); continue; }
    if (phase === 'voidDeclare' && !voidDone) { if (await g.voidSubmit()) voidDone = true; await page.waitForTimeout(250); continue; }
    if (phase === 'roundEnd') return;
    await g.autoPlay();
    await page.waitForTimeout(180);
  }
  throw new Error('round did not reach roundEnd in time');
}

test('two-round match vs bots, then end match', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 820 });
  await page.goto(BASE);
  await page.click('text=Host a Game');
  await page.fill('input[placeholder="Your name"]', 'TestHost');
  await page.click('text=Create Lobby');
  await expect(page.locator('text=/^[A-HJ-NP-Z2-9]{4}$/')).toBeVisible({ timeout: 10_000 });
  for (let i = 0; i < 3; i++) { await page.click('text=+ Bot'); await page.waitForTimeout(250); }
  await expect(page.locator('text=Start Game')).toBeEnabled({ timeout: 10_000 });
  await page.click('text=Start Game');

  const g = e2e(page);

  // ── Round 1 ──
  await playToRoundEnd(page, g);
  await expect(page.locator('text=Round End')).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: 'test-results/match-round1-end.png' });

  // ── Next Round → Round 2 ──
  await page.click('text=Next Round');
  await page.waitForTimeout(500);
  await playToRoundEnd(page, g);
  await expect(page.locator('text=Round End')).toBeVisible({ timeout: 10_000 });
  // Match total should be visible after 2 rounds.
  await expect(page.locator('text=Match Total')).toBeVisible({ timeout: 5_000 });
  await page.screenshot({ path: 'test-results/match-round2-end.png' });

  // ── End Match → back to landing ──
  await page.click('text=End Match');
  await expect(page.locator('text=Host a Game')).toBeVisible({ timeout: 10_000 });
});
