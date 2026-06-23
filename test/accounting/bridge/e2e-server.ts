import * as http from "node:http";
import type Database from "better-sqlite3";
import { handleCommand } from "./e2e-commands";

const PORT = 3899;
const PATH = "/__e2e/invoke";

export function startE2EServer(db: Database.Database): http.Server {
  const server = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === PATH) {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        try {
          const { command, args } = JSON.parse(body);
          const result = handleCommand(db, command, args ?? {});
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: msg }));
        }
      });
    } else if (req.method === "GET" && req.url === "/__e2e/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } else {
      res.writeHead(404);
      res.end("Not Found");
    }
  });

  return server;
}

export function startE2EServerAsync(db: Database.Database): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = startE2EServer(db);
    server.listen(PORT, "127.0.0.1", () => {
      console.log(`[E2E Bridge] Listening on http://127.0.0.1:${PORT}${PATH}`);
      resolve(server);
    });
    server.on("error", reject);
  });
}
