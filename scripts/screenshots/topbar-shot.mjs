/**
 * One-off: capture the play-screen top bar (wall count + turn pill) mid-round,
 * on your own turn. Needs the VITE_E2E build served on :8080.
 *
 *   node scripts/screenshots/topbar-shot.mjs
 */
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:8080';
const OUT = 'test-results/teahouse-luxe/topbar.png';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const g = {
  huanSubmit: () => page.evaluate(() => window.__e2e.huanSubmit()),
  voidSubmit: () => page.evaluate(() => window.__e2e.voidSubmit()),
  autoPlay: () => page.evaluate(() => window.__e2e.autoPlay()),
  getPhase: () => page.evaluate(() => window.__e2e.getPhase()),
  getScreen: () => page.evaluate(() => window.__e2e.getScreen()),
};

await page.goto(BASE);
await page.click('text=Host a Game');
await page.fill('input[placeholder="Your name"]', 'Alex');
await page.click('text=Create Lobby');
for (let i = 0; i < 3; i++) {
  await page
    .getByRole('button', { name: /\+ Easy/i })
    .first()
    .click();
  await page.waitForTimeout(250);
}
await page.click('text=Start Game');

const deadline = Date.now() + 90_000;
let done = false;
while (Date.now() < deadline && !done) {
  if ((await g.getScreen()) === 'roundEnd') {
    await page.getByRole('button', { name: /Next Round/ }).click();
    await page.waitForTimeout(900);
    continue;
  }
  const phase = await g.getPhase();
  if (phase === 'huan') {
    await g.huanSubmit();
    await page.waitForTimeout(250);
    continue;
  }
  if (phase === 'voidDeclare') {
    await g.voidSubmit();
    await page.waitForTimeout(250);
    continue;
  }
  const yourTurn = await page
    .locator('[data-your-turn="true"]')
    .isVisible()
    .catch(() => false);
  if (phase === 'play' && yourTurn) {
    // The dice ceremony (seat roll + wall break) sits over the board at phase
    // 'play' — wait it out or the shot is the dice, not the bar.
    await page
      .locator('[data-dice-overlay="true"]')
      .waitFor({ state: 'hidden', timeout: 15_000 })
      .catch(() => {});
    await page.waitForTimeout(900);
    if ((await g.getScreen()) !== 'game') continue;
    if (
      !(await page
        .locator('[data-your-turn="true"]')
        .isVisible()
        .catch(() => false))
    )
      continue;
    await page.screenshot({ path: OUT });
    done = true;
    break;
  }
  await g.autoPlay();
  await page.waitForTimeout(180);
}

await browser.close();
if (!done) {
  console.error('never reached a playable your-turn frame');
  process.exit(1);
}
console.log(`wrote ${OUT}`);
