import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { loadRootEnv } from "../shared/load-env.mjs";

loadRootEnv();

const backendPython = process.platform === "win32" ? "backend/.venv/Scripts/python.exe" : "backend/.venv/bin/python";
if (!existsSync(backendPython)) {
  console.error("Backend dependencies are missing. Run npm install first.");
  process.exit(1);
}

const child = spawn(
  backendPython,
  ["-m", "uvicorn", "app.main:app", "--reload", "--reload-dir", "backend", "--access-log", "--port", "8000", "--app-dir", "backend"],
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
