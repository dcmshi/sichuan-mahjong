/** E2E: Practice mode (vs 3 bots) — play TWO full rounds (multi-round), then End Match. */
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

  // Practice mode creates the lobby, adds 3 bots, and starts — all server-side
  // in one flow (no manual addBot clicks / lobby reconnect race). The practice
  // host is seat 0, so the host-only Next Round / End Match controls apply.
  await page.click('text=Practice (vs Bots)');
  await page.waitForFunction(() => (window as unknown as { __e2e: E2E }).__e2e.getScreen() === 'game', null, { timeout: 20_000 });

  const g = e2e(page);

  // ── Round 1 ── (wait on store screen, not DOM text — language-independent)
  await playToRoundEnd(page, g);
  await page.waitForFunction(() => (window as unknown as { __e2e: E2E }).__e2e.getScreen() === 'roundEnd', null, { timeout: 10_000 });
  await page.screenshot({ path: 'test-results/match-round1-end.png' });

  // ── Next Round → Round 2 ──
  await page.click('text=Next Round');
  await page.waitForTimeout(500);
  await playToRoundEnd(page, g);
  await page.waitForFunction(() => (window as unknown as { __e2e: E2E }).__e2e.getScreen() === 'roundEnd', null, { timeout: 10_000 });
  await expect(page.locator('text=Match Total')).toBeVisible({ timeout: 5_000 });
  await page.screenshot({ path: 'test-results/match-round2-end.png' });

  // ── End Match → back to landing ──
  await page.click('text=End Match');
  await page.waitForFunction(() => (window as unknown as { __e2e: E2E }).__e2e.getScreen() === 'landing', null, { timeout: 10_000 });
});
