import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { loadRootEnv } from "../shared/load-env.mjs";

loadRootEnv();

const python = process.platform === "win32" ? "backend/.venv/Scripts/python.exe" : "backend/.venv/bin/python";
if (!existsSync(python)) {
  console.error("Backend environment is missing; SQLite setup will run after the backend environment is created.");
  process.exit(1);
}

for (const script of ["scripts/setup/migrate-local-db.py", "scripts/diagnostics/check-local-db.py"]) {
  const result = spawnSync(python, [script], {
    cwd: process.cwd(),
    env: { ...process.env, PYTHONPATH: "backend" },
    stdio: "inherit",
  });
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
}
