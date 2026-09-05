import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(frontendDir, "src"),
    },
  },
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
    exclude: ["node_modules/**", "e2e/**"],
  },
});
