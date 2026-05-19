/**
 * E2E: one host + 3 bots → full round to round-end screen.
 *
 * The host creates a lobby, adds 3 bots, starts the game, then waits for
 * the round-end screen. The test doesn't try to play tiles — it just verifies
 * the game runs to completion with bots filling the other seats.
 */
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:8080';

test('full round to round-end with 3 bots', async ({ page }) => {
  // ── Create lobby via API ──────────────────────────────────────────────────
  const createRes = await page.request.post(`${BASE}/api/lobby`);
  expect(createRes.status()).toBe(201);
  const { code, hostToken } = await createRes.json() as { code: string; hostToken: string };
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);

  // ── Open the host join URL ────────────────────────────────────────────────
  await page.goto(`${BASE}/j/${code}`);

  // Should redirect to /?code=CODE and show the Landing screen
  await expect(page).toHaveURL(/\?code=/);

  // Click "Host a Game" → HostSetup
  await page.click('text=Host a Game');
  await page.fill('input[placeholder="Your name"]', 'TestHost');
  await page.click('text=Create Lobby');

  // Wait for the lobby screen (should show the lobby code)
  await expect(page.locator(`text=${code}`)).toBeVisible({ timeout: 10_000 });

  // The HostSetup should now show 3 empty seats with "+ Bot" buttons
  // Add 3 bots
  const botButtons = page.locator('text=+ Bot');
  await expect(botButtons).toHaveCount(3, { timeout: 5_000 });
  await botButtons.nth(0).click();
  await botButtons.nth(0).click(); // re-query — after first click the seat fills
  await botButtons.nth(0).click();

  // Wait for Start Game to be enabled
  await expect(page.locator('text=Start Game')).toBeEnabled({ timeout: 10_000 });
  await page.click('text=Start Game');

  // Wait for round-end screen (bots play to completion)
  await expect(page.locator('text=Round End')).toBeVisible({ timeout: 90_000 });

  // Verify score table shows 4 entries
  const scoreRows = page.locator('[class*="rounded-xl"][class*="px-4"]');
  await expect(scoreRows).toHaveCount(4, { timeout: 5_000 });
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
