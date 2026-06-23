import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["test/accounting/oracle/**/*.test.ts", "test/accounting/backend/**/*.spec.ts"],
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
