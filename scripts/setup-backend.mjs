import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const python = process.platform === "win32" ? "python" : "python3";
const venvPython = process.platform === "win32" ? "backend/.venv/Scripts/python.exe" : "backend/.venv/bin/python";
if (!existsSync(venvPython)) {
  const created = spawnSync(python, ["-m", "venv", "backend/.venv"], { stdio: "inherit" });
  if (created.status !== 0) process.exit(created.status || 1);
}
const installed = spawnSync(venvPython, ["-m", "pip", "install", "-e", "backend[dev]"], { stdio: "inherit" });
process.exit(installed.status || 0);
