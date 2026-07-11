// e2e-bridge/server.mjs
//
// FORENSIC FIX (re-audit 2026-07-10):
// This file was referenced in package.json and playwright.config.ts but
// did not exist on disk, causing `npm run test:backend` and `npm run test:e2e`
// to fail with MODULE_NOT_FOUND.
//
// The bridge is a minimal HTTP server that the Playwright/Vitest E2E tests
// use to talk to the Rust backend without launching the full Tauri desktop
// app. In a real environment with cargo available, this would spawn the
// Rust binary as a child process and proxy JSON-RPC calls to it. In this
// Python-only environment, we provide a stub that:
//   1. Responds to /__e2e/health so Playwright's webServer config passes.
//   2. Exposes /__e2e/invoke for the test suite to call Tauri commands
//      (returns a clear "bridge not available" error so tests fail
//      gracefully rather than crashing).
//   3. Exposes /__e2e/db for direct SQLite access (used by the accounting
//      oracle tests to verify backend state).

import { createServer } from "node:http";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.E2E_BRIDGE_PORT || "3899", 10);
const DB_PATH = process.env.E2E_DB_PATH || join(__dirname, "..", "test", "accounting", "state", "e2e.db");

// Ensure the state directory exists.
const stateDir = dirname(DB_PATH);
if (!existsSync(stateDir)) {
  mkdirSync(stateDir, { recursive: true });
}

const server = createServer((req, res) => {
  // CORS headers for local development.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check — used by Playwright webServer config.
  if (req.url === "/__e2e/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", mode: "stub", port: PORT, db: DB_PATH }));
    return;
  }

  // Invoke a Tauri command (stub — requires Rust backend).
  if (req.url === "/__e2e/invoke" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: "E2E bridge stub: Rust backend not available in this environment.",
        command: body ? JSON.parse(body).cmd : null,
        hint: "Run with cargo + tauri dev to enable real backend invocation.",
      }));
    });
    return;
  }

  // Direct DB access (stub — would use better-sqlite3 or rusqlite in production).
  if (req.url === "/__e2e/db" && req.method === "POST") {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      error: "E2E bridge stub: DB access not available without Rust backend.",
    }));
    return;
  }

  // Reset DB (used between test scenarios).
  if (req.url === "/__e2e/reset" && req.method === "POST") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", message: "DB reset (stub)" }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found", path: req.url }));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[e2e-bridge] listening on http://127.0.0.1:${PORT}`);
  console.log(`[e2e-bridge] DB path: ${DB_PATH}`);
  console.log("[e2e-bridge] NOTE: This is a stub. Real backend invocation requires cargo + tauri dev.");
});

// Graceful shutdown.
process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
