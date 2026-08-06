import { spawnSync } from "node:child_process";
import { ensureBackendVenv } from "../shared/backend-venv.mjs";
import { loadRootEnv } from "../shared/load-env.mjs";

loadRootEnv();

const python = ensureBackendVenv();
const result = spawnSync(python, ["scripts/diagnostics/check-firestore.py"], {
  cwd: process.cwd(),
  env: { ...process.env, PYTHONPATH: "backend" },
  stdio: "inherit",
});
if ((result.status ?? 1) !== 0) {
  console.error("Firebase setup check failed. Configure FIREBASE_PROJECT_ID and FIREBASE_CREDENTIALS_PATH first.");
  process.exit(result.status ?? 1);
}
