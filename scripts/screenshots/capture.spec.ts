/**
 * Regenerates the README screenshots in docs/ by driving the real app.
 *
 *   VITE_E2E=1 pnpm --filter @sichuan-mahjong/client build
 *   pnpm --filter sichuan-mahjong build
 *   pnpm shots
 *
 * Deliberately not part of `pnpm e2e`: it writes into the repo and asserts
 * nothing beyond "the screen rendered". It needs the VITE_E2E build only for
 * the window.__e2e drive helpers — they attach a window object and change
 * nothing on screen.
 */
import { type Page, expect, test } from '@playwright/test';

const BASE = 'http://localhost:8080';
const OUT = 'docs';

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

/** Let animations settle so a shot never catches a half-played entrance. */
async function shot(page: Page, file: string) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${file}`, fullPage: true });
}

test('regenerate docs screenshots', async ({ page, browser }) => {
  test.setTimeout(180_000);
  const g = e2e(page);

  // ── Landing ──────────────────────────────────────────────────────────────
  await page.goto(BASE);
  await expect(page.getByRole('button', { name: /Host a Game/ })).toBeVisible();
  await shot(page, 'landing.png');

  // ── Host a lobby with three bots. A real name, not "You": the spectator
  //    header renders "{name}'s turn", which reads badly otherwise. ─────────
  await page.click('text=Host a Game');
  await page.fill('input[placeholder="Your name"]', 'Alex');
  await page.click('text=Create Lobby');

  const codeLoc = page.locator('text=/^[A-HJ-NP-Z2-9]{4}$/').first();
  await expect(codeLoc).toBeVisible({ timeout: 10_000 });
  const code = ((await codeLoc.textContent()) ?? '').trim();
  expect(code).toHaveLength(4);

  for (let i = 0; i < 3; i++) {
    await page.click('text=+ Bot');
    await page.waitForTimeout(250);
  }
  await expect(page.locator('text=Start Game')).toBeEnabled({ timeout: 10_000 });
  await page.click('text=Start Game');

  // ── Play into the middle of the round, so the pools and melds have
  //    something in them, then wait for our own turn. ────────────────────────
  let huanDone = false;
  let voidDone = false;
  let moves = 0;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if ((await g.getScreen()) === 'roundEnd') break;
    const phase = await g.getPhase();
    if (phase === null) {
      await page.waitForTimeout(200);
      continue;
    }
    if (phase === 'huan' && !huanDone) {
      if (await g.huanSubmit()) huanDone = true;
      await page.waitForTimeout(250);
      continue;
    }
    if (phase === 'voidDeclare' && !voidDone) {
      if (await g.voidSubmit()) voidDone = true;
      await page.waitForTimeout(250);
      continue;
    }
    if (
      moves >= 14 &&
      (await page
        .locator('text=Your turn')
        .isVisible()
        .catch(() => false))
    )
      break;
    if (await g.autoPlay()) moves++;
    await page.waitForTimeout(180);
  }

  await shot(page, 'screenshot.png');

  // ── Spectator view of that same live game, from a clean context so it has
  //    no stored seat of its own. ───────────────────────────────────────────
  const watcher = await browser.newContext({ viewport: page.viewportSize() ?? undefined });
  const wpage = await watcher.newPage();
  await wpage.goto(BASE);
  await wpage.click('text=Watch a Game');
  await wpage.fill('input', code);
  await wpage.getByRole('button', { name: /^Watch$/ }).click();
  await expect(wpage.locator('text=Spectating')).toBeVisible({ timeout: 15_000 });
  await shot(wpage, 'spectate.png');
  await watcher.close();

  // ── Round end ────────────────────────────────────────────────────────────
  while (Date.now() < deadline + 60_000) {
    if ((await g.getScreen()) === 'roundEnd') break;
    await g.autoPlay();
    await page.waitForTimeout(180);
  }
  await expect(page.locator('text=Round End')).toBeVisible({ timeout: 15_000 });
  await shot(page, 'round-end.png');
});
