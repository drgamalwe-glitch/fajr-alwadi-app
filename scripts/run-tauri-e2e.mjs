import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const resultsDir = resolve(root, "test-results", "tauri-e2e");
const binaryName = process.platform === "win32" ? "fajir-alwadi.exe" : "fajir-alwadi";
const binaryPath = resolve(root, "src-tauri", "target", "debug", binaryName);

async function run(command, args, extraEnv = {}) {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, ...extraEnv },
      stdio: "inherit",
      shell: false,
    });
    child.once("error", rejectPromise);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(
          new Error(
            `${command} ${args.join(" ")} failed (${signal ? `signal ${signal}` : `exit ${code}`})`,
          ),
        );
      }
    });
  });
}

await rm(resultsDir, { recursive: true, force: true });
await mkdir(resultsDir, { recursive: true });

await run(
  process.platform === "win32" ? "npm.cmd" : "npm",
  [
    "run",
    "tauri",
    "--",
    "build",
    "--debug",
    "--no-bundle",
    "--features",
    "e2e",
    "--config",
    "src-tauri/tauri.e2e.conf.json",
  ],
  { VITE_E2E: "1" },
);

const domains = [
  {
    name: "core",
    spec: "./test/e2e/accounting-workflows.e2e.mjs",
    persistenceSpec: "./test/e2e/persistence.e2e.mjs",
  },
  {
    name: "cars",
    spec: "./test/e2e/cars-batch-identity.e2e.mjs",
    persistenceSpec: "./test/e2e/domain-persistence.e2e.mjs",
  },
  {
    name: "agencies-expenses",
    spec: "./test/e2e/agencies-expenses.e2e.mjs",
    persistenceSpec: "./test/e2e/domain-persistence.e2e.mjs",
  },
  {
    name: "accounts",
    spec: "./test/e2e/accounts-settlements.e2e.mjs",
    persistenceSpec: "./test/e2e/domain-persistence.e2e.mjs",
  },
  {
    name: "installments-periods",
    spec: "./test/e2e/installments-periods.e2e.mjs",
    persistenceSpec: "./test/e2e/domain-persistence.e2e.mjs",
  },
  {
    name: "installment-redistribution",
    spec: "./test/e2e/installment-redistribution.e2e.mjs",
    persistenceSpec: "./test/e2e/domain-persistence.e2e.mjs",
  },
];

for (const domain of domains) {
  const dataDir = resolve(root, "test-results", `tauri-e2e-data-${domain.name}`);
  await rm(dataDir, { recursive: true, force: true });
  await mkdir(dataDir, { recursive: true });

  const sharedEnv = {
    FAJR_E2E_APP_DIR: dataDir,
    FAJR_E2E_APP_BINARY: binaryPath,
    FAJR_E2E_DOMAIN: domain.name,
    VITE_E2E: "1",
  };
  await run(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "test:e2e:run"],
    {
      ...sharedEnv,
      FAJR_E2E_SPEC: domain.spec,
    },
  );
  await run(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "test:e2e:run"],
    {
      ...sharedEnv,
      FAJR_E2E_PHASE: "persistence",
      FAJR_E2E_SPEC: domain.persistenceSpec,
    },
  );
}
