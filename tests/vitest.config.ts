import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", "dist", ".agent", "workspace-*"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    globals: true,
  },
  resolve: {
    alias: {
      // Map source imports for tests that import from src/
    },
  },
});
