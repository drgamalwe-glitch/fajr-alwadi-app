import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./test/accounting/e2e",
  testMatch: ["accounting-ui.spec.ts", "comprehensive-ui.spec.ts"],
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [["html"], ["list"], ["json", { outputFile: "test/accounting/state/e2e-results.json" }]],
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
      command: "npm run dev",
      url: "http://localhost:1420",
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
