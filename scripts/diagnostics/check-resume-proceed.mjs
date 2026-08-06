import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

const apiBase = process.env.CAREER_COPILOT_API_BASE || "http://127.0.0.1:8000/api/v1";
const fixturePath = resolve(
  process.cwd(),
  "backend",
  "tests",
  "fixtures",
  "resumes",
  "01_single_column.pdf",
);
const email = `resume-proceed-${randomUUID()}@example.com`;
const password = `Test-${randomUUID()}-Aa1!`;
let accessToken = "";

async function checkedJson(path, options, expectedStatus, timeoutMs = 30_000) {
  const started = performance.now();
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const elapsedMs = Math.round(performance.now() - started);
  const body = await response.json().catch(() => ({}));
  if (response.status !== expectedStatus) {
    const code = body?.error?.code || "unexpected_response";
    throw new Error(`${path} returned ${response.status} (${code}) after ${elapsedMs}ms`);
  }
  return { body, elapsedMs };
}

try {
  const signup = await checkedJson(
    "/auth/sign-up",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, full_name: "Resume Proceed Check" }),
    },
    201,
    60_000,
  );
  accessToken = signup.body.access_token;
  const headers = { authorization: `Bearer ${accessToken}` };

  const bytes = await readFile(fixturePath);
  const resumeForm = new FormData();
  resumeForm.set("file", new Blob([bytes], { type: "application/pdf" }), "resume.pdf");
  const resume = await checkedJson(
    "/resumes",
    { method: "POST", headers, body: resumeForm },
    201,
  );

  const job = await checkedJson(
    "/job-descriptions",
    {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        raw_text:
          "Backend Engineer role requiring Python, FastAPI, REST APIs, testing, and cloud deployment experience.",
      }),
    },
    201,
  );

  const previewForm = new FormData();
  previewForm.set("file", new Blob([bytes], { type: "application/pdf" }), "resume.pdf");
  const profilePreview = await checkedJson(
    "/profile/from-resume/preview-upload",
    { method: "POST", headers, body: previewForm },
    200,
    20_000,
  );

  const totalMs = resume.elapsedMs + job.elapsedMs;
  console.log(
    `resume_status=201 resume_ms=${resume.elapsedMs} jd_status=201 jd_ms=${job.elapsedMs} ` +
      `profile_preview_status=200 profile_preview_ms=${profilePreview.elapsedMs} total_ms=${totalMs}`,
  );
  if (totalMs > 30_000) {
    throw new Error(`Proceed persistence exceeded the 30s budget (${totalMs}ms)`);
  }
  if (profilePreview.elapsedMs > 15_000) {
    throw new Error(`Profile preview exceeded the 15s optional-AI budget (${profilePreview.elapsedMs}ms)`);
  }
} finally {
  if (accessToken) {
    const response = await fetch(`${apiBase}/account`, {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ confirmation: "DELETE MY ACCOUNT", email }),
      signal: AbortSignal.timeout(90_000),
    }).catch(() => null);
    console.log(`cleanup_status=${response?.status ?? "failed"}`);
  }
}
