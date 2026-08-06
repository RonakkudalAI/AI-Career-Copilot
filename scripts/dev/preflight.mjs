import { spawnSync } from "node:child_process";
import { loadRootEnv } from "../shared/load-env.mjs";

loadRootEnv();

console.log("[dev] Checking Firebase Firestore write/read behavior...");
const result = spawnSync(process.execPath, ["scripts/setup/firebase.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env },
  stdio: "inherit",
});
if ((result.status ?? 1) !== 0) {
  console.error("[dev] Firebase Firestore setup check failed.");
  process.exit(1);
}
