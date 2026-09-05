import { spawn } from "node:child_process";
import { ensureBackendVenv } from "../shared/backend-venv.mjs";
import { loadRootEnv } from "../shared/load-env.mjs";
import { backendPort } from "../shared/ports.mjs";

loadRootEnv();

const backendPython = ensureBackendVenv();

const port = backendPort(process.env);
const child = spawn(
  backendPython,
  ["-m", "uvicorn", "app.main:app", "--reload", "--reload-dir", "backend", "--access-log", "--log-level", "info", "--port", port, "--app-dir", "backend"],
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
child.on("exit", (code, signal) => {
  if (!stopping) {
    console.error(`[dev] backend stopped (code=${code ?? "none"}, signal=${signal ?? "none"}).`);
  }
  process.exit(code ?? (signal ? 1 : 0));
});
