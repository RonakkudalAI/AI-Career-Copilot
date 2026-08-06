/**
 * Create backend/.venv on a CrewAI-compatible Python (3.11–3.13) and install deps.
 * Rejects Python 3.14+ (official crewai and many wheels require <3.14).
 */
import { spawnSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadRootEnv } from "../shared/load-env.mjs";

loadRootEnv();

const isWin = process.platform === "win32";
const venvDir = "backend/.venv";
const venvPython = isWin ? "backend/.venv/Scripts/python.exe" : "backend/.venv/bin/python";
const venvMarker = "backend/.venv/.career-copilot-python";

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: "inherit", shell: false, ...opts });
  return result.status ?? 1;
}

function probePython(command, argsPrefix = []) {
  try {
    const result = spawnSync(command, [...argsPrefix, "-c", "import sys; print(f'{sys.version_info[0]}.{sys.version_info[1]}.{sys.version_info[2]}'); print(sys.executable)"], {
      encoding: "utf-8",
      shell: false,
    });
    if (result.status !== 0 || !result.stdout) return null;
    const lines = result.stdout.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return null;
    const [version, executable] = lines;
    const [maj, min] = version.split(".").map(Number);
    return { version, major: maj, minor: min, executable, command, argsPrefix };
  } catch {
    return null;
  }
}

function normalizePath(value) {
  return String(value).trim().replace(/^['"]+|['"]+$/g, "");
}

function isSupported(info) {
  if (!info) return false;
  // Official crewai: >=3.10,<3.14. Project requires >=3.11.
  return info.major === 3 && info.minor >= 11 && info.minor <= 13;
}

function findPython() {
  const candidates = [];

  // Explicit env override (recommended for CI / multi-Python machines)
  if (process.env.CAREER_COPILOT_PYTHON) {
    candidates.push(probePython(normalizePath(process.env.CAREER_COPILOT_PYTHON)));
  }

  if (isWin) {
    // Prefer Windows py launcher pins (3.12, then 3.13, then 3.11)
    for (const tag of ["-3.12", "-3.13", "-3.11"]) {
      candidates.push(probePython("py", [tag]));
    }
    // Common install locations
    const local = process.env.LOCALAPPDATA || "";
    const roaming = process.env.APPDATA || "";
    const userProfile = process.env.USERPROFILE || "";
    for (const minor of ["3.12", "3.13", "3.11"]) {
      const executable = join(
        roaming,
        "uv",
        "python",
        `cpython-${minor}-windows-x86_64-none`,
        "python.exe",
      );
      if (existsSync(executable)) candidates.push(probePython(executable));
    }
    for (const executable of [
      join(userProfile, ".local", "bin", "python3.12.exe"),
      join(userProfile, ".local", "bin", "python3.13.exe"),
      join(userProfile, ".local", "bin", "python3.11.exe"),
    ]) {
      if (existsSync(executable)) candidates.push(probePython(executable));
    }
    for (const rel of [
      "Programs\\Python\\Python312\\python.exe",
      "Programs\\Python\\Python313\\python.exe",
      "Programs\\Python\\Python311\\python.exe",
    ]) {
      const full = join(local, rel);
      if (existsSync(full)) candidates.push(probePython(full));
    }
  } else {
    for (const bin of ["python3.12", "python3.13", "python3.11", "python3"]) {
      candidates.push(probePython(bin));
    }
  }

  // PATH fallback last (often 3.14 on this machine — filtered by isSupported)
  candidates.push(probePython(isWin ? "python" : "python3"));

  for (const info of candidates) {
    if (isSupported(info)) return info;
  }
  return null;
}

console.log("Career Copilot backend setup: selecting Python 3.11-3.13...");
const selected = findPython();
if (!selected) {
  console.error(`
No suitable Python found (need Python 3.11, 3.12, or 3.13).

Python 3.10 and 3.14+ are not supported for this project.

Install Python 3.12, then re-run:
  winget install Python.Python.3.12
  npm install

Or set CAREER_COPILOT_PYTHON to a 3.12/3.13 interpreter path.
`);
  process.exit(1);
}

console.log(`Using Python ${selected.version}: ${selected.executable}`);

// Recreate venv if missing or built with unsupported / wrong version
const current = existsSync(venvPython) ? probePython(venvPython) : null;
const pipCheck = current
  ? spawnSync(venvPython, ["-m", "pip", "--version"], { stdio: "ignore", shell: false }).status === 0
  : false;
const runtimeCheck = current
  ? spawnSync(
      venvPython,
      ["-c", "import dotenv, docx, firebase_admin, fastapi, jwt, pydantic_settings, pypdf, reportlab"],
      { stdio: "ignore", shell: false },
    ).status === 0
  : false;
const needsRecreate =
  !current ||
  !isSupported(current) ||
  !pipCheck ||
  !runtimeCheck ||
  process.env.CAREER_COPILOT_RECREATE_VENV === "1";

if (needsRecreate) {
  if (existsSync(venvDir)) {
    console.log("Removing existing backend/.venv …");
    try {
      rmSync(venvDir, { recursive: true, force: true });
    } catch (error) {
      console.error("The existing backend/.venv is incomplete but cannot be removed. Close processes using it and retry.");
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }
  console.log("Creating backend/.venv …");
  const created = run(selected.executable, ["-m", "venv", venvDir]);
  if (created !== 0) {
    console.error("Failed to create virtual environment.");
    process.exit(created);
  }
  writeFileSync(
    venvMarker,
    `version=${selected.version}\nexecutable=${selected.executable}\n`,
    "utf-8",
  );
}

// Some Windows Python installations create pip launchers without installing
// the pip module. Bootstrap it explicitly before any package command.
const pipBootstrap = run(venvPython, ["-m", "ensurepip", "--upgrade"]);
if (pipBootstrap !== 0) {
  console.error("Backend virtual environment initialization failed: Python could not bootstrap pip.");
  process.exit(pipBootstrap);
}

// Ensure pip is recent enough and fail clearly if the venv is still incomplete.
const pipUpgrade = run(venvPython, ["-m", "pip", "install", "--upgrade", "pip", "setuptools", "wheel"]);
if (pipUpgrade !== 0) {
  console.error("Backend virtual environment initialization failed: pip could not be installed or upgraded.");
  process.exit(pipUpgrade);
}

const dotenvRepair = run(venvPython, ["-m", "pip", "install", "--upgrade", "--force-reinstall", "python-dotenv>=1.0,<2"]);
if (dotenvRepair !== 0) {
  console.error("Backend virtual environment initialization failed: python-dotenv could not be installed.");
  process.exit(dotenvRepair);
}

// Install API package + optional CrewAI (supported on 3.11–3.13)
console.log("Installing backend package + development and crewai extras …");
const installStatus = run(venvPython, ["-m", "pip", "install", "-e", "backend[dev,crewai]"]);
if (installStatus !== 0) {
  console.warn("Install with [dev,crewai] failed; installing package with development dependencies …");
  const development = run(venvPython, ["-m", "pip", "install", "-e", "backend[dev]"]);
  if (development !== 0) process.exit(development);
  console.warn("Core backend installed. CrewAI extra unavailable; compatible orchestrator still works.");
}

// Quick import smoke (no network)
const smoke = spawnSync(
  venvPython,
  [
    "-c",
    "from app.main import app; from app.features.resume_improvement.agents.crew import crew_runtime_mode, try_import_crewai; ok,_,_=try_import_crewai(); print('app', app.title); print('python_ok'); print('crew_runtime', crew_runtime_mode()); print('official_crewai', ok)",
  ],
  { encoding: "utf-8", cwd: process.cwd() },
);
if (smoke.status !== 0) {
  console.error(smoke.stderr || smoke.stdout || "Backend import smoke failed.");
  process.exit(smoke.status || 1);
}
console.log((smoke.stdout || "").trim());
console.log("Backend setup complete.");
process.exit(0);
