import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const resultsDir = resolve("test-results", "tauri-e2e");
mkdirSync(resultsDir, { recursive: true });

export const config = {
  runner: "local",
  specs: [
    process.env.FAJR_E2E_SPEC ??
      (process.env.FAJR_E2E_PHASE === "persistence"
        ? "./test/e2e/persistence.e2e.mjs"
        : "./test/e2e/accounting-workflows.e2e.mjs"),
  ],
  maxInstances: 1,
  logLevel: "error",
  bail: 1,
  waitforTimeout: 12_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 1,
  services: [
    [
      "@wdio/tauri-service",
      {
        driverProvider: "embedded",
        appBinaryPath: process.env.FAJR_E2E_APP_BINARY,
        captureBackendLogs: true,
        captureFrontendLogs: true,
        startTimeout: 120_000,
        commandTimeout: 60_000,
      },
    ],
  ],
  capabilities: [
    {
      browserName: "tauri",
      "tauri:options": {
        application: process.env.FAJR_E2E_APP_BINARY,
      },
    },
  ],
  framework: "mocha",
  reporters: [["spec", { addConsoleLogs: true }]],
  mochaOpts: {
    ui: "bdd",
    timeout: 180_000,
    bail: true,
  },
  async afterTest(test, _context, result) {
    if (!result.passed) {
      const safeName = test.title.replace(/[^\p{L}\p{N}_.-]+/gu, "-");
      await browser.saveScreenshot(resolve(resultsDir, `${safeName}.png`));
    }
  },
};
