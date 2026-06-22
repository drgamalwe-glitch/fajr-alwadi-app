import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["tests/accounting-oracle/**/*.test.ts", "tests/backend/**/*.spec.ts"],
    testTimeout: 30_000,
  },
});
