import type { NextConfig } from "next";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Load repository-root `.env` into process.env for the Next server.
 * Next only auto-loads env files from the frontend package directory; this monorepo
 * keeps a single root `.env` shared with FastAPI.
 */
function loadRootEnvFile() {
  const frontendDir = path.dirname(fileURLToPath(import.meta.url));
  const rootEnv = path.resolve(frontendDir, "..", ".env");
  if (!existsSync(rootEnv)) return;

  for (const rawLine of readFileSync(rootEnv, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, name, rawValue] = match;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[name] === undefined) {
      process.env[name] = value;
    }
  }
}

loadRootEnvFile();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
