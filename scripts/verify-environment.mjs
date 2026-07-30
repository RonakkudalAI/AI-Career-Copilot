import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const environmentPath = resolve(process.cwd(), ".env");
const environment = Object.fromEntries(
  readFileSync(environmentPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => /^\s*[A-Za-z_][A-Za-z0-9_]*\s*=/.test(line))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
    }),
);

const checks = [
  ["NEXT_PUBLIC_SUPABASE_URL", "CLIENT-SAFE"],
  ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "CLIENT-SAFE"],
  ["NEXT_PUBLIC_API_BASE_URL", "CLIENT-SAFE"],
  ["SUPABASE_URL", "SERVER-ONLY"],
  ["SUPABASE_PUBLISHABLE_KEY", "SERVER-ONLY"],
  ["SUPABASE_SECRET_KEY", "SERVER-ONLY"],
  ["SUPABASE_DB_URL", "SERVER-ONLY"],
  ["NVIDIA_API_KEY", "SERVER-ONLY"],
  ["NVIDIA_BASE_URL", "SERVER-ONLY"],
  ["NVIDIA_MODEL", "SERVER-ONLY"],
];

const failures = [];
function requireAbsoluteHttpUrl(name) {
  try {
    const parsed = new URL(environment[name]);
    if (!new Set(["http:", "https:"]).has(parsed.protocol)) throw new Error();
  } catch {
    failures.push(`${name}: MALFORMED`);
  }
}

for (const [name, scope] of checks) {
  const state = environment[name]?.length ? "PRESENT" : "MISSING";
  console.log(`${name}: ${state} - ${scope}`);
  if (state === "MISSING") failures.push(`${name}: MISSING`);
}

for (const name of Object.keys(environment)) {
  if (/^NEXT_PUBLIC_.*(SECRET|SERVICE|PASSWORD|DB_URL|NVIDIA)/.test(name)) {
    failures.push(`${name}: SERVER SECRET HAS CLIENT-SAFE PREFIX`);
  }
}

for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_API_BASE_URL", "SUPABASE_URL", "NVIDIA_BASE_URL"]) {
  requireAbsoluteHttpUrl(name);
}

if (environment.NEXT_PUBLIC_SUPABASE_URL !== environment.SUPABASE_URL) {
  failures.push("Frontend and backend Supabase projects are CONFLICTING");
}
if (environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY !== environment.SUPABASE_PUBLISHABLE_KEY) {
  failures.push("Frontend and backend publishable keys are CONFLICTING");
}
if (environment.NVIDIA_API_KEY && !environment.NVIDIA_MODEL) {
  failures.push("NVIDIA_MODEL: MISSING while live generation is enabled");
}

if (failures.length) {
  console.error("Environment verification failed (values suppressed):");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Environment verification passed; values were not printed.");
