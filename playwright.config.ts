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
  ],
  webServer: {
    command: 'node packages/server/dist/main.js --no-mdns --no-tailscale',
    url: 'http://localhost:8080/healthz',
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
