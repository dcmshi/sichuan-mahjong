/**
 * E2E: host creates a lobby, adds 3 bots, plays a full round to round-end.
 *
 * Seat 0 (host/human) is driven by the test; bots handle the other 3 seats.
 * Game-phase actions (huan, void, discard, pass) are sent directly via the
 * window.__e2e helpers so Playwright's click path doesn't fight Framer Motion.
 */
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:8080';

type E2E = {
  huanSubmit: () => boolean;
  voidSubmit: () => boolean;
  autoPlay: () => boolean;
  getPhase: () => string | null;
  getScreen: () => string;
};

function e2e(page: import('@playwright/test').Page) {
  return {
    huanSubmit: () => page.evaluate(() => (window as unknown as { __e2e: E2E }).__e2e.huanSubmit()),
    voidSubmit: () => page.evaluate(() => (window as unknown as { __e2e: E2E }).__e2e.voidSubmit()),
    autoPlay:   () => page.evaluate(() => (window as unknown as { __e2e: E2E }).__e2e.autoPlay()),
    getPhase:   () => page.evaluate(() => (window as unknown as { __e2e: E2E }).__e2e.getPhase()),
    getScreen:  () => page.evaluate(() => (window as unknown as { __e2e: E2E }).__e2e.getScreen()),
  };
}

test('full round to round-end with 3 bots', async ({ page }) => {
  // ── Setup: host lobby with 3 bots ─────────────────────────────────────────
  await page.goto(BASE);
  await page.click('text=Host a Game');
  await page.fill('input[placeholder="Your name"]', 'TestHost');
  await page.click('text=Create Lobby');

  // Wait for any 4-char lobby code to appear in the lobby screen
  await expect(page.locator('text=/^[A-HJ-NP-Z2-9]{4}$/')).toBeVisible({ timeout: 10_000 });

  for (let i = 0; i < 3; i++) {
    await page.click('text=+ Bot');
    await page.waitForTimeout(300);
  }
  await expect(page.locator('text=Start Game')).toBeEnabled({ timeout: 10_000 });
  await page.click('text=Start Game');

  const g = e2e(page);

  // ── Single game loop: handles huan → void → play → roundEnd ───────────────
  // Reads phase from the Zustand store (not DOM) so one-shot timing is never an issue.
  const endLocator = page.locator('text=Round End');
  const deadline = Date.now() + 120_000;

  // Track last submitted phase to avoid flooding the server with repeats
  let huanDone = false;
  let voidDone = false;

  while (Date.now() < deadline) {
    if (await endLocator.isVisible({ timeout: 100 }).catch(() => false)) break;

    const phase = await g.getPhase();

    if (phase === null) {
      // Game view not yet received — wait for initial broadcast
      await page.waitForTimeout(300);
      continue;
    }

    if (phase === 'huan' && !huanDone) {
      const ok = await g.huanSubmit();
      if (ok) huanDone = true;
      await page.waitForTimeout(300);
      continue;
    }

    if (phase === 'voidDeclare' && !voidDone) {
      const ok = await g.voidSubmit();
      if (ok) voidDone = true;
      await page.waitForTimeout(300);
      continue;
    }

    if (phase === 'roundEnd') break;

    await g.autoPlay();
    await page.waitForTimeout(200);
  }

  await expect(endLocator).toBeVisible({ timeout: 10_000 });
});

test('replay API returns 404 for missing id', async ({ request }) => {
  const res = await request.get(`${BASE}/api/replay/99999`);
  expect(res.status()).toBe(404);
});

test('healthz returns ok', async ({ request }) => {
  const res = await request.get(`${BASE}/healthz`);
  expect(res.status()).toBe(200);
  const body = await res.json() as { ok: boolean };
  expect(body.ok).toBe(true);
});
