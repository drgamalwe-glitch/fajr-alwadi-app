import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
// @ts-expect-error process is a nodejs global
const isE2E = process.env.VITE_E2E === "1";

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  resolve: {
    alias: {
      "@logo": resolve(__dirname, "public/logo.png"),
      "@": resolve(__dirname, "./src"),
    },
  },

  build: {
    rolldownOptions: {
      output: isE2E
        ? {
            // WKWebView driven by the embedded macOS WebDriver is more stable
            // with one deterministic module graph. Production keeps the normal
            // split chunks below.
            codeSplitting: false,
          }
        : {
            codeSplitting: {
              groups: [
            {
              name: "vendor-pdf",
              test: /node_modules[\\/](?:@react-pdf|fontkit|yoga-layout)[\\/]/,
              minSize: 100_000,
              maxSize: 400_000,
              priority: 30,
            },
            {
              name: "vendor-react",
              test: /node_modules[\\/]react(?:-dom)?[\\/]/,
              priority: 25,
            },
            {
              name: "tab-cars",
              test: /src[\\/]components[\\/](?:CarsTab|CarFormPanel)/,
              priority: 20,
            },
            {
              name: "tab-partners",
              test: /src[\\/]components[\\/](?:PartnersTab|partners[\\/])/,
              priority: 20,
            },
            {
              name: "tab-agencies",
              test: /src[\\/]components[\\/]AgenciesTab/,
              priority: 20,
            },
            {
              name: "tab-reports",
              test: /src[\\/]components[\\/](?:Dashboard|ProfitDistributionTab|CompanyStatusTab)/,
              priority: 20,
            },
              ],
            },
          },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
