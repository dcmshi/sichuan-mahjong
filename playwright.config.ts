import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:8080',
    headless: true,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'node packages/server/dist/main.js --no-mdns --no-tailscale',
    url: 'http://localhost:8080/healthz',
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
