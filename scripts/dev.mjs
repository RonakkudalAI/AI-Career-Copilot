import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const backendPython = process.platform === "win32" ? "backend/.venv/Scripts/python.exe" : "backend/.venv/bin/python";
if (!existsSync(backendPython)) {
  console.error("Backend dependencies are missing. Run npm install first.");
  process.exit(1);
}

const commands = [
  {
    name: "backend",
    command: backendPython,
    args: ["-m", "uvicorn", "app.main:app", "--reload", "--port", "8000", "--app-dir", "backend"],
  },
  {
    name: "frontend",
    command: process.execPath,
    args: ["node_modules/next/dist/bin/next", "dev"],
  },
];

const children = new Map();
const restartTimers = new Map();
const restartAttempts = new Map();
const maxRestartAttempts = 3;
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

  const child = spawn(service.command, service.args, { stdio: "inherit" });
  children.set(service.name, child);
  child.on("error", (error) => {
    console.error(`[dev] ${service.name} failed to start: ${error.message}`);
  });
  child.on("exit", (code, signal) => {
    if (children.get(service.name) === child) children.delete(service.name);
    if (stopping) return;

    if (service.name === "frontend" && code === 1 && existsSync(".next/dev/lock")) {
      console.error("[dev] frontend did not start because another Next dev server owns .next/dev/lock. Reuse that server or stop it before running npm run dev.");
      return;
    }

    const attempts = (restartAttempts.get(service.name) || 0) + 1;
    restartAttempts.set(service.name, attempts);
    if (attempts > maxRestartAttempts) {
      console.error(`[dev] ${service.name} stopped ${maxRestartAttempts} times. Automatic restart paused so the original error remains visible.`);
      return;
    }

    console.error(`[dev] ${service.name} stopped (code=${code ?? "none"}, signal=${signal ?? "none"}). Restarting (${attempts}/${maxRestartAttempts})...`);
    const timer = setTimeout(() => {
      restartTimers.delete(service.name);
      start(service);
    }, 1000);
    restartTimers.set(service.name, timer);
  });
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const timer of restartTimers.values()) clearTimeout(timer);
  restartTimers.clear();
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
