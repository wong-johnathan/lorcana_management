import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    setupFiles: ["./tests/prismaMock.ts"],
    exclude: ["dist/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/index.ts",
        // External AI prompt/orchestration and background sync are covered by
        // boundary tests; keep hard coverage gates on deterministic app code.
        "src/services/analysis.ts",
        "src/routes/sync.ts",
        // WebSocket transport is covered by focused integration tests, but V8
        // branch accounting over socket lifecycle internals is noisy for the global gate.
        "src/services/marketplaceRealtime.ts",
        "**/*.d.ts",
        "**/node_modules/**",
        "**/dist/**",
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
