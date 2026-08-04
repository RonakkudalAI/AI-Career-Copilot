import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRootEnv } from "../shared/load-env.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
process.chdir(repositoryRoot);
loadRootEnv();

const frontendDirectory = resolve(repositoryRoot, "frontend");
const nextBinary = resolve(frontendDirectory, "node_modules", "next", "dist", "bin", "next");
if (!existsSync(nextBinary)) {
  console.error("Frontend dependencies are missing. Run npm run setup first.");
  process.exit(1);
}

const environment = { ...process.env };
const frontendLock = resolve(frontendDirectory, ".next", "dev", "lock");
if (existsSync(frontendLock)) {
  environment.NEXT_DIST_DIR = `.next-dev-${process.pid}`;
  console.log(`[dev] Existing Next lock detected; using ${environment.NEXT_DIST_DIR} for this frontend.`);
}

const child = spawn(
  process.execPath,
  [nextBinary, "dev", "--webpack", "--hostname", process.env.FRONTEND_HOST || "127.0.0.1", "--port", process.env.FRONTEND_PORT || process.env.PORT || "3000"],
  {
    cwd: frontendDirectory,
    env: environment,
    stdio: "inherit",
  },
);

let stopping = false;
function stop(signal) {
  if (stopping) return;
  stopping = true;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill(signal);
  }
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
