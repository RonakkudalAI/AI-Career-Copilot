
import { Link } from "@/shared/ui/router-link";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BriefcaseBusiness,
  CheckCircle2,
  CloudUpload,
  Eye,
  FileText,
  FolderOpen,
  History,
  RotateCcw,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { AnimatedIcon } from "@/components/ui/animated-icon";
import { RagCareerAssistant } from "./rag-career-assistant";




import "../resume.css";

import { apiRequest } from "@/shared/api/client";
import { jdLabel, resumeLabel } from "@/features/resume/analysis-labels";
import { isValidCareerFile } from "@/shared/utils";
import { BookLoader } from "@/shared/ui/book-loader";
import { Button, Input, Textarea } from "@/shared/ui/primitives";

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
    domain_gate?: { decision?: "ALLOW" | "REJECT" | "UNVERIFIED"; reason?: string } | null;
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
    domain_gate?: { decision?: "ALLOW" | "REJECT" | "UNVERIFIED"; reason?: string } | null;
    report_status?: "generated" | "unavailable" | "invalid_llm_output" | string;
    report_generation_id?: string | null;
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

function scoreBand(score: number | null): "high" | "mid" | "low" | "none" {
  if (score == null) return "none";
  const value = Number(score);
  if (!Number.isFinite(value)) return "none";
  if (value >= 80) return "high";
  if (value >= 55) return "mid";
  return "low";
}

function scoreTileLabel(band: ReturnType<typeof scoreBand>) {
  if (band === "high") return "strong";
  if (band === "mid") return "partial";
  if (band === "low") return "gaps";
  return "no score";
}

function coverageVerdict(score: number | null) {
  if (score == null) return "No score was recorded for this run.";
  const value = Math.round(Number(score));
  if (value >= 80) return "Strong coverage of this job description.";
  if (value >= 55) return "A solid base with clear gaps to close.";
  return "Coverage is thin — treat this report as your rewrite brief.";
}

function statusStamp(status: string): { tone: "done" | "wait" | "failed"; label: string } {
  if (status === "completed") return { tone: "done", label: "Completed" };
  if (status === "failed") return { tone: "failed", label: "Failed" };
  return { tone: "wait", label: status || "Pending" };
}

function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="ra-error">
      <AnimatedIcon icon={AlertTriangle} size={17} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

function StatusNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="ra-status">
      <AnimatedIcon icon={CheckCircle2} size={16} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

function parsedSections(input?: ParsedInput | null) {
  return Object.entries(input?.structured_content?.sections || {}).filter(
    ([, values]) => values.some((value) => value.trim()),
  );
}

function ParsedInputPanel({ title, input }: { title: string; input?: ParsedInput | null }) {
  if (!input) {
    return (
      <article className="ra-docpanel">
        <div className="ra-docpanel-head">
          <div className="ra-docpanel-id">
            <span className="ra-intake-icon" aria-hidden="true">
              <AnimatedIcon icon={FileText} size={18} strokeWidth={2.2} />
            </span>
            <div>
              <h2>{title}</h2>
            </div>
          </div>
        </div>
        <p className="ra-block-empty">Parsed source is unavailable for this analysis.</p>
      </article>
    );
  }

  const sections = parsedSections(input);
  return (
    <article className="ra-docpanel">
      <div className="ra-docpanel-head">
        <div className="ra-docpanel-id">
          <span className="ra-intake-icon" aria-hidden="true">
            <AnimatedIcon icon={FileText} size={18} strokeWidth={2.2} />
          </span>
          <div>
            <p className="ra-docpanel-kicker">{title}</p>
            <h2>{input.filename || "Pasted text"}</h2>
          </div>
        </div>
        <span className="ra-stamp" data-tone="stored">
          {input.extraction_status || "parsed"}
        </span>
      </div>
      {sections.length > 0 ? (
        <div className="ra-blocks">
          {sections.map(([section, values]) => (
            <section key={section} className="ra-block">
              <div className="ra-block-head">
                <h3>{section.replace(/_/g, " ")}</h3>
                <span className="ra-block-count">{values.length}</span>
              </div>
              <div className="ra-entries">
                {values.map((value, index) => (
                  <p key={`${section}-${index}`} className="ra-entry">
                    {value}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <p className="ra-block-empty">No sections were classified for this document.</p>
      )}
      <details className="ra-guidance">
        <summary>Show complete parsed text</summary>
        <pre className="ra-entry ra-block-fallback" style={{ marginTop: 10 }}>
          {input.plain_text || "No parsed text was stored."}
        </pre>
      </details>
    </article>
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
    setTab(next);
  }, [searchParams]);

  const segments: { key: HubTab; label: string; icon: React.ReactNode }[] = [
    { key: "ats", label: "Runs", icon: <AnimatedIcon icon={History} size={16} aria-hidden="true" /> },
    { key: "resumes", label: "Library", icon: <AnimatedIcon icon={FolderOpen} size={16} aria-hidden="true" /> },
    { key: "upload", label: "New upload", icon: <AnimatedIcon icon={CloudUpload} size={16} aria-hidden="true" /> },
  ];

  return (
    <div className="ra-page">
      <header className="ra-masthead">
        <div>
          <h1 className="ra-title">Resume analysis</h1>
          <p className="ra-sub">
            Confirm what was extracted, then audit keyword coverage against each job. Scores use only
            lines your confirmed resume actually contains.
          </p>
        </div>
        <nav className="ra-segnav" aria-label="Resume analysis sections">
          {segments.map((segment) => (
            <button
              key={segment.key}
              type="button"
              className="ra-segnav-item"
              onClick={() => selectTab(segment.key)}
              aria-current={tab === segment.key ? "page" : undefined}
            >
              {segment.icon}
              <span className="ra-seg-label">{segment.label}</span>
            </button>
          ))}
        </nav>
      </header>
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
      <div className="ra-loading">
        <p className="ra-summary-line">Opening your library…</p>
      </div>
    );
  }

  return (
    <section className="ra-section" aria-label="Stored resumes">
      {error ? <ErrorBanner>{error}</ErrorBanner> : null}
      {message ? <StatusNote>{message}</StatusNote> : null}
      {!resumes.length && !error ? (
        <div className="ra-empty">
          <AnimatedIcon icon={FolderOpen} size={30} aria-hidden="true" />
          <h2>No resumes yet</h2>
          <p>Upload a resume once and reuse it for every analysis. Saved files appear here.</p>
          <Link className="button button-primary" href="/resume-analysis?tab=upload">
            New upload
          </Link>
        </div>
      ) : null}
      {!resumes.length && error ? (
        <div className="ra-empty">
          <AnimatedIcon icon={AlertTriangle} size={30} aria-hidden="true" />
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
        </div>
      ) : null}
      {resumes.length ? (
        <>
          <div className="ra-section-head">
            <p className="ra-summary-line">
              <strong>{resumes.length}</strong> stored ·{" "}
              <strong>{resumes.filter((row) => row.is_active).length}</strong> active
            </p>
          </div>
          <div id="resume-library" className="ra-ledger">
            {resumes.map((resume) => (
              <article className="ra-doc" key={resume.id}>
                <span className="ra-doctile" aria-hidden="true">
                  <AnimatedIcon icon={FileText} size={22} strokeWidth={1.9} />
                </span>
                <div className="ra-doc-main">
                  <p className="ra-run-pair">
                    <span className="ra-src">{resume.title}</span>
                  </p>
                  <p className="ra-doc-meta">
                    {resume.latest_version?.original_filename || "File stored"}
                    {resume.latest_version?.version_number != null
                      ? ` · v${resume.latest_version.version_number}`
                      : ""}
                    {" · "}
                    {formatDate(resume.created_at)}
                    {resume.latest_version?.extraction_status
                      ? ` · ${resume.latest_version.extraction_status}`
                      : ""}
                  </p>
                </div>
                <div className="ra-doc-side">
                  <span className="ra-stamp" data-tone={resume.is_active ? "active" : "stored"}>
                    {resume.is_active ? "Active" : "Stored"}
                  </span>
                  <Button
                    variant="secondary"
                    disabled={previewLoading}
                    onClick={() => openPreview(resume.id)}
                  >
                    <AnimatedIcon icon={Eye} size={15} aria-hidden="true" />
                    {previewLoading && previewLoadingId === resume.id ? "Loading…" : "Preview"}
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={deletingId === resume.id}
                    onClick={() => deleteResume(resume.id, resume.title)}
                  >
                    <AnimatedIcon icon={Trash2} size={15} aria-hidden="true" />
                    {deletingId === resume.id ? "Deleting…" : "Delete"}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : null}

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
                <p className="ra-docpanel-kicker">Resume PDF</p>
                <h2>{preview.resume.title}</h2>
                <p className="ra-doc-meta">
                  {preview.version.original_filename || "Stored file"}
                  {preview.version.version_number != null ? ` · v${preview.version.version_number}` : ""}
                </p>
              </div>
              <Button variant="secondary" onClick={closePreview}>
                <AnimatedIcon icon={X} size={15} idle={false} aria-hidden="true" />
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
    </section>
  );
}

function AtsHistoryList() {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  async function loadAnalyses() {
    const rows = await apiRequest<Analysis[]>("/ats-analyses");
    // Defensive: API should return an array; never crash the hub on a bad payload.
    setAnalyses(Array.isArray(rows) ? rows : []);
  }

  useEffect(() => {
    let active = true;
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

  async function deleteAnalyses(ids: string[], askForConfirmation = true) {
    const uniqueIds = [...new Set(ids)].filter((id) => !deletingIds.has(id));
    if (!uniqueIds.length) return;
    const confirmation = uniqueIds.length === 1
      ? "Delete this ATS analysis? This cannot be undone."
      : `Delete ${uniqueIds.length} ATS analyses? This cannot be undone.`;
    if (askForConfirmation && !window.confirm(confirmation)) return;
    const previousRows = analyses.filter((row) => uniqueIds.includes(row.id));
    setDeletingIds((current) => new Set([...current, ...uniqueIds]));
    setError("");
    setMessage("");
    setAnalyses((current) => current.filter((row) => !uniqueIds.includes(row.id)));
    setSelectedIds((current) => {
      const next = new Set(current);
      uniqueIds.forEach((id) => next.delete(id));
      return next;
    });
    setMessage(uniqueIds.length === 1 ? "Analysis removed. Syncing deletion…" : `${uniqueIds.length} analyses removed. Syncing deletions…`);
    try {
      const results = await Promise.allSettled(
        uniqueIds.map((analysisId) => apiRequest(`/ats-analyses/${analysisId}`, { method: "DELETE" })),
      );
      const failedRows = results.flatMap((result, index) =>
        result.status === "rejected" ? [previousRows.find((row) => row.id === uniqueIds[index])] : [],
      ).filter((row): row is Analysis => Boolean(row));
      if (failedRows.length) {
        setAnalyses((current) => {
          const byId = new Map(current.map((row) => [row.id, row]));
          failedRows.forEach((row) => byId.set(row.id, row));
          return analyses.filter((row) => byId.has(row.id)).map((row) => byId.get(row.id) as Analysis);
        });
        setError(`${failedRows.length} deletion${failedRows.length === 1 ? "" : "s"} failed. Affected analyses were restored.`);
      } else {
        setMessage(uniqueIds.length === 1 ? "ATS analysis deleted." : `${uniqueIds.length} ATS analyses deleted.`);
      }
    } catch (reason) {
      setAnalyses((current) => {
        const byId = new Map(current.map((row) => [row.id, row]));
        previousRows.forEach((row) => byId.set(row.id, row));
        return analyses.filter((row) => byId.has(row.id)).map((row) => byId.get(row.id) as Analysis);
      });
      setError((reason as Error).message || "Could not delete ATS analyses.");
    } finally {
      setDeletingIds((current) => {
        const next = new Set(current);
        uniqueIds.forEach((id) => next.delete(id));
        return next;
      });
    }
  }

  if (loading) {
    return (
      <div className="ra-loading">
        <p className="ra-summary-line">Loading past runs…</p>
      </div>
    );
  }

  const completedCount = analyses.filter((item) => item.status === "completed").length;
  const otherCount = analyses.length - completedCount;

  return (
    <section className="ra-section" aria-label="Past ATS runs">
      {error ? <ErrorBanner>{error}</ErrorBanner> : null}
      {message ? <StatusNote>{message}</StatusNote> : null}
      {analyses.length ? (
        <div className="ra-section-head">
          <p className="ra-summary-line" aria-label="ATS analysis summary">
            <strong>{analyses.length}</strong> runs · <strong>{completedCount}</strong> completed ·{" "}
            <strong>{otherCount}</strong> need attention
          </p>
          <div className="ra-head-actions">
            <label className="ra-selectall">
              <input
                type="checkbox"
                checked={analyses.every((analysis) => selectedIds.has(analysis.id))}
                onChange={(event) => setSelectedIds(event.target.checked ? new Set(analyses.map((analysis) => analysis.id)) : new Set())}
                aria-label="Select all ATS analyses"
              />
              Select all
            </label>
            <Button
              variant="destructive"
              disabled={!selectedIds.size || [...selectedIds].some((id) => deletingIds.has(id))}
              onClick={() => void deleteAnalyses([...selectedIds])}
            >
              <AnimatedIcon icon={Trash2} size={15} aria-hidden="true" />
              Delete selected{selectedIds.size ? ` (${selectedIds.size})` : ""}
            </Button>
          </div>
        </div>
      ) : null}
      {!analyses.length && !error ? (
        <div className="ra-empty">
          <AnimatedIcon icon={History} size={30} aria-hidden="true" />
          <h2>No ATS analyses yet</h2>
          <p>Upload a resume and a job description to produce your first audited coverage report.</p>
          <Link className="button button-primary" href="/resume-analysis?tab=upload">
            Start one now
          </Link>
        </div>
      ) : null}
      {!analyses.length && error ? (
        <div className="ra-empty">
          <AnimatedIcon icon={AlertTriangle} size={30} aria-hidden="true" />
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
        </div>
      ) : null}
      {analyses.length ? (
        <div className="ra-ledger">
          {analyses.map((analysis) => {
            const band = scoreBand(analysis.overall_score);
            const stamp = statusStamp(analysis.status);
            return (
              <article className="ra-run" key={analysis.id}>
                <span
                  className="ra-scoretile"
                  data-band={band}
                  aria-hidden="true"
                >
                  {analysis.overall_score == null ? "—" : `${Math.round(Number(analysis.overall_score))}%`}
                  <small>{scoreTileLabel(band)}</small>
                </span>
                <div className="ra-run-main">
                  <p className="ra-run-pair">
                    <span className="ra-src">{resumeLabel(analysis)}</span>
                    <span className="ra-src-arrow" aria-hidden="true">
                      →
                    </span>
                    <span className="ra-src">{jdLabel(analysis)}</span>
                  </p>
                  <p className="ra-run-time">{formatDate(analysis.created_at)}</p>
                </div>
                <div className="ra-run-side">
                  <span className="ra-stamp" data-tone={stamp.tone}>
                    {stamp.label}
                  </span>
                  {analysis.status === "completed" ? (
                    <Link className="button button-secondary" href={`/resume-analysis/report/${analysis.id}`}>
                      Report
                    </Link>
                  ) : null}
                  <label className="ra-selectall">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(analysis.id)}
                      onChange={(event) => setSelectedIds((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(analysis.id);
                        else next.delete(analysis.id);
                        return next;
                      })}
                      aria-label={`Select ATS analysis from ${formatDate(analysis.created_at)}`}
                    />
                    Select
                  </label>
                  <Button
                    variant="destructive"
                    disabled={deletingIds.has(analysis.id)}
                    onClick={() => void deleteAnalyses([analysis.id])}
                  >
                    {deletingIds.has(analysis.id) ? "Syncing…" : "Delete"}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
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
    return <p className="ra-block-empty">No content extracted for this section.</p>;
  }
  return (
    <div className="ra-entries">
      {lines.map((entry, index) => (
        <div key={`${index}-${entry.slice(0, 24)}`} className="ra-entry">
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
    <article className="ra-docpanel">
      <div className="ra-docpanel-head">
        <div className="ra-docpanel-id">
          <span className="ra-intake-icon" aria-hidden="true">
            {isResume ? <AnimatedIcon icon={FileText} size={18} strokeWidth={2.2} /> : <AnimatedIcon icon={BriefcaseBusiness} size={18} strokeWidth={2.2} />}
          </span>
          <div>
            <p className="ra-docpanel-kicker">{isResume ? "Parsed resume" : "Parsed job description"}</p>
            <h2>{title.replace(/^Resume · |^Job description · /, "")}</h2>
          </div>
        </div>
        <span className="ra-stamp" data-tone={status === "confirmed" ? "done" : "wait"}>
          {status}
        </span>
      </div>
      <p className="ra-docpanel-meta">
        <span>{entries.length ? `${entries.length} sections` : "Raw text"}</span>
        <span aria-hidden="true">·</span>
        <span>{contentCount ? `${contentCount} entries` : "Needs review"}</span>
        {editable ? (
          <>
            <span aria-hidden="true">·</span>
            <span>Editable</span>
          </>
        ) : null}
      </p>
      {entries.length ? (
        <div className="ra-blocks">
          {entries.map(([section, lines]) => (
            <section className="ra-block" key={section}>
              <div className="ra-block-head">
                <h3>{section.replaceAll("_", " ")}</h3>
                <span className="ra-block-count">{lines.length}</span>
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
        <pre className="ra-block-empty ra-block-fallback">
          {fallbackText.slice(0, 2500)}
          {fallbackText.length > 2500 ? "…" : ""}
        </pre>
      ) : (
        <p className="ra-block-empty">No extracted content available yet.</p>
      )}
    </article>
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

  const steps = [
    { index: 1, label: "Source files" },
    { index: 2, label: "Review extractions" },
    { index: 3, label: "Report" },
  ];
  const currentStepIndex = step === "upload" ? 1 : 2;

  return (
    <div className="ra-page">
      {!embedded && (
        <header className="ra-masthead">
          <div>
            <h1 className="ra-title">Resume and JD analysis</h1>
            <p className="ra-sub">
              Reuse a stored resume or upload a new one, add the job description, then confirm the
              extraction before anything is scored.
            </p>
          </div>
          <nav className="ra-segnav" aria-label="Back to overview">
            <Link className="ra-segnav-item" href="/resume-analysis">
              <AnimatedIcon icon={History} size={16} aria-hidden="true" />
              <span className="ra-seg-label">Overview</span>
            </Link>
          </nav>
        </header>
      )}

      <nav className="ra-steps" aria-label="Analysis progress">
        {steps.map((item, index) => (
          <span
            key={item.index}
            className={`ra-step ${item.index < currentStepIndex ? "is-done" : ""} ${item.index === currentStepIndex ? "is-current" : ""}`}
            aria-current={item.index === currentStepIndex ? "step" : undefined}
          >
            {index > 0 ? <span className="ra-step-line" aria-hidden="true" /> : null}
            <span className="ra-step-dot" aria-hidden="true">
              {item.index < currentStepIndex ? <AnimatedIcon icon={CheckCircle2} size={14} /> : item.index}
            </span>
            <span className="ra-step-label">{item.label}</span>
          </span>
        ))}
      </nav>

      {error ? <ErrorBanner>{error}</ErrorBanner> : null}
      {busy ? (
        <div className="ra-loading">
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
        </div>
      ) : message ? (
        <StatusNote>{message}</StatusNote>
      ) : null}

      {step === "upload" && !busy && (
        <section className="ra-section" aria-label="Choose source files">
          <div className="ra-intake">
            <article className="ra-intake-card">
              <div className="ra-intake-head">
                <span className="ra-intake-icon" aria-hidden="true">
                  <AnimatedIcon icon={FileText} size={19} strokeWidth={2.1} />
                </span>
                <div>
                  <h2>Resume</h2>
                  <p>Reuse one saved from profile completion, or bring a new PDF/DOCX (max 10 MB).</p>
                </div>
              </div>
              {loadingResumes ? (
                <p className="ra-hint">Loading saved resumes…</p>
              ) : (
                <>
                  <div className="ra-mode" role="group" aria-label="Resume source">
                    <button
                      type="button"
                      className="ra-mode-btn"
                      aria-pressed={resumeSource === "stored"}
                      disabled={!storedResumes.some((row) => row.latest_version?.id)}
                      onClick={() => setResumeSource("stored")}
                    >
                      Saved resume
                    </button>
                    <button
                      type="button"
                      className="ra-mode-btn"
                      aria-pressed={resumeSource === "upload"}
                      onClick={() => setResumeSource("upload")}
                    >
                      Upload new
                    </button>
                  </div>
                  <div className="ra-intake-body">
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
                        <p className="ra-hint">
                          No saved resumes yet. Switch to “Upload new” to add your first file.
                        </p>
                      )
                    ) : (
                      <>
                        <span className="ra-filepick">
                          <span className="ra-filepick-btn" aria-hidden="true">
                            Choose file
                          </span>
                          <span className="ra-filepick-name" aria-hidden="true">
                            {file ? file.name : "PDF or DOCX"}
                          </span>
                          <Input
                            type="file"
                            aria-label="Choose resume file"
                            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                            onChange={(event: any) => setFile(event.target.files?.[0] || null)}
                          />
                        </span>
                        {file ? <p className="ra-hint">Selected: {file.name}</p> : null}
                      </>
                    )}
                  </div>
                </>
              )}
            </article>

            <article className="ra-intake-card">
              <div className="ra-intake-head">
                <span className="ra-intake-icon" aria-hidden="true">
                  <AnimatedIcon icon={BriefcaseBusiness} size={19} strokeWidth={2.1} />
                </span>
                <div>
                  <h2>Job description</h2>
                  <p>Paste the posting text, or upload it as a PDF/DOCX. Saved when you proceed.</p>
                </div>
              </div>
              <div className="ra-mode" role="group" aria-label="Job description format">
                <button
                  type="button"
                  className="ra-mode-btn"
                  aria-pressed={jdMode === "text"}
                  onClick={() => setJdMode("text")}
                >
                  Paste text
                </button>
                <button
                  type="button"
                  className="ra-mode-btn"
                  aria-pressed={jdMode === "file"}
                  onClick={() => setJdMode("file")}
                >
                  Upload file
                </button>
              </div>
              <div className="ra-intake-body">
                {jdMode === "text" ? (
                  <label className="field-label">
                    Job description text
                    <Textarea
                      value={jd}
                      onChange={(event: any) => setJd(event.target.value)}
                      placeholder="Paste the job description…"
                    />
                  </label>
                ) : (
                  <>
                    <span className="ra-filepick">
                      <span className="ra-filepick-btn" aria-hidden="true">
                        Choose file
                      </span>
                      <span className="ra-filepick-name" aria-hidden="true">
                        {jdFile ? jdFile.name : "PDF or DOCX"}
                      </span>
                      <Input
                        type="file"
                        aria-label="Choose job description file"
                        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        onChange={(event: any) => setJdFile(event.target.files?.[0] || null)}
                      />
                    </span>
                    {jdFile ? <p className="ra-hint">Selected: {jdFile.name}</p> : null}
                  </>
                )}
              </div>
            </article>
          </div>

          <div className="ra-ready">
            <ul className="ra-ready-list">
              <li className={`ra-ready-item ${resumeReady ? "is-ok" : "is-wait"}`}>
                <AnimatedIcon icon={CheckCircle2} size={14} aria-hidden="true" />
                Resume {resumeReady ? "ready" : "needed"}
              </li>
              <li className={`ra-ready-item ${jdReady ? "is-ok" : "is-wait"}`}>
                <AnimatedIcon icon={CheckCircle2} size={14} aria-hidden="true" />
                Job description {jdReady ? "ready" : "needed"}
              </li>
            </ul>
            <p className="ra-ready-copy">
              {canProceed
                ? resumeSource === "stored"
                  ? "Proceed will use your saved resume, save the job description, then show both extractions for confirmation."
                  : "Proceed will save both documents, extract their contents, then show them for confirmation."
                : "Add both sources to continue. Scoring waits until you confirm the extracted text."}
            </p>
            <Button disabled={!canProceed || busy || loadingResumes} onClick={proceed}>
              Proceed to review
            </Button>
          </div>
        </section>
      )}

      {step === "review" && resumeVersion && job && !busy && (
        <section className="ra-review" aria-label="Review extracted content">
          <div className="ra-section-head">
            <div>
              <h2 className="ra-section-title">Check the extracted content</h2>
              <p className="ra-sub" style={{ marginTop: 6 }}>
                Your score will use only the confirmed text shown here. Fix anything the parser got
                wrong directly in the resume panel.
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                setStep("upload");
                setReviewed(false);
              }}
            >
              <AnimatedIcon icon={RotateCcw} size={15} aria-hidden="true" />
              Change files
            </Button>
          </div>

          <div className="ra-chips">
            <span className="ra-chip">
              <AnimatedIcon icon={ShieldCheck} size={18} aria-hidden="true" />
              <span>
                <strong>Evidence-first scoring</strong>
                <small>No unsupported experience is added.</small>
              </span>
            </span>
            <span className="ra-chip">
              <AnimatedIcon icon={CheckCircle2} size={18} aria-hidden="true" />
              <span>
                <strong>Two inputs ready</strong>
                <small>Resume and job description are saved.</small>
              </span>
            </span>
          </div>

          <div className="ra-docs">
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

          <div className="ra-confirm">
            <label className="ra-confirm-check">
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(event: any) => setReviewed(event.target.checked)}
              />
              <span>
                <strong>I reviewed both documents</strong>
                <small>I confirm this extracted content can be used for ATS keyword coverage.</small>
              </span>
            </label>
            <Button disabled={busy || !reviewed} onClick={runAnalysis}>
              {busy ? "Calculating…" : "Confirm and calculate ATS score"}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

export function ExtractionReview() {
  return (
    <div className="ra-page">
      <header className="ra-masthead">
        <div>
          <h1 className="ra-title">Review extracted content</h1>
          <p className="ra-sub">
            Upload a resume and job description, then confirm the extraction before scoring.
          </p>
        </div>
      </header>
      <div className="ra-empty">
        <AnimatedIcon icon={CloudUpload} size={30} aria-hidden="true" />
        <h2>Use new upload</h2>
        <p>Extraction review happens inside the upload flow once your files are stored.</p>
        <Link className="button button-primary" href="/resume-analysis?tab=upload">
          Go to new upload
        </Link>
      </div>
    </div>
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
      <div className="ra-page">
        <header className="ra-masthead">
          <div>
            <h1 className="ra-title">Report unavailable</h1>
            <p className="ra-sub">This analysis report could not be loaded.</p>
          </div>
          <nav className="ra-segnav" aria-label="Back to overview">
            <Link className="ra-segnav-item" href="/resume-analysis">
              <AnimatedIcon icon={History} size={16} aria-hidden="true" />
              <span className="ra-seg-label">Overview</span>
            </Link>
          </nav>
        </header>
        <ErrorBanner>{error}</ErrorBanner>
      </div>
    );
  }
  if (!analysis) {
    return (
      <div className="ra-page">
        <div className="ra-loading">
          <BookLoader
            title="Opening your report"
            message="Gathering scores and keyword evidence…"
          />
        </div>
      </div>
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
  const domainGate = analysis.summary?.domain_gate || analysis.score_breakdown?.domain_gate;
  const overallReportStatus = analysis.summary?.report_status || (
    analysis.summary?.inference_provider === "deterministic"
      ? "unavailable"
      : overallInference
        ? "generated"
        : "unavailable"
  );
  const evidenceCounts = {
    found: evidence.filter((item) => item.match_status === "strong_match").length,
    partial: evidence.filter((item) => item.match_status === "partial_match").length,
    missing: evidence.filter((item) => item.match_status === "not_found").length,
  };
  const evidenceTotal = evidenceCounts.found + evidenceCounts.partial + evidenceCounts.missing;
  const distWidths = {
    found: evidenceTotal ? (evidenceCounts.found / evidenceTotal) * 100 : 0,
    partial: evidenceTotal ? (evidenceCounts.partial / evidenceTotal) * 100 : 0,
    missing: evidenceTotal ? (evidenceCounts.missing / evidenceTotal) * 100 : 0,
  };

  const evidenceGroups: {
    key: string;
    title: string;
    statuses: AtsEvidence["match_status"][];
  }[] = [
    { key: "found", title: "Found — exact line quoted", statuses: ["strong_match"] },
    { key: "partial", title: "Partial evidence", statuses: ["partial_match"] },
    { key: "missing", title: "Missing from resume", statuses: ["not_found"] },
    { key: "other", title: "Needs manual verification", statuses: ["unverified", "not_applicable"] },
  ];

  return (
    <div className="ra-page">
      <section className="ra-hero" aria-label="ATS coverage result">
        <div
          className="ra-gauge"
          style={{ "--pct": String(Math.max(0, Math.min(100, Math.round(Number(analysis.overall_score) || 0)))) } as React.CSSProperties}
          role="img"
          aria-label={
            analysis.overall_score == null
              ? "No ATS coverage score recorded"
              : `ATS keyword coverage ${Math.round(Number(analysis.overall_score))}%`
          }
        >
          <span className="ra-gauge-inner">
            <span className="ra-gauge-num">
              {analysis.overall_score == null ? "—" : Math.round(Number(analysis.overall_score))}
              {analysis.overall_score != null ? "%" : ""}
            </span>
            <span className="ra-gauge-cap">coverage</span>
          </span>
        </div>
        <div className="ra-hero-copy">
          <p className="ra-hero-kicker">Audit sheet · {formatDate(analysis.created_at)}</p>
          <h1 className="ra-verdict">{coverageVerdict(analysis.overall_score)}</h1>
          <p className="ra-hero-note">
            Each hit quotes an exact line from your confirmed resume; missing terms quote nothing
            because nothing supported them.
          </p>
          <span className="ra-notechip">
            <AnimatedIcon icon={ShieldCheck} size={13} aria-hidden="true" />
            {analysis.summary?.disclaimer || "Keyword coverage is not a hiring prediction."}
          </span>
          <div className="ra-hero-actions">
            <Link className="button button-primary" href="/resume-analysis?tab=upload">
              New analysis
            </Link>
            <Link className="button button-secondary" href="/resume-analysis">
              Run log
            </Link>
          </div>
        </div>
      </section>

      {domainGate?.decision === "REJECT" ? (
        <ErrorBanner>
          <strong>Not eligible for this role. </strong>
          {domainGate.reason || "The LLM domain gate found a clear mismatch between the resume and job description."}
        </ErrorBanner>
      ) : domainGate?.decision === "UNVERIFIED" ? (
        <p role="status" className="ra-warn">
          <AnimatedIcon icon={AlertTriangle} size={17} aria-hidden="true" />
          <span>
            <strong>Domain match not verified. </strong>
            {domainGate.reason || "The LLM domain gate was unavailable. Treat this score as unverified for domain fit."}
          </span>
        </p>
      ) : null}

      <div className="ra-strip">
        <div className="ra-meta">
          <div className="ra-meta-row">
            <span className="ra-meta-key">Resume used</span>
            <p className="ra-meta-val">{resumeLabel(analysis)}</p>
          </div>
          <div className="ra-meta-row">
            <span className="ra-meta-key">Job description used</span>
            <p className="ra-meta-val">{jdLabel(analysis)}</p>
          </div>
          <div className="ra-meta-row">
            <span className="ra-meta-key">Analyzed</span>
            <p className="ra-meta-val">{formatDate(analysis.created_at)}</p>
          </div>
        </div>
        <div className="ra-dist-panel">
          <p className="ra-summary-line">
            <strong>{missingTerms.length}</strong> missing of <strong>{total || "—"}</strong> scored terms
            {matchedCount != null ? ` · ${matchedCount} matched` : ""}
          </p>
          <div className="ra-dist" aria-hidden="true">
            <span className="ra-dist-found" style={{ width: `${distWidths.found}%` }} />
            <span className="ra-dist-partial" style={{ width: `${distWidths.partial}%` }} />
            <span className="ra-dist-missing" style={{ width: `${distWidths.missing}%` }} />
          </div>
          <ul className="ra-dist-legend">
            <li className="is-found">
              <i aria-hidden="true" />
              Found <b>{evidenceCounts.found}</b>
            </li>
            <li className="is-partial">
              <i aria-hidden="true" />
              Partial <b>{evidenceCounts.partial}</b>
            </li>
            <li className="is-missing">
              <i aria-hidden="true" />
              Missing <b>{evidenceCounts.missing}</b>
            </li>
          </ul>
        </div>
      </div>

      <section className="ra-section" aria-label="Keyword evidence">
        <div className="ra-section-head">
          <h2 className="ra-section-title">Evidence ledger</h2>
          <p className="ra-summary-line">
            {evidence.length
              ? `${evidenceCounts.found} found · ${evidenceCounts.partial} partial · ${evidenceCounts.missing} missing`
              : "No match rows stored"}
          </p>
        </div>
        {evidence.length === 0 ? (
          <p className="ra-gap-none">No match rows were stored for this analysis.</p>
        ) : (
          evidenceGroups
            .map((group) => ({
              group,
              rows: evidence.filter((item) => group.statuses.includes(item.match_status)),
            }))
            .filter(({ rows }) => rows.length > 0)
            .map(({ group, rows }) => (
              <div className="ra-evgroup" key={group.key}>
                <p className="ra-evhead">
                  {group.title} <b>{rows.length}</b>
                </p>
                <div className="ra-evrows">
                  {rows.map((row) => {
                    const found = row.match_status === "strong_match" || row.match_status === "partial_match";
                    return (
                      <article className="ra-evrow" key={row.id} data-status={row.match_status}>
                        <p className="ra-evterm">{row.requirement_text}</p>
                        {found && row.resume_evidence_text ? (
                          <p className="ra-quote">
                            In your resume: <b>“{row.resume_evidence_text}”</b>
                          </p>
                        ) : (
                          <p className="ra-quote">
                            {row.match_status === "not_found"
                              ? "Not found in your confirmed resume."
                              : "No verified quote — check this requirement yourself."}
                          </p>
                        )}
                      </article>
                    );
                  })}
                </div>
              </div>
            ))
        )}
      </section>

      <section className="ra-section" aria-label="Requirement gaps">
        <div className="ra-section-head">
          <h2 className="ra-section-title">Requirement gaps</h2>
        </div>
        <div className="ra-gaps">
          <div className="ra-gapcol">
            <h3>
              Critical / required <span>{criticalMissing.length}</span>
            </h3>
            {criticalMissing.length ? (
              <ul className="ra-gapterms">
                {criticalMissing.map((term) => (
                  <li key={`critical-${term}`} className="ra-gapterm" data-kind="critical">
                    {term}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ra-gap-none">Nothing required is missing.</p>
            )}
          </div>
          <div className="ra-gapcol">
            <h3>
              Preferred <span>{preferredMissing.length}</span>
            </h3>
            {preferredMissing.length ? (
              <ul className="ra-gapterms">
                {preferredMissing.map((term) => (
                  <li key={`preferred-${term}`} className="ra-gapterm" data-kind="preferred">
                    {term}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ra-gap-none">No preferred terms are missing.</p>
            )}
          </div>
          <div className="ra-gapcol">
            <h3>
              Partial evidence <span>{partialTerms.length}</span>
            </h3>
            {partialTerms.length ? (
              <ul className="ra-gapterms">
                {partialTerms.map((term) => (
                  <li key={`partial-${term}`} className="ra-gapterm" data-kind="partial">
                    {term}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ra-gap-none">Every matched term had direct evidence.</p>
            )}
          </div>
        </div>
        <p className="ra-hint">
          Use this report to update your resume outside the app (or re-upload a revised file), then
          run a new analysis against the same job description to re-check keyword coverage.
        </p>
        <div className="ra-hero-actions">
          <Link className="button button-primary" href="/resume-analysis?tab=upload">
            Upload revised resume
          </Link>
          <Link className="button button-secondary" href="/resume-analysis?tab=ats">
            Back to run log
          </Link>
        </div>
      </section>

      <section className="ra-section" aria-label="Improvement report">
        <div className="ra-section-head">
          <h2 className="ra-section-title">LLM improvement report</h2>
          <span className="ra-stamp" data-tone={overallReportStatus === "generated" ? "done" : "stored"}>
            {overallReportStatus === "generated"
              ? `Generated${analysis.summary?.inference_provider ? ` · ${analysis.summary.inference_provider}` : ""}`
              : "Unavailable"}
          </span>
        </div>
        {overallReportStatus === "generated" && overallInference ? (
          <div className="ra-letter">{overallInference}</div>
        ) : (
          <p className="ra-gap-none">
            No narrative is shown because the configured LLM did not return a valid report. The score
            and evidence above remain auditable; this screen will not substitute static prose.
          </p>
        )}
        {overallReportStatus === "generated" && (focusAreas.length > 0 || priorityActions.length > 0 || sectionGuidance.length > 0 || doNotClaim.length > 0) ? (
          <details className="ra-guidance">
            <summary>Open supporting guidance</summary>
            <div className="ra-guidance-grid">
              {focusAreas.length > 0 ? (
                <div className="ra-guidance-col">
                  <h4>Focus areas (from missing keywords)</h4>
                  <ul>
                    {focusAreas.map((area) => (
                      <li key={area}>{area}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {priorityActions.length > 0 ? (
                <div className="ra-guidance-col">
                  <h4>Priority actions</h4>
                  <ul>
                    {priorityActions.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {sectionGuidance.length > 0 ? (
                <div className="ra-guidance-col">
                  <h4>Section guidance</h4>
                  <ul>
                    {sectionGuidance.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {doNotClaim.length > 0 ? (
                <div className="ra-guidance-col">
                  <h4>Evidence safeguards</h4>
                  <ul>
                    {doNotClaim.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </details>
        ) : null}
      </section>

      {analysis.parsed_inputs ? (
        <section className="ra-section" aria-label="Parsed sources">
          <div className="ra-section-head">
            <h2 className="ra-section-title">Parsed sources</h2>
            <p className="ra-summary-line">Exactly what the parser stored for this run</p>
          </div>
          <div className="ra-docs">
            <ParsedInputPanel title="Parsed resume" input={analysis.parsed_inputs?.resume} />
            <ParsedInputPanel title="Parsed job description" input={analysis.parsed_inputs?.job_description} />
          </div>
        </section>
      ) : null}

      <section className="ra-section" aria-label="RAG Career Assistant">
        <RagCareerAssistant
          resumeText={analysis.parsed_inputs?.resume?.plain_text || ""}
          jobDescriptionText={analysis.parsed_inputs?.job_description?.plain_text || ""}
        />
      </section>
    </div>
  );
}
