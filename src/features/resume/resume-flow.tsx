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
  summary?: {
    method?: string;
    disclaimer?: string;
    matched?: number;
    missing?: number;
    total?: number;
    missing_terms?: string[];
    overall_inference?: string;
    focus_areas?: string[];
    inference_provider?: string;
  };
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

type HubTab = "ats" | "resumes" | "upload";

type ResumeListItem = {
  id: string;
  title: string;
  is_active: boolean;
  created_at: string;
  latest_version?: {
    id: string;
    version_number: number;
    original_filename?: string;
    mime_type?: string;
    extraction_status?: string;
    created_at?: string;
    size_bytes?: number;
  } | null;
};

type ResumePreview = {
  resume: { id: string; title: string; is_active: boolean; created_at: string };
  version: {
    id: string;
    version_number: number;
    original_filename?: string;
    mime_type?: string;
    extraction_status?: string;
    created_at?: string;
    size_bytes?: number;
    plain_text?: string;
    structured_content?: StructuredContent;
    content_edited?: boolean;
  };
  download_url?: string | null;
  expires_in?: number;
  prefer_rendered_pdf?: boolean;
};

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
  const tabParam = searchParams.get("tab");
  const initialTab: HubTab =
    tabParam === "upload" ? "upload" : tabParam === "resumes" ? "resumes" : "ats";
  const [tab, setTab] = useState<HubTab>(initialTab);

  useEffect(() => {
    const next =
      searchParams.get("tab") === "upload"
        ? "upload"
        : searchParams.get("tab") === "resumes"
          ? "resumes"
          : "ats";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: derives tab from URL params
    setTab(next);
  }, [searchParams]);

  return (
    <>
      <PageHeader
        eyebrow="Resume analysis"
        title="Resume analysis"
        description="Manage resumes, review past ATS scores, or start a new analysis."
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
          className={`button ${tab === "resumes" ? "button-primary" : "button-secondary"}`}
          onClick={() => setTab("resumes")}
        >
          Resumes
        </button>
        <button
          type="button"
          className={`button ${tab === "upload" ? "button-primary" : "button-secondary"}`}
          onClick={() => setTab("upload")}
        >
          New upload
        </button>
      </nav>
      {tab === "ats" ? <AtsHistoryList /> : tab === "resumes" ? <ResumeLibrary /> : <NewAnalysis embedded />}
    </>
  );
}

function isPdfMimeOrName(mime?: string | null, filename?: string | null) {
  const m = (mime || "").toLowerCase();
  const name = (filename || "").toLowerCase();
  return m.includes("pdf") || name.endsWith(".pdf");
}

function ResumeLibrary() {
  const [resumes, setResumes] = useState<ResumeListItem[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<ResumePreview | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);

  async function loadResumes() {
    const rows = await apiRequest<ResumeListItem[]>("/resumes");
    setResumes(rows || []);
  }

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState is inside promise callbacks, not synchronously
    loadResumes()
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

  useEffect(() => {
    if (!preview) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPreview(null);
        setPdfUrl(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [preview]);

  async function resolvePdfPreviewUrl(data: ResumePreview): Promise<string> {
    // After in-place edits, original upload is stale — show PDF rendered from current content.
    const useRendered =
      data.prefer_rendered_pdf ||
      data.version.content_edited ||
      !isPdfMimeOrName(data.version.mime_type, data.version.original_filename);

    if (!useRendered && data.download_url) {
      return data.download_url;
    }
    if (!data.version.id) {
      throw new Error("This resume has no version to preview as PDF.");
    }
    const created = await apiRequest<{ id: string }>(`/resume-versions/${data.version.id}/exports`, {
      method: "POST",
      body: JSON.stringify({ format: "pdf" }),
    });
    const download = await apiRequest<{ download_url?: string }>(`/resume-exports/${created.id}/download`);
    if (!download.download_url) {
      throw new Error("PDF preview link could not be created.");
    }
    return download.download_url;
  }

  async function openPreview(resumeId: string) {
    setPreviewLoading(true);
    setPreviewLoadingId(resumeId);
    setError("");
    setPdfUrl(null);
    try {
      const data = await apiRequest<ResumePreview>(`/resumes/${resumeId}/preview`);
      const url = await resolvePdfPreviewUrl(data);
      setPreview(data);
      setPdfUrl(url);
    } catch (reason) {
      setPreview(null);
      setPdfUrl(null);
      setError((reason as Error).message);
    } finally {
      setPreviewLoading(false);
      setPreviewLoadingId(null);
    }
  }

  function closePreview() {
    setPreview(null);
    setPdfUrl(null);
  }

  async function deleteResume(resumeId: string, title: string) {
    if (!window.confirm(`Delete resume “${title}”? This removes it from your library.`)) return;
    setDeletingId(resumeId);
    setError("");
    setMessage("");
    try {
      await apiRequest(`/resumes/${resumeId}`, { method: "DELETE" });
      setResumes((current) => current.filter((row) => row.id !== resumeId));
      if (preview?.resume.id === resumeId) closePreview();
      setMessage("Resume deleted.");
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <Card>
        <p>Loading resumes…</p>
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
      {message && (
        <p role="status" style={{ margin: 0 }}>
          {message}
        </p>
      )}
      {!resumes.length ? (
        <Card className="empty-state">
          <h2>No resumes yet</h2>
          <p>Upload a resume from New upload to see it here.</p>
          <Link className="button button-primary" href="/resume-analysis?tab=upload">
            New upload
          </Link>
        </Card>
      ) : (
        resumes.map((resume) => (
          <Card className="stack" key={resume.id}>
            <div className="row">
              <div>
                <p className="eyebrow">{resume.is_active ? "Active resume" : "Stored resume"}</p>
                <h2 style={{ marginBottom: 6 }}>{resume.title}</h2>
                <p style={{ margin: 0 }}>
                  {resume.latest_version?.original_filename || "File stored"}
                  {resume.latest_version?.version_number != null
                    ? ` · v${resume.latest_version.version_number}`
                    : ""}
                  {" · "}
                  {formatDate(resume.created_at)}
                </p>
                {resume.latest_version?.extraction_status && (
                  <p className="muted" style={{ margin: "6px 0 0" }}>
                    Status: {resume.latest_version.extraction_status}
                  </p>
                )}
              </div>
              <Badge tone={resume.is_active ? "success" : "info"}>{resume.is_active ? "Active" : "Stored"}</Badge>
            </div>
            <div className="cluster">
              <Button
                variant="secondary"
                disabled={previewLoading}
                onClick={() => openPreview(resume.id)}
              >
                {previewLoading && previewLoadingId === resume.id ? "Loading PDF…" : "Preview"}
              </Button>
              <Button
                variant="danger"
                disabled={deletingId === resume.id}
                onClick={() => deleteResume(resume.id, resume.title)}
              >
                {deletingId === resume.id ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </Card>
        ))
      )}

      {preview && pdfUrl ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={closePreview}
        >
          <div
            className="modal-panel modal-panel-wide"
            role="dialog"
            aria-modal="true"
            aria-label={`PDF preview: ${preview.resume.title}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow" style={{ margin: 0 }}>
                  Resume PDF
                </p>
                <h2>{preview.resume.title}</h2>
                <p className="muted" style={{ margin: "4px 0 0", fontSize: "var(--text-sm)" }}>
                  {preview.version.original_filename || "Stored file"}
                  {preview.version.version_number != null ? ` · v${preview.version.version_number}` : ""}
                </p>
              </div>
              <Button variant="secondary" onClick={closePreview}>
                Close
              </Button>
            </div>
            <iframe
              className="pdf-frame"
              title={`Resume PDF — ${preview.resume.title}`}
              src={pdfUrl}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AtsHistoryList() {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadAnalyses() {
    const rows = await apiRequest<Analysis[]>("/ats-analyses");
    setAnalyses(rows || []);
  }

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState is inside promise callbacks, not synchronously
    loadAnalyses()
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

  async function deleteAnalysis(analysisId: string) {
    if (!window.confirm("Delete this ATS analysis? This cannot be undone.")) return;
    setDeletingId(analysisId);
    setError("");
    setMessage("");
    try {
      await apiRequest(`/ats-analyses/${analysisId}`, { method: "DELETE" });
      setAnalyses((current) => current.filter((row) => row.id !== analysisId));
      setMessage("ATS analysis deleted.");
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

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
      {message && (
        <p role="status" style={{ margin: 0 }}>
          {message}
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
            <div className="cluster">
              {analysis.status === "completed" && (
                <Link className="button button-primary" href={`/resume-analysis/report/${analysis.id}`}>
                  Open report
                </Link>
              )}
              <Button
                variant="danger"
                disabled={deletingId === analysis.id}
                onClick={() => deleteAnalysis(analysis.id)}
              >
                {deletingId === analysis.id ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

type UploadStep = "upload" | "review";

function SectionEntries({ lines }: { lines: string[] }) {
  if (!lines?.length) {
    return <p style={{ margin: "6px 0 0" }}>No content extracted for this section.</p>;
  }
  return (
    <div className="stack" style={{ gap: 10, marginTop: 6 }}>
      {lines.map((entry, index) => (
        <div
          key={`${index}-${entry.slice(0, 24)}`}
          className="suggestion"
          style={{ whiteSpace: "pre-wrap", margin: 0 }}
        >
          {entry}
        </div>
      ))}
    </div>
  );
}

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
            <strong style={{ textTransform: "capitalize" }}>{section.replaceAll("_", " ")}</strong>
            <SectionEntries lines={lines} />
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

  const canProceed =
    Boolean(file && isValidCareerFile(file)) &&
    (jdMode === "text" ? jd.trim().length >= 20 : Boolean(jdFile && isValidCareerFile(jdFile)));

  /** On Proceed: store resume + JD in DB, then open extraction review. */
  async function proceed() {
    if (!file || !isValidCareerFile(file)) {
      setError("Choose a PDF or DOCX resume no larger than 10 MB.");
      return;
    }
    if (jdMode === "text" && jd.trim().length < 20) {
      setError("Paste a job description of at least 20 characters.");
      return;
    }
    if (jdMode === "file" && (!jdFile || !isValidCareerFile(jdFile))) {
      setError("Choose a PDF or DOCX job description no larger than 10 MB.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("Saving resume and job description…");
    try {
      const resumeBody = new FormData();
      resumeBody.set("file", file);
      const resumeResult = await apiRequest<{ resume: Resume; version: ResumeVersion }>("/resumes", {
        method: "POST",
        body: resumeBody,
      });

      let jobResult: JobDescription;
      if (jdMode === "text") {
        jobResult = await apiRequest<JobDescription>("/job-descriptions", {
          method: "POST",
          body: JSON.stringify({ raw_text: jd }),
        });
      } else {
        const jdBody = new FormData();
        jdBody.set("file", jdFile as File);
        jobResult = await apiRequest<JobDescription>("/job-descriptions/upload", {
          method: "POST",
          body: jdBody,
        });
      }

      setResume(resumeResult.resume);
      setResumeVersion(resumeResult.version);
      setJob(jobResult);
      setReviewed(false);
      setMessage(
        `Saved “${resumeResult.resume.title}” and JD${jobResult.role_title ? ` (${jobResult.role_title})` : ""}. Review extractions below.`,
      );
      setStep("review");
    } catch (reason) {
      setError((reason as Error).message);
      setMessage("");
    } finally {
      setBusy(false);
    }
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

  return (
    <>
      {!embedded && (
        <PageHeader
          eyebrow="New analysis"
          title="Resume and JD analysis"
          description="Select a resume and job description, then Proceed to save them and review extractions before analysis."
          action={
            <Link className="button button-secondary" href="/resume-analysis">
              ATS analyses
            </Link>
          }
        />
      )}

      <div className="cluster" style={{ marginBottom: 16 }}>
        <Badge tone={step === "upload" ? "info" : "success"}>1. Select files</Badge>
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
              <h2 style={{ margin: 0 }}>1. Resume</h2>
              <p style={{ margin: 0 }}>PDF or DOCX only (max 10 MB). Saved when you click Proceed.</p>
              <label className="field-label">
                Resume file
                <Input
                  type="file"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(event) => setFile(event.target.files?.[0] || null)}
                />
              </label>
              {file && (
                <p style={{ margin: 0 }} className="muted">
                  Selected: {file.name}
                </p>
              )}
            </Card>

            <Card className="stack">
              <h2 style={{ margin: 0 }}>2. Job description</h2>
              <p style={{ margin: 0 }}>Paste text, or choose PDF/DOCX. Saved when you click Proceed.</p>
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
              {jdMode === "file" && jdFile && (
                <p style={{ margin: 0 }} className="muted">
                  Selected: {jdFile.name}
                </p>
              )}
            </Card>
          </div>

          <Card className="stack">
            <p style={{ margin: 0 }}>
              {canProceed
                ? "Ready. Proceed will save the resume and job description, then show extractions."
                : "Select a resume file and a job description (text or file) to continue."}
            </p>
            <Button disabled={!canProceed || busy} onClick={proceed}>
              {busy ? "Saving…" : "Proceed"}
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
            <Button
              variant="secondary"
              onClick={() => {
                setStep("upload");
                setReviewed(false);
              }}
            >
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
        <PageHeader eyebrow="ATS analysis" title="Report unavailable" description="This analysis report could not be loaded." />
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
        description="Loading your analysis report…"
      />
    );
  }

  const missing = evidence.filter((item) => item.match_status === "not_found");
  const missingTerms =
    analysis.summary?.missing_terms?.length
      ? analysis.summary.missing_terms
      : analysis.score_breakdown?.missing_terms?.length
        ? analysis.score_breakdown.missing_terms
        : missing.map((item) => item.requirement_text).filter(Boolean);
  const total = analysis.summary?.total ?? evidence.length;
  const matchedCount = analysis.summary?.matched ?? Math.max(0, total - missingTerms.length);
  const overallInference = analysis.summary?.overall_inference || "";
  const focusAreas = analysis.summary?.focus_areas || [];

  return (
    <div className="stack">
      <PageHeader
        eyebrow="ATS keyword coverage"
        title={`${analysis.overall_score ?? 0}/100`}
        description="Exact keyword coverage vs the job description. Missing terms and an overall improvement brief only."
        action={
          <div className="cluster">
            <Link className="button button-primary" href={`/resume-analysis/report/${params.reportId}/edit`}>
              Edit resume to improve score
            </Link>
            <Link className="button button-secondary" href="/resume-analysis?tab=upload">
              New analysis
            </Link>
          </div>
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
        <div className="cluster">
          <Link className="button button-primary" href={`/resume-analysis/report/${params.reportId}/edit`}>
            Edit resume to improve score
          </Link>
        </div>
      </Card>
      <Card className="stack panel-blue">
        <Progress value={analysis.overall_score || 0} label="JD keyword coverage" />
        <p>
          <strong>{missingTerms.length}</strong> missing of <strong>{total || "—"}</strong> scored terms
          {matchedCount != null ? ` (${matchedCount} matched)` : ""}.
        </p>
        <p>{analysis.summary?.disclaimer || "Keyword coverage is not a hiring prediction."}</p>
      </Card>
      <Card className="stack">
        <h2 style={{ margin: 0 }}>Missing keywords</h2>
        {missingTerms.length ? (
          <div className="cluster" style={{ gap: 8 }}>
            {missingTerms.map((term) => (
              <Badge key={term} tone="warning">
                {term}
              </Badge>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0 }}>No scored JD terms are missing.</p>
        )}
        <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
          Next: open the editor to add only true keywords, rewrite sections, apply AI suggestions, export PDF/DOCX, then
          re-run ATS against this job description.
        </p>
        <div className="cluster">
          <Link className="button button-primary" href={`/resume-analysis/report/${params.reportId}/edit`}>
            Edit resume to improve score
          </Link>
        </div>
      </Card>
      <Card className="stack">
        <h2 style={{ margin: 0 }}>Overall improvement inference</h2>
        {overallInference ? (
          <div className="suggestion" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
            {overallInference}
          </div>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            No improvement brief was stored for this analysis. Run a new analysis after restarting the API.
          </p>
        )}
        {focusAreas.length > 0 ? (
          <div className="stack" style={{ gap: 6 }}>
            <strong>Focus areas (from missing keywords)</strong>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {focusAreas.map((area) => (
                <li key={area}>{area}</li>
              ))}
            </ul>
          </div>
        ) : null}

      </Card>
      <Card>
        <p className="muted">
          Method: {analysis.summary?.method || "Deterministic normalized keyword coverage"}. Matching is exact after
          normalization. Improvement text is limited to missing keywords and must not invent experience.
        </p>
      </Card>
    </div>
  );
}
