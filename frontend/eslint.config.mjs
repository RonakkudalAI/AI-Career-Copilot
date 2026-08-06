import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": "warn",
      "no-useless-assignment": "off",
      // Migration-era call sites still use unknown API payloads; tighten later.
      "@typescript-eslint/no-explicit-any": "warn",
      // Legacy R3F globe and unused shadcn stubs may retain nocheck until deleted.
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-expect-error": "allow-with-description",
          "ts-ignore": true,
          "ts-nocheck": false,
          "ts-check": false,
        },
      ],
      // Session bootstrap legitimately syncs auth state on mount.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    // Unused shadcn scaffolding + legacy R3F globe — not primary product path.
    files: ["src/components/ui/**/*.{ts,tsx}", "src/features/jobs/components/career-globe.tsx"],
    rules: {
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "react-refresh/only-export-components": "off",
    },
  },

  globalIgnores(["dist/**", "coverage/**", "node_modules/**", "scripts/**"]),
]);
