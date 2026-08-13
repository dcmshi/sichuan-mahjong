import { defineConfig, devices } from '@playwright/test';

// Separate from the root config on purpose: `pnpm e2e` must not write into
// docs/. Run it with `pnpm shots`.
export default defineConfig({
  testDir: '.',
  timeout: 300_000,
  retries: 0,
  workers: 1,
  use: { baseURL: 'http://localhost:8080', headless: true },
  // A phone is the design target, so the README shots are phone shots.
  // iPhone 14 at 2× rather than its native 3×: plenty for a README image and
  // roughly half the file size.
  projects: [
    {
      name: 'phone',
      use: { ...devices['iPhone 14'], browserName: 'chromium', deviceScaleFactor: 2 },
    },
  ],
  webServer: {
    command: 'node packages/server/dist/main.js --no-mdns --no-tailscale',
    cwd: '../..',
    url: 'http://localhost:8080/healthz',
    reuseExistingServer: false,
    timeout: 15_000,
    // Same reason as the root config's (A79): this is a real server, so every
    // lobby it opens lands in `live_rooms` in the developer's own database and
    // is restored at the next boot. A79 gave `pnpm e2e` a throwaway db and left
    // this one writing to the real thing — the deal here stays unseeded on
    // purpose, but where it writes was never deliberate.
    env: { SICHUAN_DATA_DIR: 'test-results/shots-data' },
  },
});
