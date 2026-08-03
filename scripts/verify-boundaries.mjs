import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const root = process.cwd();
const violations = [];

async function walk(directory, boundary) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (["node_modules", ".next", ".venv", "__pycache__", ".data"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(path, boundary);
      continue;
    }
    if (!/[.](ts|tsx|js|mjs|py)$/.test(entry.name)) continue;
    const text = await readFile(path, "utf8");
    if (boundary === "frontend" && /(?:from|import)\s*["'`]([^"'`]*(?:backend|\\.py)[^"'`]*)["'`]/m.test(text)) {
      violations.push(`${relative(root, path)} imports backend source`);
    }
    if (boundary === "backend" && /(?:from|import)\s+["']([^"']*\.(?:ts|tsx)|frontend)["']/m.test(text)) {
      violations.push(`${relative(root, path)} imports frontend source`);
    }
  }
}

await walk(join(root, "frontend", "src"), "frontend");
await walk(join(root, "backend", "app"), "backend");
if (violations.length) {
  console.error("Cross-boundary import verification failed:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}
console.log("Cross-boundary import verification passed.");
