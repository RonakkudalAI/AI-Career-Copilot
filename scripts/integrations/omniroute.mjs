import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const sidecar = resolve(root, "integrations", "omniroute");
const packageJson = resolve(sidecar, "package.json");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const command = process.argv[2] || "check";

function requireSidecar() {
  if (!existsSync(packageJson)) {
    console.error("[omniroute] Optional sidecar is not installed at integrations/omniroute.");
    console.error("[omniroute] The Career Copilot app remains independent and can run without it.");
    process.exit(2);
  }
}

function run(args) {
  const result = spawnSync(npm, args, {
    cwd: sidecar,
    stdio: "inherit",
    env: process.env,
  });
  process.exit(result.status ?? 1);
}

requireSidecar();

if (command === "install") {
  run(["install", "--ignore-scripts", "--no-audit", "--no-fund"]);
}

if (command === "dev") {
  if (!existsSync(resolve(sidecar, "node_modules"))) {
    console.error("[omniroute] Dependencies are missing. Run npm run omniroute:install first.");
    process.exit(2);
  }
  const childCommand = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : npm;
  const childArgs = process.platform === "win32" ? ["/d", "/s", "/c", `${npm} run dev`] : ["run", "dev"];
  const child = spawn(childCommand, childArgs, {
    cwd: sidecar,
    stdio: "inherit",
    env: process.env,
  });
  await new Promise((resolve) => {
    child.on("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
    child.on("error", (error) => {
      console.error(`[omniroute] Failed to start: ${error.message}`);
      resolve(1);
    });
  }).then((code) => process.exit(code));
}

if (command === "check") {
  const url = process.env.OMNIROUTE_BASE_URL || "http://127.0.0.1:20128/v1";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/models`, {
      signal: controller.signal,
      headers: process.env.OMNIROUTE_API_KEY
        ? { Authorization: `Bearer ${process.env.OMNIROUTE_API_KEY}` }
        : undefined,
    });
    console.log(`[omniroute] gateway_status=${response.status}`);
    process.exit(response.ok ? 0 : 1);
  } catch (error) {
    console.error(`[omniroute] gateway_unreachable=${error.name === "AbortError" ? "timeout" : "connection_failed"}`);
    process.exit(1);
  } finally {
    clearTimeout(timer);
  }
}

console.error(`[omniroute] Unknown command: ${command}`);
process.exit(2);
