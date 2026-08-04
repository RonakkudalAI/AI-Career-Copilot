import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
    // Playwright E2E lives under e2e/ and must not be collected by Vitest.
    exclude: ["**/node_modules/**", "**/e2e/**", "**/dist/**", "**/.next/**"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
