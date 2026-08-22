
import { Link } from "@/shared/ui/router-link";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { BriefcaseBusiness, CheckCircle2, FileText, RotateCcw, ShieldCheck } from "lucide-react";






import { apiRequest } from "@/shared/api/client";
import { jdLabel, resumeLabel } from "@/features/resume/analysis-labels";
import { isValidCareerFile } from "@/shared/utils";
import { BookLoader } from "@/shared/ui/book-loader";
import { Badge, Button, Card, Input, PageHeader, Progress, Textarea } from "@/shared/ui/primitives";
import { RagCareerAssistant } from "./rag-career-assistant";

type StructuredContent = {
  schema_version?: string;
  sections: Record<string, string[]>;
  unclassified_blocks?: string[];
  warnings?: string[];
  corrections?: Record<string, unknown>;
  extraction_method?: string;
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
function uniqueTerms(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
type Analysis = {
  id: string;
  status: string;
  overall_score: number | null;
  score_breakdown?: {
    matched_terms?: string[];
    partial_terms?: string[];
    missing_terms?: string[];
    total_terms?: number;
    method?: string;
    required_score?: number;
    preferred_score?: number;
    section_summary?: Record<string, string[]>;
    keyword_coverage_score?: number;
    structured_parameter_scores?: Record<string, number> | null;
    domain_gate?: { decision?: "ALLOW" | "REJECT"; reason?: string } | null;
  };
  summary?: {
    method?: string;
    disclaimer?: string;
    matched?: number;
    missing?: number;
    total?: number;
    missing_terms?: string[];
    partial_terms?: string[];
    critical_missing?: string[];
    preferred_missing?: string[];
    required_score?: number;
    preferred_score?: number;
    section_summary?: Record<string, string[]>;
    overall_inference?: string;
    focus_areas?: string[];
    priority_actions?: string[];
    section_guidance?: string[];
    do_not_claim?: string[];
    inference_provider?: string;
    structured_composite_score?: number | null;
    structured_parameter_scores?: Record<string, number> | null;
    domain_gate?: { decision?: "ALLOW" | "REJECT"; reason?: string } | null;
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
  parsed_inputs?: {
    resume?: ParsedInput | null;
    job_description?: ParsedInput | null;
  };
};
type ParsedInput = {
  filename?: string | null;
  extraction_status?: string | null;
  plain_text?: string;
  structured_content?: StructuredContent;
};
type AtsEvidence = {
  id: string;
  requirement_text: string;
  requirement_type?: string | null;
  resume_evidence_text?: string | null;
  resume_section?: string | null;
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

function parsedSections(input?: ParsedInput | null) {
  return Object.entries(input?.structured_content?.sections || {}).filter(
    ([, values]) => values.some((value) => value.trim()),
  );
}

function ParsedInputPanel({ title, input }: { title: string; input?: ParsedInput | null }) {
  if (!input) {
    return (
      <Card className="stack">
        <h2 style={{ margin: 0 }}>{title}</h2>
        <p className="muted" style={{ margin: 0 }}>Parsed source is unavailable for this analysis.</p>
      </Card>
    );
  }

  const sections = parsedSections(input);
  return (
    <Card className="stack">
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: "var(--text-sm)" }}>
            {input.filename || "Pasted text"} · {input.extraction_status || "parsed"}
          </p>
        </div>
        <Badge variant="default">Source text</Badge>
      </div>
      {sections.length > 0 ? (
        <div className="stack" style={{ gap: 10 }}>
          {sections.map(([section, values]) => (
            <section key={section} className="parsed-section">
              <h3>{section.replace(/_/g, " ")}</h3>
              {values.map((value, index) => <p key={`${section}-${index}`}>{value}</p>)}
            </section>
          ))}
        </div>
      ) : null}
      <details>
        <summary>Show complete parsed text</summary>
        <pre className="parsed-source">{input.plain_text || "No parsed text was stored."}</pre>
      </details>
    </Card>
  );
}

export function AnalysisHistory() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialTab: HubTab =
    tabParam === "upload" ? "upload" : tabParam === "resumes" ? "resumes" : "ats";
  const [tab, setTab] = useState<HubTab>(initialTab);

  function selectTab(next: HubTab) {
    setTab(next);
    const params = new URLSearchParams(searchParams);
    if (next === "ats") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params);
  }

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
    <div className="feature-page">
      <PageHeader
        eyebrow="Resume analysis"
        title="Resume analysis"
        description="Manage resumes, review past ATS scores, or start a new analysis."
      />
      <nav className="settings-nav" aria-label="Resume analysis sections">
        <button
          type="button"
          className={`button ${tab === "ats" ? "button-primary is-active" : "button-secondary"}`}
          onClick={() => selectTab("ats")}
          aria-current={tab === "ats" ? "page" : undefined}
        >
          ATS analyses
        </button>
        <button
          type="button"
          className={`button ${tab === "resumes" ? "button-primary is-active" : "button-secondary"}`}
          onClick={() => selectTab("resumes")}
          aria-current={tab === "resumes" ? "page" : undefined}
        >
          Resumes
        </button>
        <button
          type="button"
          className={`button ${tab === "upload" ? "button-primary is-active" : "button-secondary"}`}
          onClick={() => selectTab("upload")}
          aria-current={tab === "upload" ? "page" : undefined}
        >
          New upload
        </button>
      </nav>
      {tab === "ats" ? <AtsHistoryList /> : tab === "resumes" ? <ResumeLibrary /> : <NewAnalysis embedded />}
    </div>
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
    setResumes(Array.isArray(rows) ? rows : []);
  }

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState is inside promise callbacks, not synchronously
    loadResumes()
      .catch((reason: Error) => {
        if (active) {
          setError(reason.message || "Could not load resumes.");
          setResumes([]);
        }
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
    // Prefer rendered PDF when structured content changed from the original upload.
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
      {!resumes.length && !error ? (
        <Card className="empty-state">
          <h2>No resumes yet</h2>
          <p>Upload a resume from New upload to see it here.</p>
          <Link className="button button-primary" href="/resume-analysis?tab=upload">
            New upload
          </Link>
        </Card>
      ) : null}
      {!resumes.length && error ? (
        <Card className="empty-state">
          <h2>Could not load resumes</h2>
          <p>Confirm the backend is running and object storage is configured, then retry.</p>
          <Button
            onClick={() => {
              setLoading(true);
              setError("");
              void loadResumes()
                .catch((reason: Error) => setError(reason.message))
                .finally(() => setLoading(false));
            }}
          >
            Retry
          </Button>
        </Card>
      ) : null}
      {resumes.map((resume) => (
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
              <Badge variant={resume.is_active ? "default" : "secondary"}>{resume.is_active ? "Active" : "Stored"}</Badge>
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
                variant="destructive"
                disabled={deletingId === resume.id}
                onClick={() => deleteResume(resume.id, resume.title)}
              >
                {deletingId === resume.id ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </Card>
      ))}

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
            onClick={(event: any) => event.stopPropagation()}
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
    // Defensive: API should return an array; never crash the hub on a bad payload.
    setAnalyses(Array.isArray(rows) ? rows : []);
  }

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState is inside promise callbacks, not synchronously
    loadAnalyses()
      .catch((reason: Error) => {
        if (active) {
          setError(reason.message || "Could not load ATS analyses.");
          setAnalyses([]);
        }
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

  const completedCount = analyses.filter((item) => item.status === "completed").length;
  const otherCount = analyses.length - completedCount;

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
      <div className="analysis-overview" aria-label="ATS analysis summary">
        <div>
          <span className="analysis-overview-value">{analyses.length}</span>
          <span className="analysis-overview-label">Total analyses</span>
        </div>
        <div>
          <span className="analysis-overview-value">{completedCount}</span>
          <span className="analysis-overview-label">Completed</span>
        </div>
        <div>
          <span className="analysis-overview-value">{otherCount}</span>
          <span className="analysis-overview-label">Needs attention</span>
        </div>
      </div>
      {!analyses.length && !error ? (
        <Card className="empty-state">
          <h2>No ATS analyses yet</h2>
          <p>Upload a resume and job description to create your first analysis.</p>
          <Link className="button button-primary" href="/resume-analysis?tab=upload">
            New upload
          </Link>
        </Card>
      ) : null}
      {!analyses.length && error ? (
        <Card className="empty-state">
          <h2>Could not load analyses</h2>
          <p>Check that the backend is running and your session is still valid, then retry.</p>
          <Button
            onClick={() => {
              setLoading(true);
              setError("");
              void loadAnalyses()
                .catch((reason: Error) => setError(reason.message))
                .finally(() => setLoading(false));
            }}
          >
            Retry
          </Button>
        </Card>
      ) : null}
      {analyses.map((analysis) => (
        <Card className="stack" key={analysis.id}>
          <div className="row">
            <div>
              <p className="eyebrow">Previous ATS run</p>
              <h2 style={{ marginBottom: 6 }}>
                {analysis.overall_score == null ? "No score" : `${Math.round(Number(analysis.overall_score))}%`}
              </h2>
              <p style={{ margin: 0 }}>{formatDate(analysis.created_at)}</p>
            </div>
            <Badge
              variant={
                analysis.status === "completed"
                  ? "default"
                  : analysis.status === "failed"
                    ? "destructive"
                    : "outline"
              }
            >
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
              variant="destructive"
              disabled={deletingId === analysis.id}
              onClick={() => deleteAnalysis(analysis.id)}
            >
              {deletingId === analysis.id ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

type UploadStep = "upload" | "review";

function SectionEntries({
  section,
  lines,
  editable = false,
  onEdit,
}: {
  section: string;
  lines: string[];
  editable?: boolean;
  onEdit?: (index: number, value: string) => void;
}) {
  if (!lines?.length) {
    return <p style={{ margin: "6px 0 0" }}>No content extracted for this section.</p>;
  }
  return (
    <div className="extraction-entries">
      {lines.map((entry, index) => (
        <div key={`${index}-${entry.slice(0, 24)}`} className="extraction-entry">
          {editable ? (
            <Textarea
              aria-label={`Edit ${section.replaceAll("_", " ")} entry ${index + 1}`}
              value={entry}
              onChange={(event: any) => onEdit?.(index, event.target.value)}
              rows={Math.min(6, Math.max(2, entry.split("\n").length))}
            />
          ) : (
            entry
          )}
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
  editable = false,
  onEdit,
}: {
  title: string;
  status: string;
  sections: Record<string, string[]>;
  fallbackText?: string;
  editable?: boolean;
  onEdit?: (section: string, index: number, value: string) => void;
}) {
  const entries = Object.entries(sections || {});
  const contentCount = entries.reduce((total, [, lines]) => total + lines.length, 0);
  const isResume = title.toLowerCase().startsWith("resume");
  return (
    <Card className="extraction-card">
      <div className="extraction-card-header">
        <div className="extraction-card-title">
          <span className="extraction-icon" aria-hidden="true">
            {isResume ? <FileText size={18} strokeWidth={2.2} /> : <BriefcaseBusiness size={18} strokeWidth={2.2} />}
          </span>
          <div>
            <p className="extraction-kicker">{isResume ? "Parsed resume" : "Parsed job description"}</p>
            <h2>{title.replace(/^Resume · |^Job description · /, "")}</h2>
          </div>
        </div>
        <Badge variant={status === "confirmed" ? "default" : "outline"}>{status}</Badge>
      </div>
      <div className="extraction-card-meta">
        <span>{entries.length ? `${entries.length} sections` : "Raw text"}</span>
        <span aria-hidden="true">·</span>
        <span>{contentCount ? `${contentCount} entries` : "Needs review"}</span>
      </div>
      {entries.length ? (
        <div className="extraction-sections">
          {entries.map(([section, lines]) => (
            <section className="extraction-section" key={section}>
              <div className="extraction-section-heading">
                <h3>{section.replaceAll("_", " ")}</h3>
                <span>{lines.length}</span>
              </div>
              <SectionEntries
                section={section}
                lines={lines}
                editable={editable}
                onEdit={(index, value) => onEdit?.(section, index, value)}
              />
            </section>
          ))}
        </div>
      ) : fallbackText ? (
        <p className="extraction-fallback">
          {fallbackText.slice(0, 2500)}
          {fallbackText.length > 2500 ? "…" : ""}
        </p>
      ) : (
        <p className="extraction-empty">No extracted content available yet.</p>
      )}
    </Card>
  );
}

export function NewAnalysis({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const [step, setStep] = useState<UploadStep>("upload");
  const [resumeSource, setResumeSource] = useState<"stored" | "upload">("upload");
  const [storedResumes, setStoredResumes] = useState<ResumeListItem[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState("");
  const [loadingResumes, setLoadingResumes] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [jdMode, setJdMode] = useState<"text" | "file">("text");
  const [jd, setJd] = useState("");
  const [jdFile, setJdFile] = useState<File | null>(null);
  const [resume, setResume] = useState<Resume | null>(null);
  const [resumeVersion, setResumeVersion] = useState<ResumeVersion | null>(null);
  const [editedResumeSections, setEditedResumeSections] = useState<Record<string, string[]>>({});
  const [job, setJob] = useState<JobDescription | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoadingResumes(true);
    apiRequest<ResumeListItem[]>("/resumes")
      .then((rows) => {
        if (!active) return;
        const list = rows || [];
        setStoredResumes(list);
        const preferred =
          list.find((row) => row.is_active && row.latest_version?.id) ||
          list.find((row) => row.latest_version?.id) ||
          null;
        if (preferred?.id) {
          setSelectedResumeId(preferred.id);
          setResumeSource("stored");
        }
      })
      .catch(() => {
        if (!active) return;
        // Keep upload mode if the library cannot be loaded.
        setStoredResumes([]);
      })
      .finally(() => {
        if (active) setLoadingResumes(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const jdReady =
    jdMode === "text" ? jd.trim().length >= 20 : Boolean(jdFile && isValidCareerFile(jdFile));
  const resumeReady =
    resumeSource === "stored"
      ? Boolean(selectedResumeId)
      : Boolean(file && isValidCareerFile(file));
  const canProceed = resumeReady && jdReady;

  async function saveJobDescription(): Promise<JobDescription> {
    if (jdMode === "text") {
      return apiRequest<JobDescription>("/job-descriptions", {
        method: "POST",
        body: JSON.stringify({ raw_text: jd }),
      });
    }
    const jdBody = new FormData();
    jdBody.set("file", jdFile as File);
    return apiRequest<JobDescription>("/job-descriptions/upload", {
      method: "POST",
      body: jdBody,
    });
  }

  /** On Proceed: reuse stored resume or upload new + JD, then open extraction review. */
  async function proceed() {
    if (resumeSource === "stored" && !selectedResumeId) {
      setError("Choose a saved resume, or switch to upload a new file.");
      return;
    }
    if (resumeSource === "upload" && (!file || !isValidCareerFile(file))) {
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
    setMessage(
      resumeSource === "stored"
        ? "Using your saved resume and saving job description…"
        : "Saving resume and job description…",
    );
    try {
      let resolvedResume: Resume;
      let resolvedVersion: ResumeVersion | null = null;

      if (resumeSource === "stored") {
        const detail = await apiRequest<Resume & { versions?: ResumeVersion[] }>(
          `/resumes/${selectedResumeId}`,
        );
        const version = (detail.versions || [])[0] || null;
        if (!version?.id) {
          throw new Error("The selected resume has no stored version. Upload a new file instead.");
        }
        resolvedResume = {
          id: detail.id,
          title: detail.title,
          is_active: detail.is_active,
          created_at: detail.created_at,
        };
        resolvedVersion = version;
      } else {
        const resumeBody = new FormData();
        resumeBody.set("file", file as File);
        const resumeResult = await apiRequest<{
          resume: Resume;
          version?: ResumeVersion;
           accepted?: boolean;
        }>("/resumes", {
          method: "POST",
          body: resumeBody,
        });
        resolvedResume = resumeResult.resume;
        if (resumeResult.version) {
          resolvedVersion = resumeResult.version;
        } else {
          throw new Error("Resume upload returned no processing result.");
        }
      }

      const jobResult = await saveJobDescription();
      setResume(resolvedResume);
      setJob(jobResult);
      setReviewed(false);

      if (resolvedVersion) {
        setResumeVersion(resolvedVersion);
        setEditedResumeSections(resolvedVersion.structured_content?.sections || {});
        setMessage(
          resumeSource === "stored"
            ? `Using saved resume “${resolvedResume.title}” with JD${jobResult.role_title ? ` (${jobResult.role_title})` : ""}. Review extractions below.`
            : `Saved “${resolvedResume.title}” and JD${jobResult.role_title ? ` (${jobResult.role_title})` : ""}. Review extractions below.`,
        );
        setStep("review");
      }
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
      if (JSON.stringify(editedResumeSections) !== JSON.stringify(resumeVersion.structured_content?.sections || {})) {
        confirmedVersion = await apiRequest<ResumeVersion>(`/resume-versions/${resumeVersion.id}/extraction`, {
          method: "PATCH",
          body: JSON.stringify({
            structured_content: {
              ...resumeVersion.structured_content,
              sections: editedResumeSections,
              corrections: { ...(resumeVersion.structured_content.corrections || {}), candidate_review: true },
            },
          }),
        });
        setResumeVersion(confirmedVersion);
      }
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
      navigate(`/resume-analysis/report/${analysis.id}`);
    } catch (reason) {
      setError((reason as Error).message);
      setMessage("");
    } finally {
      setBusy(false);
    }
  }

  const resumeSections = editedResumeSections;
  const jobSections = job?.structured_content?.sections || {};

  return (
    <>
      {!embedded && (
        <PageHeader
          eyebrow="New analysis"
          title="Resume and JD analysis"
          description="Use a resume already on your profile or upload a new one, add a job description, then review extractions before analysis."
          action={
            <Link className="button button-secondary" href="/resume-analysis">
              ATS analyses
            </Link>
          }
        />
      )}

      <div className="cluster" style={{ marginBottom: 16 }}>
        <Badge variant={step === "upload" ? "secondary" : "default"}>1. Select files</Badge>
        <Badge variant={step === "review" ? "secondary" : "outline"}>2. Review extractions</Badge>
        <Badge variant="outline">3. Analysis</Badge>
      </div>

      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      {busy ? (
        <Card className="stack">
          <BookLoader
            title={
              step === "review"
                ? "Calculating ATS score"
                : message.toLowerCase().includes("analyz")
                  ? "Analyzing your resume"
                  : "Preparing your documents"
            }
            message={
              message ||
              (step === "review"
                ? "Matching keywords and building your evidence report…"
                : "Flipping through your resume so scoring feels snappy when ready…")
            }
          />
        </Card>
      ) : message ? (
        <Card>
          <p role="status" style={{ margin: 0 }}>
            {message}
          </p>
        </Card>
      ) : null}

      {step === "upload" && !busy && (
        <div className="stack">
          <div className="grid-2">
            <Card className="stack">
              <h2 style={{ margin: 0 }}>1. Resume</h2>
              <p style={{ margin: 0 }}>
                Reuse a resume saved from profile completion or a previous upload. No need to upload the same file again.
              </p>
              {loadingResumes ? (
                <p className="muted" style={{ margin: 0 }}>
                  Loading saved resumes…
                </p>
              ) : (
                <>
                  <div className="cluster">
                    <button
                      type="button"
                      className={`button ${resumeSource === "stored" ? "button-primary" : "button-secondary"}`}
                      disabled={!storedResumes.some((row) => row.latest_version?.id)}
                      onClick={() => setResumeSource("stored")}
                    >
                      Saved resume
                    </button>
                    <button
                      type="button"
                      className={`button ${resumeSource === "upload" ? "button-primary" : "button-secondary"}`}
                      onClick={() => setResumeSource("upload")}
                    >
                      Upload new
                    </button>
                  </div>
                  {resumeSource === "stored" ? (
                    storedResumes.some((row) => row.latest_version?.id) ? (
                      <label className="field-label">
                        Choose saved resume
                        <select
                          className="field"
                          value={selectedResumeId}
                          onChange={(event) => setSelectedResumeId(event.target.value)}
                        >
                          {storedResumes
                            .filter((row) => row.latest_version?.id)
                            .map((row) => (
                              <option key={row.id} value={row.id}>
                                {row.title}
                                {row.is_active ? " (active)" : ""}
                                {row.latest_version?.original_filename
                                  ? ` · ${row.latest_version.original_filename}`
                                  : ""}
                                {row.latest_version?.extraction_status
                                  ? ` · ${row.latest_version.extraction_status}`
                                  : ""}
                              </option>
                            ))}
                        </select>
                      </label>
                    ) : (
                      <p className="muted" style={{ margin: 0 }}>
                        No saved resumes yet. Upload one here or from Complete profile.
                      </p>
                    )
                  ) : (
                    <>
                      <label className="field-label">
                        Resume file (PDF or DOCX, max 10 MB)
                        <span className="file-picker">
                          <span className="file-picker-ui" aria-hidden="true">Choose file</span>
                          <span className="file-picker-name" aria-hidden="true">No file selected</span>
                          <Input
                            className="file-picker-input"
                            type="file"
                            aria-label="Choose resume file"
                            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                            onChange={(event: any) => setFile(event.target.files?.[0] || null)}
                          />
                        </span>
                      </label>
                      {file && (
                        <p style={{ margin: 0 }} className="muted">
                          Selected: {file.name}
                        </p>
                      )}
                    </>
                  )}
                </>
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
                    onChange={(event: any) => setJd(event.target.value)}
                    placeholder="Paste the job description…"
                  />
                </label>
              ) : (
                <label className="field-label">
                  JD file
                  <span className="file-picker">
                    <span className="file-picker-ui" aria-hidden="true">Choose file</span>
                    <span className="file-picker-name" aria-hidden="true">No file selected</span>
                    <Input
                      className="file-picker-input"
                      type="file"
                      aria-label="Choose job description file"
                      accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      onChange={(event: any) => setJdFile(event.target.files?.[0] || null)}
                    />
                  </span>
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
                ? resumeSource === "stored"
                  ? "Ready. Proceed will use your saved resume, save the job description, then show extractions."
                  : "Ready. Proceed will save the resume and job description, then show extractions."
                : resumeSource === "stored"
                  ? "Choose a saved resume and a job description (text or file) to continue."
                  : "Select a resume file and a job description (text or file) to continue."}
            </p>
            <Button disabled={!canProceed || busy || loadingResumes} onClick={proceed}>
              {busy ? "Saving…" : "Proceed"}
            </Button>
          </Card>
        </div>
      )}

      {step === "review" && resumeVersion && job && !busy && (
        <div className="review-workspace">
          <div className="review-hero">
            <div>
              <div className="review-title-row">
                <span className="review-step-marker">02</span>
                <p className="eyebrow">Review before scoring</p>
              </div>
              <h2>Confirm your analysis inputs</h2>
              <p>Check that the extracted content matches the files you supplied. Your ATS score will use only the confirmed data shown here.</p>
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                setStep("upload");
                setReviewed(false);
              }}
            >
              <RotateCcw size={16} aria-hidden="true" />
              Change files
            </Button>
          </div>

          <div className="review-trust-strip">
            <div><ShieldCheck size={18} aria-hidden="true" /><span><strong>Evidence-first scoring</strong><small>No unsupported experience is added.</small></span></div>
            <div><CheckCircle2 size={18} aria-hidden="true" /><span><strong>Two inputs ready</strong><small>Resume and job description are saved.</small></span></div>
          </div>

          <div className="review-document-grid">
            <ExtractionPanel
              title={`Resume · ${resume?.title || "Uploaded resume"}`}
              status={resumeVersion.extraction_status}
              sections={resumeSections}
              editable
              onEdit={(section, index, value) =>
                setEditedResumeSections((current) => ({
                  ...current,
                  [section]: (current[section] || []).map((entry, entryIndex) =>
                    entryIndex === index ? value : entry,
                  ),
                }))
              }
            />
            <ExtractionPanel
              title={`Job description · ${job.role_title || job.title}${job.company ? ` · ${job.company}` : ""}`}
              status={job.extraction_status}
              sections={jobSections}
              fallbackText={job.raw_text}
            />
          </div>

          <div className="review-confirm-bar">
            <label className="review-confirm-check">
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(event: any) => setReviewed(event.target.checked)}
              />{" "}
              <span>
                <strong>I reviewed both documents</strong>
                <small>I confirm this extracted content can be used for ATS keyword coverage.</small>
              </span>
            </label>
            <Button disabled={busy || !reviewed} onClick={runAnalysis}>
              {busy ? "Calculating…" : "Confirm inputs and calculate ATS score"}
            </Button>
          </div>
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
      <>
        <PageHeader
          eyebrow="ATS analysis"
          title="Loading evidence report"
          description="Opening your analysis report…"
        />
        <Card>
          <BookLoader
            title="Opening your report"
            message="Gathering scores and keyword evidence…"
          />
        </Card>
      </>
    );
  }

  const missing = evidence.filter((item) => item.match_status === "not_found");
  const partial = evidence.filter((item) => item.match_status === "partial_match");
  const missingTerms = uniqueTerms(
    analysis.summary?.missing_terms?.length
      ? analysis.summary.missing_terms
      : analysis.score_breakdown?.missing_terms?.length
        ? analysis.score_breakdown.missing_terms
        : missing.map((item) => item.requirement_text).filter(Boolean)
  );
  const total = analysis.summary?.total ?? evidence.length;
  const matchedCount = analysis.summary?.matched ?? Math.max(0, total - missingTerms.length);
  const overallInference = analysis.summary?.overall_inference || "";
  const focusAreas = uniqueTerms(analysis.summary?.focus_areas || []);
  const priorityActions = uniqueTerms(analysis.summary?.priority_actions || []);
  const sectionGuidance = uniqueTerms(analysis.summary?.section_guidance || []);
  const doNotClaim = uniqueTerms(analysis.summary?.do_not_claim || []);
  const criticalMissing = uniqueTerms(analysis.summary?.critical_missing || missingTerms);
  const preferredMissing = uniqueTerms(analysis.summary?.preferred_missing || []);
  const partialTerms = uniqueTerms(analysis.summary?.partial_terms || analysis.score_breakdown?.partial_terms || partial.map((item) => item.requirement_text));
  return (
    <div className="stack">
      <PageHeader
        eyebrow="ATS keyword coverage"
        title={
          analysis.overall_score == null
            ? "No score"
            : `${Math.round(Number(analysis.overall_score))}%`
        }
        description="Simple keyword coverage: each hit quotes an exact line from your confirmed resume. Nothing is invented."
        action={
          <div className="cluster">
            <Link className="button button-primary" href="/resume-analysis?tab=upload">
              New analysis
            </Link>
            <Link className="button button-secondary" href="/resume-analysis">
              Resume library
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
      </Card>
      <div className="grid-2">
        <ParsedInputPanel title="Parsed resume" input={analysis.parsed_inputs?.resume} />
        <ParsedInputPanel title="Parsed job description" input={analysis.parsed_inputs?.job_description} />
      </div>
      <Card className="stack panel-blue">
        <Progress
          value={analysis.overall_score == null ? 0 : Number(analysis.overall_score)}
          label={analysis.overall_score == null ? "Score unavailable" : "JD keyword coverage"}
        />
        <p>
          <strong>{missingTerms.length}</strong> missing of <strong>{total || "—"}</strong> scored terms
          {matchedCount != null ? ` (${matchedCount} matched)` : ""}.
        </p>
        <p>{analysis.summary?.disclaimer || "Keyword coverage is not a hiring prediction."}</p>
      </Card>
      <Card className="stack">
        <h2 style={{ margin: 0 }}>Matches</h2>
        <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
          Each JD requirement is checked against your resume text. Found items quote the matching resume line.
        </p>
        {evidence.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>No match rows stored for this analysis.</p>
        ) : (
          <div className="stack" style={{ gap: 10 }}>
            {evidence.map((row) => {
              const found = row.match_status === "strong_match" || row.match_status === "partial_match";
              return (
                <div key={row.id} className="panel-blue" style={{ padding: 14 }}>
                  <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontWeight: 600 }}>{row.requirement_text}</p>
                      {found && row.resume_evidence_text ? (
                        <p className="muted" style={{ margin: "6px 0 0", fontSize: "var(--text-sm)" }}>
                          In resume: “{row.resume_evidence_text}”
                        </p>
                      ) : (
                        <p className="muted" style={{ margin: "6px 0 0", fontSize: "var(--text-sm)" }}>
                          Not found in resume
                        </p>
                      )}
                    </div>
                    <Badge variant={found ? (row.match_status === "strong_match" ? "default" : "secondary") : "outline"}>
                      {found ? (row.match_status === "strong_match" ? "Found" : "Partial") : "Missing"}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
      <Card className="stack">
        <h2 style={{ margin: 0 }}>Requirement gaps</h2>
        {criticalMissing.length ? (
          <div className="stack" style={{ gap: 8 }}>
            <strong>Critical / required</strong>
            <div className="cluster" style={{ gap: 8 }}>
              {criticalMissing.map((term) => (
                <Badge key={`critical-${term}`} variant="outline">
                  {term}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
        {preferredMissing.length ? (
          <div className="stack" style={{ gap: 8 }}>
            <strong>Preferred</strong>
            <div className="cluster" style={{ gap: 8 }}>
              {preferredMissing.map((term) => (
                <Badge key={`preferred-${term}`} variant="secondary">
                  {term}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
        {partialTerms.length ? (
          <div className="stack" style={{ gap: 8 }}>
            <strong>Partial evidence</strong>
            <div className="cluster" style={{ gap: 8 }}>
              {partialTerms.map((term) => (
                <Badge key={`partial-${term}`} variant="secondary">
                  {term}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
        {!criticalMissing.length && !preferredMissing.length && !partialTerms.length ? (
          <p style={{ margin: 0 }}>No scored JD requirements are missing.</p>
        ) : null}
        {missingTerms.length ? (
          <div className="cluster" style={{ gap: 8 }}>
            {missingTerms.map((term) => (
              <Badge key={`missing-${term}`} variant="outline">
                {term}
              </Badge>
            ))}
          </div>
        ) : null}
        <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
          Use this report to update your resume outside the app (or re-upload a revised file), then run a new analysis
          against the same job description to re-check keyword coverage.
        </p>
        <div className="cluster">
          <Link className="button button-primary" href="/resume-analysis?tab=upload">
            Upload revised resume
          </Link>
          <Link className="button button-secondary" href="/resume-analysis?tab=ats">
            New analysis
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
        {priorityActions.length > 0 ? <div className="stack" style={{ gap: 6 }}><strong>Priority actions</strong><ul style={{ margin: 0, paddingLeft: 18 }}>{priorityActions.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
        {sectionGuidance.length > 0 ? <div className="stack" style={{ gap: 6 }}><strong>Section guidance</strong><ul style={{ margin: 0, paddingLeft: 18 }}>{sectionGuidance.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
        {doNotClaim.length > 0 ? <div className="stack" style={{ gap: 6 }}><strong>Evidence safeguards</strong><ul style={{ margin: 0, paddingLeft: 18 }}>{doNotClaim.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
      </Card>
      <div style={{ marginTop: 24 }}>
        <RagCareerAssistant
          resumeText={analysis.parsed_inputs?.resume?.plain_text || ""}
          jobDescriptionText={analysis.parsed_inputs?.job_description?.plain_text || ""}
        />
      </div>
    </div>
  );
}
