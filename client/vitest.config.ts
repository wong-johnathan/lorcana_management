import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    environmentOptions: {
      jsdom: { url: "http://localhost/" },
    },
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // Explicit per-test cap: 30 s, up from vitest's 5 s default.
    // Heavy jsdom tests (full-page renders + userEvent) exceed 5 s once v8
    // coverage instrumentation runs on a loaded CI/dev host: measured 4.2-9.0 s
    // on a 4-core box at load avg 10-16, with the offending test rotating between
    // runs (listing-form dropdowns 7.3 s, enquire AC-12.1 4.2-6.0 s, sell-page
    // submit 5.5 s, price-movers 5.1 s). A global cap keeps the coverage gate
    // deterministic without editing each heavy test; assertions and the 90%
    // coverage thresholds below are untouched and a genuine hang still fails.
    testTimeout: 30_000,
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/main.tsx",
        "src/App.tsx",
        "src/vite-env.d.ts",
        "src/types/**",
        "src/pages/**",
        "**/*.d.ts",
      ],
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
    },
  },
});
