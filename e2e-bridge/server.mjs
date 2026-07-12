// e2e-bridge/server.mjs
//
// FORENSIC FIX (re-audit 2026-07-11, E2E-BRIDGE-1):
// Previously this file was a pure stub returning HTTP 503 for every
// /__e2e/invoke call. That caused every backend-dependent E2E test to fail
// with a generic "bridge not available" error, giving the false impression
// that the backend itself was broken.
//
// The bridge now attempts to spawn the compiled Rust binary as a child
// process and proxies requests to it over stdin/stdout (JSON-RPC). If the
// binary is missing (cargo hasn't been run), the bridge logs a clear warning
// AND returns HTTP 503 with an actionable error message — but the health
// endpoint stays 200 OK so Playwright's webServer config can boot the test
// harness regardless of build state.
//
// Usage:
//   1. Build the backend once:  cd src-tauri && cargo build
//   2. Start the bridge:         node e2e-bridge/server.mjs
//   3. Run E2E tests:            VITE_E2E=1 npx playwright test
//
// If the Rust binary path is overridden, set E2E_RUST_BIN=/path/to/binary.

import { createServer } from "node:http";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.E2E_BRIDGE_PORT || "3899", 10);
const DB_PATH = process.env.E2E_DB_PATH || join(__dirname, "..", "test", "accounting", "state", "e2e.db");
const RUST_BIN = process.env.E2E_RUST_BIN || join(__dirname, "..", "src-tauri", "target", "debug", "fajir-alwadi");

// Ensure the state directory exists.
const stateDir = dirname(DB_PATH);
if (!existsSync(stateDir)) {
  mkdirSync(stateDir, { recursive: true });
}

const rustBinAvailable = existsSync(RUST_BIN);
if (!rustBinAvailable) {
  console.warn(`[e2e-bridge] WARNING: Rust binary not found at ${RUST_BIN}`);
  console.warn(`[e2e-bridge]          Build it first with: cd src-tauri && cargo build`);
  console.warn(`[e2e-bridge]          /__e2e/invoke will return HTTP 503 until the binary is built.`);
} else {
  console.log(`[e2e-bridge] Rust binary detected at ${RUST_BIN}`);
}

// Long-lived child process for the Rust backend. Spawned lazily on first
// invoke request, reused for subsequent requests. Restarted on crash.
let rustProc = null;
let rustProcBusy = false; // simple mutex: only one in-flight request at a time

function ensureRustProc() {
  if (rustProc && !rustProc.killed) return rustProc;
  if (!rustBinAvailable) return null;
  rustProc = spawn(RUST_BIN, ["--headless-bridge"], {
    stdio: ["pipe", "pipe", "inherit"],
  });
  rustProc.on("exit", (code, signal) => {
    console.warn(`[e2e-bridge] Rust backend exited (code=${code}, signal=${signal})`);
    rustProc = null;
    rustProcBusy = false;
  });
  return rustProc;
}

function invokeRust(command, args) {
  return new Promise((resolve, reject) => {
    const proc = ensureRustProc();
    if (!proc) {
      reject(new Error(`Rust backend binary not found at ${RUST_BIN}. Run 'cargo build' first.`));
      return;
    }
    if (rustProcBusy) {
      reject(new Error("Rust backend is busy with another request; e2e-bridge currently serializes requests."));
      return;
    }
    rustProcBusy = true;

    const req = JSON.stringify({ command, args }) + "\n";
    let buf = "";

    const onExit = () => {
      rustProcBusy = false;
      reject(new Error("Rust backend exited before responding"));
    };
    proc.once("exit", onExit);

    const onData = (chunk) => {
      buf += chunk.toString("utf8");
      const nl = buf.indexOf("\n");
      if (nl === -1) return;
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      proc.stdout.off("data", onData);
      proc.off("exit", onExit);
      rustProcBusy = false;
      try {
        const parsed = JSON.parse(line);
        if (parsed.error) reject(new Error(parsed.error));
        else resolve(parsed.result);
      } catch (err) {
        reject(new Error(`Failed to parse Rust backend response: ${err.message}`));
      }
    };
    proc.stdout.on("data", onData);
    proc.stdin.write(req);
  });
}

const server = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/__e2e/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      mode: rustBinAvailable ? "real" : "stub",
      port: PORT,
      db: DB_PATH,
      rustBin: RUST_BIN,
      rustBinAvailable,
    }));
    return;
  }

  if (req.url === "/__e2e/invoke" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", async () => {
      let parsed;
      try { parsed = JSON.parse(body || "{}"); }
      catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `Invalid JSON body: ${e.message}` }));
        return;
      }
      try {
        const result = await invokeRust(parsed.command, parsed.args || {});
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ result }));
      } catch (e) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          error: e.message,
          command: parsed.command,
          hint: rustBinAvailable
            ? "Rust backend crashed or returned an invalid response."
            : "Build the Rust backend first: cd src-tauri && cargo build",
        }));
      }
    });
    return;
  }

  if (req.url === "/__e2e/db" && req.method === "POST") {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      error: "Direct DB access endpoint is deprecated. Use /__e2e/invoke with backend commands.",
    }));
    return;
  }

  if (req.url === "/__e2e/reset" && req.method === "POST") {
    // Defer to the backend: call its reset command if available.
    invokeRust("reset_test_db", {})
      .then(() => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
      })
      .catch((e) => {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "error", error: e.message }));
      });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found", path: req.url }));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[e2e-bridge] listening on http://127.0.0.1:${PORT}`);
  console.log(`[e2e-bridge] DB path: ${DB_PATH}`);
  console.log(`[e2e-bridge] mode: ${rustBinAvailable ? "REAL (Rust binary detected)" : "STUB (Rust binary missing)"}`);
});

process.on("SIGTERM", () => {
  if (rustProc) { try { rustProc.kill("SIGTERM"); } catch {} }
  server.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  if (rustProc) { try { rustProc.kill("SIGTERM"); } catch {} }
  server.close(() => process.exit(0));
});

