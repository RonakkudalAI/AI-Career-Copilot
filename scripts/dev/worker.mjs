import { spawn } from "node:child_process";
import { ensureBackendVenv } from "../shared/backend-venv.mjs";
import { loadRootEnv } from "../shared/load-env.mjs";

loadRootEnv();
const backendPython = ensureBackendVenv();
const child = spawn(
  backendPython,
  ["-m", "celery", "-A", "app.workers:celery_app", "worker", "--loglevel=INFO", "--pool=solo"],
  { cwd: process.cwd(), stdio: "inherit", env: process.env },
);

let stopping = false;
function stop(signal) {
  if (stopping) return;
  stopping = true;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill(signal);
  }
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
