"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge, Button, Card, Input, PageHeader, Progress, Textarea } from "@/components/ui/primitives";
import { apiRequest } from "@/lib/api/client";
import { isValidCareerFile } from "@/lib/utils";

type StructuredContent = {
  schema_version?: string;
  sections: Record<string, string[]>;
  unclassified_blocks?: string[];
  warnings?: string[];
};
type ResumeVersion = {
  id: string;
  resume_id: string;
  version_number: number;
  source_type: string;
  extraction_status: string;
  original_filename?: string;
  structured_content: StructuredContent;
  created_at: string;
};
type Resume = { id: string; title: string; is_active: boolean; created_at: string; versions?: ResumeVersion[] };
type JobDescription = {
  id: string;
  title: string;
  company?: string | null;
  role_title?: string | null;
  extraction_status: string;
  input_type?: string;
  original_filename?: string | null;
  structured_content?: StructuredContent;
  raw_text?: string;
  created_at?: string;
  confidence?: string | null;
};
type Analysis = {
  id: string;
  status: string;
  overall_score: number | null;
  score_breakdown?: { matched_terms?: string[]; missing_terms?: string[]; total_terms?: number };
  summary?: { method?: string; disclaimer?: string; matched?: number; total?: number };
  created_at: string;
  resume_version_id?: string;
  job_description_id?: string;
  resume?: {
    id?: string;
    title?: string;
    original_filename?: string | null;
    version_number?: number;
    created_at?: string;
  } | null;
  job_description?: {
    id?: string;
    title?: string;
    company?: string | null;
    role_title?: string | null;
    input_type?: string;
    original_filename?: string | null;
    created_at?: string;
  } | null;
};
type AtsEvidence = {
  id: string;
  requirement_text: string;
  resume_evidence_text?: string | null;
  match_status: "strong_match" | "partial_match" | "not_found" | "unverified" | "not_applicable";
  explanation?: string | null;
};

type HubTab = "ats" | "upload";

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function resumeLabel(analysis: Analysis) {
  const resume = analysis.resume;
  if (!resume) return "Resume unavailable";
  const file = resume.original_filename || resume.title || "Resume";
  const version = resume.version_number != null ? ` · v${resume.version_number}` : "";
  return `${file}${version}`;
}

function jdLabel(analysis: Analysis) {
  const job = analysis.job_description;
  if (!job) return "Job description unavailable";
  const title = job.title || "Job description";
  const company = job.company ? ` · ${job.company}` : "";
  const source = job.original_filename
    ? ` · ${job.original_filename}`
    : job.input_type
      ? ` · ${job.input_type}`
      : "";
  return `${title}${company}${source}`;
}

export function AnalysisHistory() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "upload" ? "upload" : "ats";
  const [tab, setTab] = useState<HubTab>(initialTab);

  useEffect(() => {
    setTab(searchParams.get("tab") === "upload" ? "upload" : "ats");
  }, [searchParams]);

  return (
    <>
      <PageHeader
        eyebrow="Resume analysis"
        title="ATS analysis workspace"
        description="Review past ATS scores or upload a resume and job description for a new analysis."
      />
      <nav className="settings-nav" aria-label="Resume analysis sections">
        <button
          type="button"
          className={`button ${tab === "ats" ? "button-primary" : "button-secondary"}`}
          onClick={() => setTab("ats")}
        >
          ATS analyses
        </button>
        <button
          type="button"
          className={`button ${tab === "upload" ? "button-primary" : "button-secondary"}`}
          onClick={() => setTab("upload")}
        >
          New upload
        </button>
      </nav>
      {tab === "ats" ? <AtsHistoryList /> : <NewAnalysis embedded />}
    </>
  );
}

function AtsHistoryList() {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiRequest<Analysis[]>("/ats-analyses")
      .then((rows) => {
        if (active) setAnalyses(rows || []);
      })
      .catch((reason: Error) => {
        if (active) setError(reason.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <Card>
        <p>Loading ATS analyses…</p>
      </Card>
    );
  }

  return (
    <div className="stack">
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      {!analyses.length ? (
        <Card className="empty-state">
          <h2>No ATS analyses yet</h2>
          <p>Upload a resume and job description to create your first analysis.</p>
          <Link className="button button-primary" href="/resume-analysis?tab=upload">
            New upload
          </Link>
        </Card>
      ) : (
        analyses.map((analysis) => (
          <Card className="stack" key={analysis.id}>
            <div className="row">
              <div>
                <p className="eyebrow">Previous ATS run</p>
                <h2 style={{ marginBottom: 6 }}>
                  {analysis.overall_score == null ? "No score" : `${analysis.overall_score}/100`}
                </h2>
                <p style={{ margin: 0 }}>{formatDate(analysis.created_at)}</p>
              </div>
              <Badge tone={analysis.status === "completed" ? "success" : analysis.status === "failed" ? "danger" : "warning"}>
                {analysis.status}
              </Badge>
            </div>
            <div className="grid-2">
              <div>
                <strong>Resume used</strong>
                <p style={{ margin: "6px 0 0" }}>{resumeLabel(analysis)}</p>
              </div>
              <div>
                <strong>Job description used</strong>
                <p style={{ margin: "6px 0 0" }}>{jdLabel(analysis)}</p>
              </div>
            </div>
            {analysis.status === "completed" && (
              <div className="cluster">
                <Link className="button button-primary" href={`/resume-analysis/report/${analysis.id}`}>
                  Open report
                </Link>
              </div>
            )}
          </Card>
        ))
      )}
    </div>
  );
}

type UploadStep = "upload" | "review";

function ExtractionPanel({
  title,
  status,
  sections,
  fallbackText,
}: {
  title: string;
  status: string;
  sections: Record<string, string[]>;
  fallbackText?: string;
}) {
  const entries = Object.entries(sections || {});
  return (
    <Card className="stack">
      <div className="row">
        <h2 style={{ margin: 0 }}>{title}</h2>
        <Badge tone={status === "confirmed" ? "success" : "warning"}>{status}</Badge>
      </div>
      {entries.length ? (
        entries.map(([section, lines]) => (
          <div key={section}>
            <strong>{section.replaceAll("_", " ")}</strong>
            <p style={{ margin: "6px 0 0" }}>{lines.join(" · ")}</p>
          </div>
        ))
      ) : fallbackText ? (
        <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>
          {fallbackText.slice(0, 2500)}
          {fallbackText.length > 2500 ? "…" : ""}
        </p>
      ) : (
        <p style={{ margin: 0 }}>No extracted content available yet.</p>
      )}
    </Card>
  );
}

export function NewAnalysis({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<UploadStep>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [jdMode, setJdMode] = useState<"text" | "file">("text");
  const [jd, setJd] = useState("");
  const [jdFile, setJdFile] = useState<File | null>(null);
  const [resume, setResume] = useState<Resume | null>(null);
  const [resumeVersion, setResumeVersion] = useState<ResumeVersion | null>(null);
  const [job, setJob] = useState<JobDescription | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Recover latest stored resume/JD after refresh so the flow can continue.
  useEffect(() => {
    let active = true;
    Promise.all([apiRequest<Resume[]>("/resumes"), apiRequest<JobDescription[]>("/job-descriptions")])
      .then(async ([resumeRows, jobRows]) => {
        if (!active) return;
        const latestResume = resumeRows?.length ? resumeRows[resumeRows.length - 1] : null;
        const latestJob = jobRows?.length ? jobRows[jobRows.length - 1] : null;
        if (latestResume) {
          const detail = await apiRequest<Resume>(`/resumes/${latestResume.id}`);
          if (!active) return;
          setResume(detail);
          setResumeVersion(detail.versions?.[0] || null);
        }
        if (latestJob && active) setJob(latestJob);
      })
      .catch(() => {
        /* keep empty state if nothing is stored yet */
      });
    return () => {
      active = false;
    };
  }, []);

  async function uploadResume() {
    if (!file || !isValidCareerFile(file)) {
      setError("Choose a PDF or DOCX resume no larger than 10 MB.");
      return;
    }
    const body = new FormData();
    body.set("file", file);
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest<{ resume: Resume; version: ResumeVersion }>("/resumes", {
        method: "POST",
        body,
      });
      setResume(result.resume);
      setResumeVersion(result.version);
      setReviewed(false);
      setStep("upload");
      setMessage(`Resume uploaded: ${result.resume.title}`);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function storeJd() {
    setBusy(true);
    setError("");
    try {
      let result: JobDescription;
      if (jdMode === "text") {
        if (jd.trim().length < 20) {
          throw new Error("Paste a job description of at least 20 characters.");
        }
        result = await apiRequest<JobDescription>("/job-descriptions", {
          method: "POST",
          body: JSON.stringify({ raw_text: jd }),
        });
      } else {
        if (!jdFile || !isValidCareerFile(jdFile)) {
          throw new Error("Choose a PDF or DOCX job description no larger than 10 MB.");
        }
        const body = new FormData();
        body.set("file", jdFile);
        result = await apiRequest<JobDescription>("/job-descriptions/upload", { method: "POST", body });
      }
      setJob(result);
      setReviewed(false);
      setStep("upload");
      const role = result.role_title || result.title;
      setMessage(role ? `Job description stored. Detected role: ${role}.` : "Job description stored.");
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function proceedToReview() {
    if (!resumeVersion || !job) {
      setError("Upload both a resume and a job description before proceeding.");
      return;
    }
    setError("");
    setMessage("");
    setReviewed(false);
    setStep("review");
  }

  async function runAnalysis() {
    if (!resume || !resumeVersion || !job || !reviewed) return;
    setBusy(true);
    setError("");
    setMessage("Confirming extractions and calculating ATS score…");
    try {
      let confirmedVersion = resumeVersion;
      if (confirmedVersion.extraction_status !== "confirmed") {
        confirmedVersion = await apiRequest<ResumeVersion>(`/resume-versions/${confirmedVersion.id}/confirm`, {
          method: "POST",
        });
        setResumeVersion(confirmedVersion);
      }
      if (!resume.is_active) {
        const activeResume = await apiRequest<Resume>(`/resumes/${resume.id}/activate`, { method: "POST" });
        setResume(activeResume);
      }
      let confirmedJob = job;
      if (confirmedJob.extraction_status !== "confirmed") {
        confirmedJob = await apiRequest<JobDescription>(`/job-descriptions/${confirmedJob.id}/confirm`, {
          method: "POST",
        });
        setJob(confirmedJob);
      }
      const analysis = await apiRequest<Analysis>("/ats-analyses", {
        method: "POST",
        body: JSON.stringify({
          resume_version_id: confirmedVersion.id,
          job_description_id: confirmedJob.id,
        }),
      });
      router.push(`/resume-analysis/report/${analysis.id}`);
    } catch (reason) {
      setError((reason as Error).message);
      setMessage("");
    } finally {
      setBusy(false);
    }
  }

  const resumeSections = resumeVersion?.structured_content?.sections || {};
  const jobSections = job?.structured_content?.sections || {};
  const bothReady = Boolean(resumeVersion && job);

  return (
    <>
      {!embedded && (
        <PageHeader
          eyebrow="New analysis"
          title="Resume and JD analysis"
          description="Upload a resume, upload a job description, review extractions, then run ATS analysis."
          action={
            <Link className="button button-secondary" href="/resume-analysis">
              ATS analyses
            </Link>
          }
        />
      )}

      <div className="cluster" style={{ marginBottom: 16 }}>
        <Badge tone={step === "upload" ? "info" : "success"}>1. Upload</Badge>
        <Badge tone={step === "review" ? "info" : "warning"}>2. Review extractions</Badge>
        <Badge tone="warning">3. Analysis</Badge>
      </div>

      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      {message && (
        <Card>
          <p role="status" style={{ margin: 0 }}>
            {message}
          </p>
        </Card>
      )}

      {step === "upload" && (
        <div className="stack">
          <div className="grid-2">
            <Card className="stack">
              <h2 style={{ margin: 0 }}>1. Upload resume</h2>
              <p style={{ margin: 0 }}>PDF or DOCX only (max 10 MB).</p>
              <label className="field-label">
                Resume file
                <Input
                  type="file"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(event) => setFile(event.target.files?.[0] || null)}
                />
              </label>
              <Button disabled={busy || !file} onClick={uploadResume}>
                {busy ? "Working…" : "Upload resume"}
              </Button>
              {resumeVersion && (
                <p role="status" style={{ margin: 0 }}>
                  Resume ready: {resume?.title || "Resume"} · {resumeVersion.extraction_status}
                </p>
              )}
            </Card>

            <Card className="stack">
              <h2 style={{ margin: 0 }}>2. Upload job description</h2>
              <p style={{ margin: 0 }}>Paste text, or upload PDF/DOCX. Role is detected from the JD.</p>
              <div className="cluster">
                <button
                  type="button"
                  className={`button ${jdMode === "text" ? "button-primary" : "button-secondary"}`}
                  onClick={() => setJdMode("text")}
                >
                  Paste text
                </button>
                <button
                  type="button"
                  className={`button ${jdMode === "file" ? "button-primary" : "button-secondary"}`}
                  onClick={() => setJdMode("file")}
                >
                  Upload PDF/DOCX
                </button>
              </div>
              {jdMode === "text" ? (
                <label className="field-label">
                  Paste text
                  <Textarea
                    value={jd}
                    onChange={(event) => setJd(event.target.value)}
                    placeholder="Paste the job description…"
                  />
                </label>
              ) : (
                <label className="field-label">
                  JD file
                  <Input
                    type="file"
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(event) => setJdFile(event.target.files?.[0] || null)}
                  />
                </label>
              )}
              <Button disabled={busy || (jdMode === "text" ? !jd.trim() : !jdFile)} onClick={storeJd}>
                {busy ? "Working…" : "Store job description"}
              </Button>
              {job && (
                <p role="status" style={{ margin: 0 }}>
                  JD ready: {job.role_title || job.title}
                  {job.company ? ` · ${job.company}` : ""} · {job.extraction_status}
                </p>
              )}
            </Card>
          </div>

          <Card className="stack">
            <p style={{ margin: 0 }}>
              {bothReady
                ? "Both resume and JD are stored. Proceed to review extractions, then run analysis."
                : "Upload both a resume and a job description to continue."}
            </p>
            <Button disabled={!bothReady || busy} onClick={proceedToReview}>
              Proceed
            </Button>
          </Card>
        </div>
      )}

      {step === "review" && resumeVersion && job && (
        <div className="stack">
          <div className="row">
            <div>
              <p className="eyebrow">Review extractions</p>
              <h2 style={{ margin: 0 }}>Confirm extracted resume and JD</h2>
            </div>
            <Button variant="secondary" onClick={() => setStep("upload")}>
              Back to upload
            </Button>
          </div>

          <div className="grid-2">
            <ExtractionPanel
              title={`Resume · ${resume?.title || "Uploaded resume"}`}
              status={resumeVersion.extraction_status}
              sections={resumeSections}
            />
            <ExtractionPanel
              title={`Job description · ${job.role_title || job.title}${job.company ? ` · ${job.company}` : ""}`}
              status={job.extraction_status}
              sections={jobSections}
              fallbackText={job.raw_text}
            />
          </div>

          <Card className="stack">
            <label>
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(event) => setReviewed(event.target.checked)}
              />{" "}
              I reviewed the extracted resume and job description and confirm they can be used for ATS keyword coverage.
            </label>
            <Button disabled={busy || !reviewed} onClick={runAnalysis}>
              {busy ? "Calculating…" : "Confirm inputs and calculate ATS score"}
            </Button>
          </Card>
        </div>
      )}
    </>
  );
}

export function ExtractionReview() {
  return (
    <>
      <PageHeader
        eyebrow="Candidate review"
        title="Review extracted content"
        description="Upload a resume and job description, then confirm extraction before scoring."
      />
      <Card className="empty-state">
        <h2>Use New upload</h2>
        <p>Extraction review happens on the new upload flow after files are stored.</p>
        <Link className="button button-primary" href="/resume-analysis?tab=upload">
          Go to new upload
        </Link>
      </Card>
    </>
  );
}

export function AtsReport() {
  const params = useParams<{ reportId: string }>();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [evidence, setEvidence] = useState<AtsEvidence[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      apiRequest<Analysis>(`/ats-analyses/${params.reportId}`),
      apiRequest<AtsEvidence[]>(`/ats-analyses/${params.reportId}/evidence`),
    ])
      .then(([record, rows]) => {
        setAnalysis(record);
        setEvidence(rows);
      })
      .catch((reason: Error) => setError(reason.message));
  }, [params.reportId]);

  if (error) {
    return (
      <>
        <PageHeader eyebrow="ATS analysis" title="Report unavailable" description="The persisted report could not be loaded." />
        <Card>
          <p role="alert" className="field-error">
            {error}
          </p>
        </Card>
      </>
    );
  }
  if (!analysis) {
    return (
      <PageHeader
        eyebrow="ATS analysis"
        title="Loading evidence report"
        description="Reading the persisted analysis from your workspace…"
      />
    );
  }

  const matched = evidence.filter((item) => item.match_status === "strong_match");
  const missing = evidence.filter((item) => item.match_status === "not_found");

  return (
    <div className="stack">
      <PageHeader
        eyebrow="ATS keyword coverage"
        title={`${analysis.overall_score ?? 0}/100`}
        description="A deterministic comparison of confirmed resume text against confirmed job-description terms."
        action={
          <Link className="button button-secondary" href="/resume-analysis?tab=upload">
            New analysis
          </Link>
        }
      />
      <Card className="stack">
        <div className="grid-2">
          <div>
            <strong>Resume used</strong>
            <p style={{ margin: "6px 0 0" }}>{resumeLabel(analysis)}</p>
          </div>
          <div>
            <strong>Job description used</strong>
            <p style={{ margin: "6px 0 0" }}>{jdLabel(analysis)}</p>
          </div>
        </div>
        <p style={{ margin: 0 }}>Analyzed {formatDate(analysis.created_at)}</p>
      </Card>
      <Card className="stack panel-blue">
        <Progress value={analysis.overall_score || 0} label="JD keyword coverage" />
        <p>
          <strong>{matched.length}</strong> matched and <strong>{missing.length}</strong> missing across {evidence.length}{" "}
          scored terms.
        </p>
        <p>{analysis.summary?.disclaimer || "Coverage evidence is not a hiring prediction."}</p>
      </Card>
      <div className="grid-2">
        <Card className="stack">
          <h2>Matched evidence</h2>
          {matched.length ? (
            matched.map((item) => (
              <div className="suggestion" key={item.id}>
                <strong>{item.requirement_text}</strong>
                <span>{item.resume_evidence_text || "Matched in confirmed resume text"}</span>
              </div>
            ))
          ) : (
            <p>No scored JD term was found in the confirmed resume.</p>
          )}
        </Card>
        <Card className="stack">
          <h2>Missing terms</h2>
          {missing.length ? (
            missing.map((item) => (
              <div className="suggestion" key={item.id}>
                <strong>{item.requirement_text}</strong>
                <span>{item.explanation}</span>
              </div>
            ))
          ) : (
            <p>No scored JD terms are missing.</p>
          )}
        </Card>
      </div>
      <Card>
        <p className="muted">
          Method: {analysis.summary?.method || "Deterministic normalized keyword coverage"}. Matching is exact after
          normalization, so it remains auditable and does not invent candidate experience.
        </p>
      </Card>
    </div>
  );
}
