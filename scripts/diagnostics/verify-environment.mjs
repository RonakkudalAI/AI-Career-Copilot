import process from "node:process";
import { loadRootEnv } from "../shared/load-env.mjs";

loadRootEnv();
const environment = process.env;

const checks = [
  ["VITE_API_BASE_URL", "CLIENT-SAFE-OPTIONAL"],
  ["VITE_FIREBASE_API_KEY", "CLIENT-SAFE"],
  ["VITE_FIREBASE_AUTH_DOMAIN", "CLIENT-SAFE"],
  ["VITE_FIREBASE_PROJECT_ID", "CLIENT-SAFE"],
  ["VITE_FIREBASE_STORAGE_BUCKET", "CLIENT-SAFE"],
  ["VITE_FIREBASE_MESSAGING_SENDER_ID", "CLIENT-SAFE"],
  ["VITE_FIREBASE_APP_ID", "CLIENT-SAFE"],
  ["VITE_SUPABASE_URL", "CLIENT-SAFE"],
  ["VITE_SUPABASE_PUBLISHABLE_KEY", "CLIENT-SAFE"],
  ["FIREBASE_PROJECT_ID", "SERVER-ONLY"],
  ["FIREBASE_CREDENTIALS_PATH", "SERVER-ONLY"],
  ["SUPABASE_URL", "SERVER-ONLY"],
  ["SUPABASE_PUBLISHABLE_KEY", "SERVER-ONLY-OPTIONAL"],
  ["SUPABASE_SECRET_KEY", "SERVER-ONLY-OPTIONAL"],
  ["SUPABASE_SERVICE_ROLE_KEY", "SERVER-ONLY"],
  ["SUPABASE_STORAGE_BUCKET", "SERVER-ONLY"],
  ["SUPABASE_JWKS_URL", "SERVER-ONLY-OPTIONAL"],
  ["FIREBASE_DATABASE_ID", "SERVER-ONLY-OPTIONAL"],
  ["DOCUMENT_BUCKET", "SERVER-ONLY-OPTIONAL"],
  ["AVATAR_BUCKET", "SERVER-ONLY-OPTIONAL"],
  ["AUTH_SECRET", "SERVER-ONLY"],
  ["PUBLIC_API_BASE_URL", "SERVER-ONLY-OPTIONAL"],
  ["LLM_PROVIDER", "SERVER-ONLY"],
  ["NVIDIA_API_KEY", "SERVER-ONLY"],
  ["NVIDIA_BASE_URL", "SERVER-ONLY"],
  ["NVIDIA_MODEL", "SERVER-ONLY"],
  ["GROQ_API_KEY", "SERVER-ONLY-OPTIONAL"],
  ["GROQ_BASE_URL", "SERVER-ONLY-OPTIONAL"],
  ["GROQ_MODEL", "SERVER-ONLY-OPTIONAL"],
  ["GROQ_RESUME_PARSER_ENABLED", "SERVER-ONLY-OPTIONAL"],
  ["GROQ_RESUME_PARSER_MODEL", "SERVER-ONLY-OPTIONAL"],
  ["GROQ_RESUME_PARSER_FALLBACK_MODEL", "SERVER-ONLY-OPTIONAL"],
  ["GROQ_RESUME_PARSER_TIMEOUT_SECONDS", "SERVER-ONLY-OPTIONAL"],
  ["GROQ_RESUME_PARSER_MAX_RETRIES", "SERVER-ONLY-OPTIONAL"],
  ["GROQ_RESUME_PARSER_MAX_INPUT_TOKENS", "SERVER-ONLY-OPTIONAL"],
  ["GROQ_RESUME_PARSER_TEMPERATURE", "SERVER-ONLY-OPTIONAL"],
  ["YOUTUBE_API_KEY", "SERVER-ONLY-OPTIONAL"],
  ["YOUTUBE_API_BASE_URL", "SERVER-ONLY-OPTIONAL"],
  ["YOUTUBE_SEARCH_MAX_RESULTS", "SERVER-ONLY-OPTIONAL"],
  ["YOUTUBE_TIMEOUT_SECONDS", "SERVER-ONLY-OPTIONAL"],
  ["GROQ_TTS_MODEL", "SERVER-ONLY-OPTIONAL"],
  ["GROQ_TTS_VOICE", "SERVER-ONLY-OPTIONAL"],
  ["NVIDIA_TTS_URL", "SERVER-ONLY-OPTIONAL"],
  ["NVIDIA_TTS_VOICE", "SERVER-ONLY-OPTIONAL"],
  ["NVIDIA_TTS_LANGUAGE", "SERVER-ONLY-OPTIONAL"],
  ["FISH_AUDIO_API_KEY", "SERVER-ONLY-OPTIONAL"],
  ["FISH_AUDIO_BASE_URL", "SERVER-ONLY-OPTIONAL"],
  ["FISH_AUDIO_MODEL", "SERVER-ONLY-OPTIONAL"],
  ["FISH_AUDIO_REFERENCE_ID", "SERVER-ONLY-OPTIONAL"],
  ["FISH_AUDIO_TIMEOUT_SECONDS", "SERVER-ONLY-OPTIONAL"],
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
  if (/^VITE_.*(SECRET|SERVICE|PASSWORD|DB_URL|NVIDIA|GROQ)/.test(name)) {
    failures.push(`${name}: SERVER SECRET HAS CLIENT-SAFE PREFIX`);
  }
}

if (environment.VITE_API_BASE_URL) requireAbsoluteHttpUrl("VITE_API_BASE_URL");
if (environment.NVIDIA_BASE_URL) requireAbsoluteHttpUrl("NVIDIA_BASE_URL");
if (environment.GROQ_BASE_URL) requireAbsoluteHttpUrl("GROQ_BASE_URL");
if (environment.SUPABASE_URL) requireAbsoluteHttpUrl("SUPABASE_URL");
if (environment.SUPABASE_JWKS_URL) requireAbsoluteHttpUrl("SUPABASE_JWKS_URL");
if (environment.FISH_AUDIO_BASE_URL) requireAbsoluteHttpUrl("FISH_AUDIO_BASE_URL");
if (environment.NVIDIA_TTS_URL) requireAbsoluteHttpUrl("NVIDIA_TTS_URL");

if (
  environment.VITE_FIREBASE_PROJECT_ID &&
  environment.FIREBASE_PROJECT_ID &&
  environment.VITE_FIREBASE_PROJECT_ID !== environment.FIREBASE_PROJECT_ID
) {
  failures.push("Firebase project mismatch between VITE_FIREBASE_PROJECT_ID and FIREBASE_PROJECT_ID");
}

if (environment.NVIDIA_API_KEY && !environment.NVIDIA_MODEL) {
  failures.push("NVIDIA_MODEL: MISSING while live generation is enabled");
}
if (environment.GROQ_API_KEY && !environment.GROQ_MODEL) {
  failures.push("GROQ_MODEL: MISSING while Groq interview generation is enabled");
}
if (environment.FISH_AUDIO_API_KEY) {
  if (!environment.FISH_AUDIO_BASE_URL) failures.push("FISH_AUDIO_BASE_URL: MISSING while Fish Audio is enabled");
  if (!environment.FISH_AUDIO_MODEL) failures.push("FISH_AUDIO_MODEL: MISSING while Fish Audio is enabled");
}
if (environment.GROQ_API_KEY && environment.GROQ_RESUME_PARSER_ENABLED === "true") {
  if (!environment.GROQ_RESUME_PARSER_MODEL) {
    failures.push("GROQ_RESUME_PARSER_MODEL: MISSING while Groq resume parsing is enabled");
  }
  if (!environment.GROQ_RESUME_PARSER_FALLBACK_MODEL) {
    failures.push("GROQ_RESUME_PARSER_FALLBACK_MODEL: MISSING while Groq resume parsing is enabled");
  }
}

if (failures.length) {
  console.error("Environment verification failed (values suppressed):");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Environment verification passed; values were not printed.");
