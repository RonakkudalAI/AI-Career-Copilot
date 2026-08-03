import { spawnSync } from "node:child_process";
import { loadRootEnv } from "../shared/load-env.mjs";

loadRootEnv();

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    shell: process.platform === "win32",
    stdio: "inherit",
  });
  return result.status ?? 1;
}

if (run(npm, ["--prefix", "frontend", "ci"]) !== 0) process.exit(1);
if (run(process.execPath, ["scripts/setup/backend.mjs"]) !== 0) process.exit(1);
if (run(process.execPath, ["scripts/setup/local-db.mjs"]) !== 0) process.exit(1);
