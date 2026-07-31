import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { loadRootEnv } from "../shared/load-env.mjs";

loadRootEnv();

const python = process.platform === "win32" ? "backend/.venv/Scripts/python.exe" : "backend/.venv/bin/python";
if (!existsSync(python)) {
  console.error("Backend environment is missing. Run npm install first.");
  process.exit(1);
}

function run(script) {
  const result = spawnSync(python, [script], {
    cwd: process.cwd(),
    env: { ...process.env, PYTHONPATH: "backend" },
    stdio: "inherit",
  });
  return result.status ?? 1;
}

console.log("[dev] Applying the local SQLite schema...");
if (run("scripts/setup/migrate-local-db.py") !== 0) {
  console.error("[dev] SQLite schema setup failed.");
  process.exit(1);
}

console.log("[dev] Checking SQLite write/read behavior...");
if (run("scripts/diagnostics/check-local-db.py") !== 0) {
  console.error("[dev] SQLite write/read verification failed.");
  process.exit(1);
}
