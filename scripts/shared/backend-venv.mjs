import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const backendVenvPython =
  process.platform === "win32" ? "backend/.venv/Scripts/python.exe" : "backend/.venv/bin/python";

function canRunPython(pythonExecutable) {
  if (!existsSync(pythonExecutable)) return false;
  try {
    const result = spawnSync(
      pythonExecutable,
      [
        "-c",
        "import sys; import dotenv; import docx; import firebase_admin; import fastapi; import jwt; import pydantic_settings; import pypdf; import reportlab; print(sys.version)",
      ],
      {
      cwd: process.cwd(),
      encoding: "utf-8",
      shell: false,
      stdio: "pipe",
      },
    );
    return result.status === 0 && Boolean(String(result.stdout || "").trim());
  } catch {
    return false;
  }
}

export function ensureBackendVenv() {
  if (canRunPython(backendVenvPython)) return backendVenvPython;

  const setup = spawnSync(process.execPath, [resolve(process.cwd(), "scripts", "setup", "backend.mjs")], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
    shell: false,
  });
  if ((setup.status ?? 1) !== 0) {
    process.exit(setup.status ?? 1);
  }

  if (!canRunPython(backendVenvPython)) {
    console.error("Backend virtual environment is unavailable after setup. Run npm run setup.");
    process.exit(1);
  }

  return backendVenvPython;
}
