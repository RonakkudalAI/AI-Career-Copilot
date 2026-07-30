import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import process from "node:process";

const root = process.cwd();
const scannerPath = join(root, "scripts", "check-secrets.mjs");
const ignored = new Set([".git", ".next", "node_modules", "coverage", "playwright-report", "test-results", ".venv", ".temp", ".pytest_cache", "__pycache__"]);
const textExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".md", ".py", ".toml", ".sql", ".yml", ".yaml", ".env", ".example", ".txt"]);
const rules = [
  ["NVIDIA API key", /nvapi-[A-Za-z0-9_-]+/g],
  ["Supabase secret key", /sb_secret_[A-Za-z0-9_-]+/g],
  ["JWT-like credential", /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g],
  ["Credential-bearing database URL", /postgres(?:ql)?:\/\/[^\s:@]+:[^\s@]+@/gi],
];

const findings = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name) || entry.name.startsWith(".env")) continue;
    const path = join(directory, entry.name);
    if (path === scannerPath) continue;
    if (entry.isDirectory()) { await walk(path); continue; }
    if (!textExtensions.has(extname(entry.name)) && entry.name !== ".gitignore") continue;
    const content = await readFile(path, "utf8");
    for (const [label, pattern] of rules) {
      pattern.lastIndex = 0;
      if (pattern.test(content)) findings.push(`${relative(root, path)}: ${label}`);
    }
  }
}

await walk(root);
if (findings.length) {
  console.error("Secret scan failed. Potential findings (values suppressed):");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}
console.log("Secret scan passed: no committed credential patterns found.");
