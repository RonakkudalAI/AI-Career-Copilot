import process from "node:process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootLoadEnv = resolve(scriptDir, "../../scripts/shared/load-env.mjs");
if (existsSync(rootLoadEnv)) {
  const { loadRootEnv } = await import(pathToFileURL(rootLoadEnv).href);
  loadRootEnv();
}

const required = ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"];
const missing = required.filter((name) => !String(process.env[name] || "").trim());

if (process.env.VITE_SUPABASE_URL) {
  try {
    const url = new URL(process.env.VITE_SUPABASE_URL);
    if (!new Set(["http:", "https:"]).has(url.protocol)) missing.push("VITE_SUPABASE_URL (must be HTTP(S))");
  } catch {
    missing.push("VITE_SUPABASE_URL (malformed URL)");
  }
}

if (missing.length) {
  console.error("Frontend deployment configuration failed; values are intentionally suppressed.");
  console.error(`Missing or invalid browser configuration: ${[...new Set(missing)].join(", ")}`);
  console.error("Set these variables in the Vercel project for Preview and Production, then redeploy.");
  process.exit(1);
}

console.log("Browser authentication configuration verified.");
