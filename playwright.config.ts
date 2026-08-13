import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // match.spec plays TWO full bot rounds, and playToRoundEnd allows up to 90s
  // per round (180s of legitimate play). A 120s per-test budget could not cover
  // that, so a slow CI runner killed the test mid-round-2. 240s leaves headroom
  // over 2×90s + setup/Next-Round/screenshots; happy-path runs still finish ~1m.
  timeout: 240_000,
  retries: 0,
  // One worker: the specs share a single game server, so running them serially
  // avoids two concurrent bot games contending on one Node event loop. (No
  // retries on purpose — they'd mask real intermittent bugs.)
  workers: 1,
  use: {
    baseURL: 'http://localhost:8080',
    headless: true,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // A24: the real-click spec also runs across phone/tablet viewports, both
    // orientations — it performs genuine taps, so a layout that clips or covers
    // a control fails the run. Device descriptors default to webkit; force the
    // chromium engine so CI needs no extra browser installs (viewport, touch,
    // and mobile emulation still apply). The __e2e-driven specs stay
    // chromium-only: they bypass the UI, so extra viewports add nothing.
    {
      name: 'iphone-portrait',
      use: { ...devices['iPhone 14'], browserName: 'chromium' },
      testMatch: /ui-clicks/,
    },
    {
      name: 'iphone-landscape',
      use: { ...devices['iPhone 14 landscape'], browserName: 'chromium' },
      testMatch: /ui-clicks/,
    },
    {
      name: 'ipad-portrait',
      use: { ...devices['iPad (gen 7)'], browserName: 'chromium' },
      testMatch: /ui-clicks/,
    },
    {
      name: 'ipad-landscape',
      use: { ...devices['iPad (gen 7) landscape'], browserName: 'chromium' },
      testMatch: /ui-clicks/,
    },
    // The vertical-overflow guard runs on the smallest supported phone, which is
    // where the height budget is tightest. (viewport-audit.md R5)
    {
      name: 'se-portrait',
      use: { ...devices['iPhone SE'], browserName: 'chromium' },
      testMatch: /viewport/,
    },
  ],
  webServer: {
    // --bot-delay 150 pins the pre-O2 pace. The 700ms default exists so a human
    // can follow a bot circuit; these specs play whole rounds and assert nothing
    // about timing, so paying it would add minutes across six projects for
    // nothing. Anything that ever *does* depend on the pace must set it itself.
    command: 'node packages/server/dist/main.js --no-mdns --no-tailscale --bot-delay 150',
    url: 'http://localhost:8080/healthz',
    reuseExistingServer: false,
    timeout: 15_000,
    // Pin the deal. `viewport.spec.ts` refuses to pass without having seen a real
    // claim window — which is the point, since otherwise it passes for free on a
    // round that offered this seat no claim — but on a random deal that is a coin
    // toss, and it failed a full-suite run after passing three isolated ones.
    // A fixed seed makes it the same round every time, so a failure means the
    // layout changed rather than the deal did. (`SM_SEED`, room.ts)
    env: {
      SM_SEED: 'e2e-fixed-deal',
      // **Keep the suite out of the developer's real database.** (A79)
      //
      // e2e runs a real server, so unlike the unit suites — which `vi.mock` the
      // persistence module — every lobby it opens is written to `live_rooms` in
      // `%APPDATA%/sichuan-mahjong/games.db`, and every finished round adds a
      // `games` row. Those rows are restored at boot and count against the
      // concurrent-games ceiling, which CLAUDE.md documents as a trap with a
      // manual remedy ("clear it with the server stopped"). One session of
      // repeated e2e runs left **72 live rooms** behind — above the hosted
      // ceiling of 50.
      //
      // The remedy is not to remember to clear it. `test-results/` is already
      // gitignored as Playwright's own output, so the suite gets its own
      // throwaway database and the trap stops being reachable from here.
      SICHUAN_DATA_DIR: 'test-results/e2e-data',
    },
  },
});
