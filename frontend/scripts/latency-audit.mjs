/**
 * Latency anti-pattern detector for Career Copilot UI.
 * Red when known page-transition latency bugs are present in source.
 * Usage: node scripts/latency-audit.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appPath = path.join(root, "src", "App.tsx");
const shellPath = path.join(root, "src", "features", "workspace", "components", "workspace-shell.tsx");
const dashPath = path.join(root, "src", "features", "dashboard", "components", "dashboard.tsx");
const landingPath = path.join(root, "src", "features", "marketing", "components", "landing.tsx");
const pkgPath = path.join(root, "package.json");
const bootstrapPath = path.join(root, "src", "features", "workspace", "bootstrap-context.tsx");
const jobsPath = path.join(root, "src", "features", "jobs", "components", "jobs.tsx");
const jobsCachePath = path.join(root, "src", "features", "jobs", "job-recs-cache.ts");

const app = fs.readFileSync(appPath, "utf8");
const shell = fs.readFileSync(shellPath, "utf8");
const dash = fs.readFileSync(dashPath, "utf8");
const landing = fs.readFileSync(landingPath, "utf8");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const jobs = fs.existsSync(jobsPath) ? fs.readFileSync(jobsPath, "utf8") : "";

const findings = [];
const pass = [];

const appFn = app.match(/export function App\(\)[\s\S]*$/)?.[0] || app;

// Nested Suspense: App should not wrap all Routes in one Suspense
const globalSuspense =
  /return\s*\(\s*<Suspense[\s\S]*?<Routes[\s\S]*?<\/Routes>[\s\S]*?<\/Suspense>/.test(appFn);
if (globalSuspense) {
  findings.push({
    id: "global-suspense",
    severity: "P0",
    symptom: "Lazy page chunks suspend the whole tree",
    evidence: "App() wraps entire <Routes> in one <Suspense>",
    fix: "Nest Suspense inside WorkspaceShell outlet",
  });
} else if (app.includes("WorkspacePageFallback") || app.includes("WorkspaceBootstrapProvider")) {
  pass.push("global-suspense: nested Suspense / workspace provider present");
} else {
  findings.push({
    id: "global-suspense",
    severity: "P0",
    symptom: "Could not confirm nested Suspense structure",
    evidence: "App.tsx missing WorkspacePageFallback / WorkspaceBootstrapProvider markers",
    fix: "Ensure workspace outlet has its own Suspense",
  });
}

// Auth once
const protectedBlock = app.match(/function ProtectedRoute\(\)[\s\S]*?\nfunction /)?.[0] || "";
const protectedReauthOnPath =
  protectedBlock.includes("getUser()") && protectedBlock.includes("[location.pathname]");
if (protectedReauthOnPath) {
  findings.push({
    id: "auth-on-every-nav",
    severity: "P0",
    symptom: "Every nav triggers POST /auth/session",
    evidence: "ProtectedRoute effect depends on [location.pathname]",
    fix: "Validate once on mount",
  });
} else {
  pass.push("auth-on-every-nav: session not revalidated on path change");
}

// Double bootstrap
const hasProvider = fs.existsSync(bootstrapPath);
const shellBoot = shell.includes('"/me/bootstrap"');
const dashBoot = dash.includes('"/me/bootstrap"') || dash.includes("apiRequest");
const dashUsesContext = dash.includes("useWorkspaceBootstrap");
if (hasProvider && dashUsesContext && !shellBoot) {
  pass.push("double-bootstrap: shared WorkspaceBootstrapProvider");
} else if (shellBoot && dashBoot) {
  findings.push({
    id: "double-bootstrap",
    severity: "P1",
    symptom: "Dashboard pays bootstrap twice",
    evidence: "shell and dashboard both fetch /me/bootstrap",
    fix: "Use WorkspaceBootstrapProvider once",
  });
} else if (dashUsesContext) {
  pass.push("double-bootstrap: dashboard uses shared context");
} else {
  findings.push({
    id: "double-bootstrap",
    severity: "P1",
    symptom: "Bootstrap sharing not detected",
    evidence: "dashboard does not call useWorkspaceBootstrap",
    fix: "Wire dashboard to WorkspaceBootstrapProvider",
  });
}

// Landing lazy sections
const landingLazy =
  landing.includes("lazy(() =>") &&
  landing.includes("career-journey") &&
  !landing.includes("import { CareerJourney } from");
if (landingLazy) {
  pass.push("landing-eager-motion: below-fold sections are lazy");
} else {
  findings.push({
    id: "landing-eager-motion",
    severity: "P1",
    symptom: "Landing first paint waits on motion sections",
    evidence: "landing.tsx still statically imports section components",
    fix: "React.lazy below-the-fold sections",
  });
}

// Dead 3d deps
const dead3d = ["@react-three/drei", "@react-three/fiber", "three"].filter((d) => pkg.dependencies?.[d]);
if (dead3d.length) {
  findings.push({
    id: "unused-3d-deps",
    severity: "P2",
    symptom: "Dead three/r3f packages in package.json",
    evidence: `still lists: ${dead3d.join(", ")}`,
    fix: "npm uninstall unused three packages",
  });
} else {
  pass.push("unused-3d-deps: cleaned");
}

// Jobs cache
if (fs.existsSync(jobsCachePath) && jobs.includes("readJobRecsCache")) {
  pass.push("jobs-blocking-generate: stale-while-revalidate cache present");
} else {
  findings.push({
    id: "jobs-blocking-generate",
    severity: "P1",
    symptom: "Jobs page always blocks on generate POST",
    evidence: "no session cache hydrate path",
    fix: "Cache last recommendations; show stale then refresh",
  });
}

// Prefetch
if (shell.includes("prefetchRoute")) {
  pass.push("nav-prefetch: sidebar prefetches route chunks");
} else {
  findings.push({
    id: "nav-prefetch",
    severity: "P2",
    symptom: "Nav clicks wait on cold lazy chunks",
    evidence: "workspace-shell missing prefetchRoute",
    fix: "Prefetch on hover/focus",
  });
}

// Main chunk gate (informational after build)
const assetsDir = path.join(root, "dist", "assets");
if (fs.existsSync(assetsDir)) {
  const mains = fs.readdirSync(assetsDir).filter((f) => f.startsWith("index-") && f.endsWith(".js"));
  for (const f of mains) {
    const kb = fs.statSync(path.join(assetsDir, f)).size / 1024;
    if (kb > 400) {
      findings.push({
        id: "main-chunk-heavy",
        severity: "P1",
        symptom: `Initial JS ${kb.toFixed(0)}KB still heavy`,
        evidence: `dist/assets/${f} is ${kb.toFixed(1)} KB (gate: 400KB)`,
        fix: "Further split firebase / marketing if needed",
      });
    } else {
      pass.push(`main-chunk-heavy: ${f} ${kb.toFixed(0)}KB under 400KB`);
    }
  }
}

console.log("=== Career Copilot UI latency audit ===\n");
const order = { P0: 0, P1: 1, P2: 2 };
findings.sort((a, b) => order[a.severity] - order[b.severity]);
for (const f of findings) {
  console.log(`[RED ${f.severity}] ${f.id}`);
  console.log(`  symptom: ${f.symptom}`);
  console.log(`  evidence: ${f.evidence}`);
  console.log(`  fix: ${f.fix}\n`);
}
for (const p of pass) console.log(`[GREEN] ${p}`);
console.log(`\nSummary: ${findings.length} red, ${pass.length} green`);
process.exit(findings.some((f) => f.severity === "P0") ? 1 : findings.length ? 1 : 0);
