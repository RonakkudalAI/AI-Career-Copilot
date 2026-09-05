import { defineConfig, devices } from "@playwright/test";

const e2ePort = process.env.FRONTEND_PORT || process.env.PORT || "3000";
const e2eBase = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: e2eBase,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${e2ePort}`,
        url: e2eBase,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
