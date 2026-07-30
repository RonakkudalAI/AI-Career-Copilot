import { defineConfig, devices } from "@playwright/test";

const backendPython = process.platform === "win32"
  ? "backend\\.venv\\Scripts\\python.exe"
  : "backend/.venv/bin/python";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 2,
  timeout: 45000,
  expect: { timeout: 12000 },
  retries: 0,
  reporter: "list",
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  webServer: [
    {
      command: `${backendPython} -m uvicorn app.main:app --port 8000 --app-dir backend`,
      url: "http://127.0.0.1:8000/api/v1/health",
      env: {
        FRONTEND_ORIGINS: "http://localhost:3100,http://127.0.0.1:3100",
      },
      reuseExistingServer: false,
      timeout: 120000,
    },
    {
      command: "npm run dev:frontend -- -p 3100",
      url: "http://localhost:3100",
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
