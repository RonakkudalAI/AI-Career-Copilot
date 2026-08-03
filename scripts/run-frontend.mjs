import { spawnSync } from "node:child_process";
import { loadRootEnv } from "./shared/load-env.mjs";

loadRootEnv();

const [script, ...args] = process.argv.slice(2);
if (!script) {
  console.error("Usage: node scripts/run-frontend.mjs <npm-script> [args...]");
  process.exit(2);
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npm, ["--prefix", "frontend", "run", script, ...args], {
  cwd: process.cwd(),
  env: process.env,
  shell: process.platform === "win32",
  stdio: "inherit",
});
process.exit(result.status ?? 1);
