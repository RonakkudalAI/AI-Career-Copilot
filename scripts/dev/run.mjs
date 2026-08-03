import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadRootEnv } from "../shared/load-env.mjs";

loadRootEnv();

const backendPython = process.platform === "win32" ? "backend/.venv/Scripts/python.exe" : "backend/.venv/bin/python";
if (!existsSync(backendPython)) {
  console.error("Backend dependencies are missing. Run npm install first.");
  process.exit(1);
}

const frontendDirectory = resolve(process.cwd(), "frontend");
const frontendLockPresent = existsSync(resolve(frontendDirectory, ".next", "dev", "lock"));
const frontendEnvironment = { ...process.env };
if (frontendLockPresent) {
  // A lock can remain after a crashed/stopped Next process. Use an isolated
  // development directory so this invocation still owns a working frontend.
  frontendEnvironment.NEXT_DIST_DIR = `.next-dev-${process.pid}`;
  console.log(`[dev] Existing Next lock detected; using ${frontendEnvironment.NEXT_DIST_DIR} for this frontend.`);
}

const commands = [
  {
    name: "backend",
    command: backendPython,
    args: ["-m", "uvicorn", "app.main:app", "--reload", "--reload-dir", "backend", "--access-log", "--port", "8000", "--app-dir", "backend"],
    cwd: process.cwd(),
    env: process.env,
  },
  {
    name: "frontend",
    command: process.execPath,
    args: [resolve(frontendDirectory, "node_modules", "next", "dist", "bin", "next"), "dev"],
    cwd: frontendDirectory,
    env: frontendEnvironment,
  },
];

const children = new Map();
let stopping = false;

function terminate(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGTERM");
  }
}

function start(service) {
  if (stopping) return;

  const child = spawn(service.command, service.args, {
    cwd: service.cwd || process.cwd(),
    stdio: "inherit",
    env: service.env || process.env,
  });
  children.set(service.name, child);
  child.on("error", (error) => {
    console.error(`[dev] ${service.name} failed to start: ${error.message}`);
  });
  child.on("exit", (code, signal) => {
    if (children.get(service.name) === child) children.delete(service.name);
    if (stopping) return;
    console.error(`[dev] ${service.name} stopped (code=${code ?? "none"}, signal=${signal ?? "none"}). Stopping the other service.`);
    stop(code ?? 1);
  });
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children.values()) terminate(child);
  children.clear();
  process.exit(code);
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
process.on("exit", () => {
  if (!stopping) {
    for (const child of children.values()) terminate(child);
  }
});

for (const service of commands) start(service);
