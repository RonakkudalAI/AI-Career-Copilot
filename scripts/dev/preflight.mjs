import { spawnSync } from "node:child_process";
import { loadRootEnv } from "../shared/load-env.mjs";

loadRootEnv();

console.log("[dev] Checking Firebase Firestore write/read behavior...");
const result = spawnSync(process.execPath, ["scripts/setup/firebase.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env },
  stdio: "inherit",
  timeout: Number(process.env.DEV_PREFLIGHT_TIMEOUT_MS || 30_000),
});
if ((result.status ?? 1) !== 0) {
  const strict = process.argv.includes("--strict");
  const message = "[dev] Firebase/Supabase connectivity check failed. The API may report database errors until the configured remote services are reachable.";
  if (strict) {
    console.error(`${message} Strict preflight stopped startup.`);
    process.exit(result.status ?? 1);
  }
  console.warn(`${message} Continuing local startup so the backend can expose the precise health/API error.`);
}
