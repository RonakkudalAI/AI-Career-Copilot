import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const backendPython = process.platform === "win32" ? "backend/.venv/Scripts/python.exe" : "backend/.venv/bin/python";
if (!existsSync(backendPython)) {
  console.error("Backend dependencies are missing. Run npm install first."); process.exit(1);
}
const processes = [
  spawn(backendPython, ["-m", "uvicorn", "app.main:app", "--reload", "--port", "8000", "--app-dir", "backend"], { stdio: "inherit" }),
  spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev"], { stdio: "inherit" }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of processes) {
    if (!child.pid) continue;
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGTERM");
  }
  process.exit(code);
}
process.on("SIGINT", () => stop(0)); process.on("SIGTERM", () => stop(0));
processes.forEach((child) => child.on("exit", (code) => stop(code || 0)));
