import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Load the repository-root .env for scripts that run outside Next.js.
 * Explicit process environment values win over values from the file.
 */
export function loadRootEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return envPath;

  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const [, name, rawValue] = match;
    let value = rawValue.trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[name] === undefined) process.env[name] = value;
  }

  return envPath;
}

