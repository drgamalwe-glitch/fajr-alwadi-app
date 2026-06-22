import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "accounting-ui.spec.ts",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [["html"], ["list"]],
  timeout: 120_000,
  use: {
    baseURL: "http://localhost:1420",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "node e2e-bridge/server.mjs",
      url: "http://127.0.0.1:3899/__e2e/health",
      reuseExistingServer: true,
      timeout: 15_000,
      env: {
        E2E_BRIDGE_PORT: "3899",
        E2E_DB_PATH: ":memory:",
      },
    },
    {
      command: "VITE_E2E=1 npm run dev",
      url: "http://localhost:1420",
      reuseExistingServer: true,
      timeout: 30_000,
      env: {
        VITE_E2E: "1",
      },
    },
  ],
});
