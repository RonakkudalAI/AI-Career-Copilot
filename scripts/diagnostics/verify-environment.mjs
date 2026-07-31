import process from "node:process";
import { loadRootEnv } from "../shared/load-env.mjs";

loadRootEnv();
const environment = process.env;

const checks = [
  ["NEXT_PUBLIC_API_BASE_URL", "CLIENT-SAFE"],
  ["DATABASE_PATH", "SERVER-ONLY"],
  ["AUTH_SECRET", "SERVER-ONLY"],
  ["PUBLIC_API_BASE_URL", "SERVER-ONLY-OPTIONAL"],
  ["LLM_PROVIDER", "SERVER-ONLY"],
  ["NVIDIA_API_KEY", "SERVER-ONLY"],
  ["NVIDIA_BASE_URL", "SERVER-ONLY"],
  ["NVIDIA_MODEL", "SERVER-ONLY"],
  ["GROQ_API_KEY", "SERVER-ONLY-OPTIONAL"],
  ["GROQ_BASE_URL", "SERVER-ONLY-OPTIONAL"],
  ["GROQ_MODEL", "SERVER-ONLY-OPTIONAL"],
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
  if (state === "MISSING" && !scope.includes("OPTIONAL")) failures.push(`${name}: MISSING`);
}

for (const name of Object.keys(environment)) {
  if (/^NEXT_PUBLIC_.*(SECRET|SERVICE|PASSWORD|DB_URL|NVIDIA)/.test(name)) {
    failures.push(`${name}: SERVER SECRET HAS CLIENT-SAFE PREFIX`);
  }
}

for (const name of ["NEXT_PUBLIC_API_BASE_URL", "NVIDIA_BASE_URL"]) {
  requireAbsoluteHttpUrl(name);
}
if (environment.GROQ_BASE_URL) requireAbsoluteHttpUrl("GROQ_BASE_URL");

if (environment.NVIDIA_API_KEY && !environment.NVIDIA_MODEL) {
  failures.push("NVIDIA_MODEL: MISSING while live generation is enabled");
}
if (environment.GROQ_API_KEY && !environment.GROQ_MODEL) {
  failures.push("GROQ_MODEL: MISSING while Groq interview generation is enabled");
}

if (failures.length) {
  console.error("Environment verification failed (values suppressed):");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Environment verification passed; values were not printed.");
