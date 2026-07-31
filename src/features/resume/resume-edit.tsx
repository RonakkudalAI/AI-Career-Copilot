"use client";

/**
 * Post-ATS resume editor — edits the *existing* resume (in place).
 *
 * Resume-Matcher-style UX:
 *   • Entry-level section forms (bullets/skills) on the left
 *   • Live paper preview on the right (same content only — no invented fields)
 *   • Missing ATS keywords added only when the candidate clicks (truth-gated)
 *   • Evidence-checked AI suggestions applied onto the same resume version
 *
 * Default save = apply_mode "in_place" (same resume_id + same version id).
 * Never creates a new resume record.
 */

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Badge, Button, Card, Input, PageHeader, Textarea } from "@/components/ui/primitives";
import { apiRequest } from "@/lib/api/client";

type StructuredContent = {
  schema_version?: string;
  sections?: Record<string, string[]>;
  unclassified_blocks?: string[];
  warnings?: string[];
};

type Analysis = {
  id: string;
  overall_score?: number | null;
  resume_version_id?: string;
  job_description_id?: string;
  summary?: {
    missing_terms?: string[];
    overall_inference?: string;
    missing?: number;
    matched?: number;
    total?: number;
  };
  score_breakdown?: { missing_terms?: string[] };
  resume?: { id?: string; title?: string } | null;
  job_description?: { id?: string; title?: string; role_title?: string | null } | null;
};

type ResumeVersion = {
  id: string;
  resume_id: string;
  version_number: number;
  structured_content?: StructuredContent;
  extraction_status?: string;
  plain_text?: string;
  original_filename?: string;
  change_metadata?: Record<string, unknown>;
};

type Suggestion = {
  id: string;
  section_key: string;
  original_text: string;
  suggested_text: string;
  reason?: string;
  decision?: string;
  candidate_text?: string | null;
};

type Capabilities = {
  improvement_available?: boolean;
  export_formats?: string[];
  nvidia_configured?: boolean;
  groq_configured?: boolean;
  agent_count?: number;
  agents?: Array<{
    id: string;
    name: string;
    ready?: boolean;
    configured?: boolean;
    provider?: string;
    model?: string | null;
  }>;
};

/** Preferred display order; any extra keys from the existing resume are appended. */
const SECTION_ORDER = [
  "summary",
  "skills",
  "experience",
  "projects",
  "education",
  "certifications",
  "languages",
] as const;

type EntriesState = Record<string, string[]>;

function structuredToEntries(structured?: StructuredContent): EntriesState {
  const sections = structured?.sections || {};
  const out: EntriesState = {};
  // Always expose core sections so missing ones can be filled from ATS gaps.
  const ordered = Array.from(new Set<string>([...SECTION_ORDER, ...Object.keys(sections)]));
  for (const key of ordered) {
    const lines = sections[key];
    out[key] = Array.isArray(lines) ? lines.map(String) : [];
  }
  return out;
}

function entriesToStructured(
  source: StructuredContent | undefined,
  entries: EntriesState,
  headerLines: string[],
): StructuredContent {
  // Start from source so sections the editor never opened stay present.
  const sections: Record<string, string[]> = { ...(source?.sections || {}) };
  for (const [key, lines] of Object.entries(entries)) {
    // Always send editor-managed keys (even []) so the backend can clear a section
    // intentionally without treating omission as "keep original".
    sections[key] = lines.map((line) => line.trim()).filter(Boolean);
  }
  return {
    schema_version: source?.schema_version || "resume-extraction-v1",
    sections,
    unclassified_blocks: headerLines.map((l) => l.trim()).filter(Boolean),
    warnings: source?.warnings || [],
  };
}

function entriesEqual(a: EntriesState, b: EntriesState): boolean {
  const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)]));
  return keys.every((key) => {
    const left = a[key] || [];
    const right = b[key] || [];
    if (left.length !== right.length) return false;
    return left.every((value, i) => value === right[i]);
  });
}

function highlightKeywords(text: string, terms: string[]): ReactNode {
  if (!text) return text;
  const usable = terms.map((t) => t.trim()).filter((t) => t.length >= 2);
  if (!usable.length) return text;
  const escaped = usable.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  return text.split(re).map((part, index) => {
    const hit = usable.some((term) => term.toLowerCase() === part.toLowerCase());
    return hit ? (
      <mark key={`${part}-${index}`} className="keyword-hit">
        {part}
      </mark>
    ) : (
      <Fragment key={`${part}-${index}`}>{part}</Fragment>
    );
  });
}

function LiveResumePaper({
  title,
  filename,
  headerLines,
  entries,
  highlightTerms,
}: {
  title?: string;
  filename?: string;
  headerLines: string[];
  entries: EntriesState;
  highlightTerms: string[];
}) {
  const sectionKeys = Array.from(
    new Set<string>([...SECTION_ORDER, ...Object.keys(entries)]),
  ).filter((key) => (entries[key] || []).some((line) => line.trim()));

  return (
    <article className="resume-paper" aria-label="Live preview of your existing resume">
      <p className="eyebrow" style={{ margin: "0 0 4px" }}>
        Your existing resume (live)
      </p>
      <h2 style={{ margin: "0 0 4px", fontSize: "1.25rem" }}>{title || "Resume"}</h2>
      {filename ? (
        <p className="muted" style={{ margin: "0 0 14px", fontSize: "var(--text-xs)" }}>
          {filename}
        </p>
      ) : null}
      {headerLines.filter(Boolean).length ? (
        <section className="resume-paper-section">
          {headerLines.filter(Boolean).map((line, i) => (
            <p key={`h-${i}`} style={{ margin: "0 0 4px", fontWeight: i === 0 ? 700 : 400 }}>
              {highlightKeywords(line, highlightTerms)}
            </p>
          ))}
        </section>
      ) : null}
      {!sectionKeys.length ? (
        <p className="muted" style={{ margin: 0 }}>
          Entries from your stored resume appear here as you edit them.
        </p>
      ) : (
        sectionKeys.map((key) => {
          const lines = (entries[key] || []).filter((l) => l.trim());
          return (
            <section className="resume-paper-section" key={key}>
              <h3>{key.replaceAll("_", " ")}</h3>
              {key === "skills" ? (
                <p style={{ margin: 0 }}>{highlightKeywords(lines.join(" · "), highlightTerms)}</p>
              ) : key === "summary" ? (
                lines.map((line, i) => (
                  <p key={`${key}-${i}`}>{highlightKeywords(line, highlightTerms)}</p>
                ))
              ) : (
                <ul>
                  {lines.map((line, i) => (
                    <li key={`${key}-${i}`}>{highlightKeywords(line, highlightTerms)}</li>
                  ))}
                </ul>
              )}
            </section>
          );
        })
      )}
    </article>
  );
}

export function AtsResumeEdit() {
  const params = useParams<{ reportId: string }>();
  const router = useRouter();
  const reportId = params.reportId;

  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [version, setVersion] = useState<ResumeVersion | null>(null);
  const [entries, setEntries] = useState<EntriesState>({});
  const [savedEntries, setSavedEntries] = useState<EntriesState>({});
  const [headerLines, setHeaderLines] = useState<string[]>([]);
  const [savedHeader, setSavedHeader] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [sectionPick, setSectionPick] = useState<string[]>(["skills", "experience", "summary"]);
  const [editDrafts, setEditDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [skillInput, setSkillInput] = useState("");

  const missingTerms = useMemo(() => {
    const fromSummary = analysis?.summary?.missing_terms || [];
    const fromBreakdown = analysis?.score_breakdown?.missing_terms || [];
    return (fromSummary.length ? fromSummary : fromBreakdown).map(String);
  }, [analysis]);

  const isDirty = useMemo(() => {
    if (!entriesEqual(entries, savedEntries)) return true;
    if (headerLines.length !== savedHeader.length) return true;
    return headerLines.some((line, i) => line !== savedHeader[i]);
  }, [entries, savedEntries, headerLines, savedHeader]);

  const exportFormats = capabilities?.export_formats?.length
    ? capabilities.export_formats
    : ["pdf", "docx"];

  const sectionKeys = useMemo(
    () => Array.from(new Set<string>([...SECTION_ORDER, ...Object.keys(entries)])),
    [entries],
  );

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const record = await apiRequest<Analysis>(`/ats-analyses/${reportId}`, { signal });
      if (signal?.aborted) return;
      setAnalysis(record);
      if (!record.resume_version_id) {
        throw new Error("This analysis is missing a resume version.");
      }
      const ver = await apiRequest<ResumeVersion>(`/resume-versions/${record.resume_version_id}`, { signal });
      if (signal?.aborted) return;
      setVersion(ver);
      const next = structuredToEntries(ver.structured_content);
      setEntries(next);
      setSavedEntries(next);
      const header = (ver.structured_content?.unclassified_blocks || []).map(String);
      setHeaderLines(header);
      setSavedHeader(header);
      try {
        const caps = await apiRequest<Capabilities>("/resume-improvements/capabilities", { signal });
        if (signal?.aborted) return;
        setCapabilities(caps);
      } catch {
        if (!signal?.aborted) {
          setCapabilities({ improvement_available: false, export_formats: ["pdf", "docx"] });
        }
      }
    } catch (e) {
      if (!signal?.aborted) setError((e as Error).message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => void load(controller.signal));
    return () => controller.abort();
  }, [load]);

  function setEntry(section: string, index: number, value: string) {
    setEntries((current) => {
      const lines = [...(current[section] || [])];
      lines[index] = value;
      return { ...current, [section]: lines };
    });
  }

  function addEntry(section: string) {
    setEntries((current) => ({
      ...current,
      [section]: [...(current[section] || []), ""],
    }));
  }

  function removeEntry(section: string, index: number) {
    setEntries((current) => {
      const lines = [...(current[section] || [])];
      lines.splice(index, 1);
      return { ...current, [section]: lines };
    });
  }

  function addSkill(term: string) {
    const token = term.trim();
    if (!token) return;
    setEntries((current) => {
      const skills = [...(current.skills || [])];
      const flat = skills
        .flatMap((row) => row.split(/[,;|/]/))
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      if (flat.includes(token.toLowerCase())) return current;
      // Prefer one skill per line (Resume-Matcher skills list style).
      return { ...current, skills: [...skills, token] };
    });
    setMessage(`Added “${token}” to your existing Skills section. Keep only if true for you.`);
    setSkillInput("");
  }

  function toggleSectionPick(key: string) {
    setSectionPick((current) => {
      if (current.includes(key)) return current.filter((item) => item !== key);
      if (current.length >= 4) return current;
      return [...current, key];
    });
  }

  async function saveExistingResume(): Promise<ResumeVersion | null> {
    if (!version) return null;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const structured = entriesToStructured(version.structured_content, entries, headerLines);
      const saved = await apiRequest<ResumeVersion>(`/resume-versions/${version.id}/manual-edit`, {
        method: "POST",
        body: JSON.stringify({
          structured_content: structured,
          candidate_confirmed: true,
          apply_mode: "in_place",
        }),
      });
      setVersion(saved);
      const next = structuredToEntries(saved.structured_content);
      setEntries(next);
      setSavedEntries(next);
      const header = (saved.structured_content?.unclassified_blocks || []).map(String);
      setHeaderLines(header);
      setSavedHeader(header);
      setMessage(
        `Updated your existing resume “${analysis?.resume?.title || "resume"}” (v${saved.version_number}) in place. No new resume was created.`,
      );
      return saved;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function generateAiSuggestions() {
    if (!version || !analysis) return;
    if (!sectionPick.length) {
      setError("Select 1–4 sections for AI suggestions.");
      return;
    }
    if (isDirty) {
      setError("Save your changes to the existing resume before generating AI suggestions.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await apiRequest<{
        run: { id: string };
        suggestions: Suggestion[];
        message?: string;
      }>("/resume-improvements", {
        method: "POST",
        body: JSON.stringify({
          resume_version_id: version.id,
          job_description_id: analysis.job_description_id || null,
          ats_analysis_id: analysis.id,
          section_keys: sectionPick,
        }),
      });
      setRunId(result.run.id);
      setSuggestions(result.suggestions || []);
      setEditDrafts({});
      setMessage(
        result.suggestions?.length
          ? `Generated ${result.suggestions.length} evidence-checked suggestion(s) for this resume.`
          : result.message || "No safe AI suggestions were generated from the resume evidence.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function decide(suggestionId: string, decision: "accepted" | "rejected") {
    setBusy(true);
    setError("");
    try {
      const updated = await apiRequest<Suggestion>(`/resume-suggestions/${suggestionId}`, {
        method: "PATCH",
        body: JSON.stringify({ decision }),
      });
      setSuggestions((rows) => rows.map((row) => (row.id === suggestionId ? { ...row, ...updated } : row)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveEditedSuggestion(suggestion: Suggestion) {
    const text = (editDrafts[suggestion.id] ?? suggestion.suggested_text).trim();
    if (!text) {
      setError("Edited suggestion text cannot be empty.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const updated = await apiRequest<Suggestion>(`/resume-suggestions/${suggestion.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          decision: "edited",
          candidate_text: text,
          candidate_confirmed: true,
        }),
      });
      setSuggestions((rows) => rows.map((row) => (row.id === suggestion.id ? { ...row, ...updated } : row)));
      setMessage("Suggestion marked as your truth-confirmed edit.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function applyAccepted() {
    if (!runId) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await apiRequest<{ resume_version: ResumeVersion; apply_mode?: string }>(
        `/resume-improvements/${runId}/apply`,
        {
          method: "POST",
          body: JSON.stringify({ apply_mode: "in_place" }),
        },
      );
      const applied = result.resume_version;
      setVersion(applied);
      const next = structuredToEntries(applied.structured_content);
      setEntries(next);
      setSavedEntries(next);
      const header = (applied.structured_content?.unclassified_blocks || []).map(String);
      setHeaderLines(header);
      setSavedHeader(header);
      setMessage(
        `Applied suggestions onto your existing resume (v${applied.version_number}). Same resume — not a new one.`,
      );
      setSuggestions([]);
      setRunId(null);
      setEditDrafts({});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function exportVersion(format: "pdf" | "docx") {
    if (!version) return;
    if (isDirty) {
      setError("Save changes to your existing resume before exporting.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const created = await apiRequest<{ id: string }>(`/resume-versions/${version.id}/exports`, {
        method: "POST",
        body: JSON.stringify({ format }),
      });
      const download = await apiRequest<{ download_url: string; filename?: string }>(
        `/resume-exports/${created.id}/download`,
      );
      if (download.download_url) {
        window.open(download.download_url, "_blank", "noopener,noreferrer");
        setMessage(`Export ready: ${download.filename || format.toUpperCase()}.`);
      } else {
        setError("Export was created but no download link was returned.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function rescore(currentVersion?: ResumeVersion | null) {
    const ver = currentVersion || version;
    if (!ver || !analysis?.job_description_id) {
      setError("Need your existing resume and job description to re-score.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (ver.extraction_status !== "confirmed") {
        await apiRequest(`/resume-versions/${ver.id}/confirm`, { method: "POST" });
      }
      const created = await apiRequest<{ id: string }>("/ats-analyses", {
        method: "POST",
        body: JSON.stringify({
          resume_version_id: ver.id,
          job_description_id: analysis.job_description_id,
        }),
      });
      setMessage("New ATS analysis ready for this resume.");
      router.push(`/resume-analysis/report/${created.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveAndRescore() {
    if (!version || !analysis?.job_description_id) {
      setError("Need your existing resume and job description to re-score.");
      return;
    }
    if (isDirty) {
      const saved = await saveExistingResume();
      if (!saved) return;
      await rescore(saved);
      return;
    }
    await rescore(version);
  }

  if (loading) {
    return (
      <PageHeader
        eyebrow="Edit existing resume"
        title="Loading your resume…"
        description="Loading the resume used in this ATS analysis."
      />
    );
  }

  if (error && !analysis) {
    return (
      <>
        <PageHeader eyebrow="Edit existing resume" title="Editor unavailable" description={error} />
        <Card>
          <Link className="button button-secondary" href={`/resume-analysis/report/${reportId}`}>
            Back to report
          </Link>
        </Card>
      </>
    );
  }

  const acceptedCount = suggestions.filter(
    (s) => s.decision === "accepted" || s.decision === "edited",
  ).length;
  const presentSkills = (entries.skills || [])
    .flatMap((row) => row.split(/[,;|/]/))
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  return (
    <div className="stack resume-builder">
      <PageHeader
        eyebrow="Edit existing resume"
        title={analysis?.resume?.title || "Your resume"}
        description="You are editing the same resume used for this ATS score. Changes save in place — no new resume is created. Add only true missing keywords and accept AI changes that match your evidence."
        action={
          <Link className="button button-secondary" href={`/resume-analysis/report/${reportId}`}>
            Back to report
          </Link>
        }
      />

      {error ? (
        <p role="alert" className="field-error">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" style={{ margin: 0 }}>
          {message}
        </p>
      ) : null}

      <Card className="stack panel-blue">
        <p style={{ margin: 0 }}>
          <strong>ATS score:</strong> {analysis?.overall_score ?? "—"}/100 · <strong>File:</strong>{" "}
          {version?.original_filename || analysis?.resume?.title || "Stored resume"} ·{" "}
          <strong>Version:</strong> v{version?.version_number ?? "—"} · <strong>JD:</strong>{" "}
          {analysis?.job_description?.role_title || analysis?.job_description?.title || "Job"}
        </p>
        <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
          Mode: edit existing resume in place
          {isDirty ? " · unsaved changes on this resume" : " · saved"}
        </p>
        <div className="cluster">
          <Button disabled={busy || !isDirty} onClick={() => void saveExistingResume()}>
            {busy ? "Saving…" : "Save changes to this resume"}
          </Button>
          <Button
            variant="secondary"
            disabled={busy || !analysis?.job_description_id}
            onClick={() => void saveAndRescore()}
          >
            {isDirty ? "Save & re-score ATS" : "Re-run ATS on this resume"}
          </Button>
          {exportFormats.includes("pdf") ? (
            <Button variant="secondary" disabled={busy || !version} onClick={() => void exportVersion("pdf")}>
              Export PDF
            </Button>
          ) : null}
          {exportFormats.includes("docx") ? (
            <Button variant="secondary" disabled={busy || !version} onClick={() => void exportVersion("docx")}>
              Export DOCX
            </Button>
          ) : null}
        </div>
      </Card>

      <Card className="stack">
        <h2 style={{ margin: 0 }}>Missing from ATS — add only if true</h2>
        <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
          These keywords are missing vs the job description. Click to add into your existing Skills list. Do not add
          skills you do not have.
        </p>
        {missingTerms.length ? (
          <div className="cluster" style={{ gap: 8 }}>
            {missingTerms.map((term) => {
              const already = presentSkills.includes(term.trim().toLowerCase());
              return (
                <button
                  key={term}
                  type="button"
                  className={`badge ${already ? "badge-success" : "badge-warning"}`}
                  style={{ cursor: already ? "default" : "pointer", border: "none" }}
                  disabled={already}
                  onClick={() => addSkill(term)}
                  title={already ? "Already on this resume" : "Add to Skills on this resume"}
                >
                  {already ? `✓ ${term}` : `+ ${term}`}
                </button>
              );
            })}
          </div>
        ) : (
          <p style={{ margin: 0 }}>No missing keywords on this analysis.</p>
        )}
        {analysis?.summary?.overall_inference ? (
          <div className="suggestion" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
            {analysis.summary.overall_inference}
          </div>
        ) : null}
      </Card>

      <div className="resume-builder-grid">
        <div className="stack">
          <Card className="stack">
            <h2 style={{ margin: 0 }}>Header (from your resume)</h2>
            <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
              Name / contact lines stored with this resume. Edit carefully — do not invent contact details.
            </p>
            {headerLines.length ? (
              headerLines.map((line, index) => (
                <div className="cluster" key={`header-${index}`} style={{ alignItems: "flex-start" }}>
                  <Input
                    value={line}
                    onChange={(e) => {
                      const next = [...headerLines];
                      next[index] = e.target.value;
                      setHeaderLines(next);
                    }}
                    aria-label={`Header line ${index + 1}`}
                  />
                  <Button
                    variant="quiet"
                    type="button"
                    onClick={() => setHeaderLines((rows) => rows.filter((_, i) => i !== index))}
                  >
                    Remove
                  </Button>
                </div>
              ))
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                No header lines were stored for this resume.
              </p>
            )}
            <Button variant="secondary" type="button" onClick={() => setHeaderLines((rows) => [...rows, ""])}>
              Add header line
            </Button>
          </Card>

          {sectionKeys.map((section) => {
            const lines = entries[section] || [];
            const isSkills = section === "skills";
            return (
              <Card className="stack" key={section}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <h2 style={{ margin: 0, textTransform: "capitalize" }}>
                    {section.replaceAll("_", " ")}
                  </h2>
                  <Button variant="secondary" type="button" onClick={() => addEntry(section)}>
                    {isSkills ? "Add skill" : "Add entry"}
                  </Button>
                </div>
                {isSkills ? (
                  <>
                    <div className="cluster" style={{ gap: 8 }}>
                      {lines.map((skill, index) => (
                        <span key={`${skill}-${index}`} className="badge badge-info">
                          {skill || "(empty)"}{" "}
                          <button
                            type="button"
                            style={{ border: 0, background: "transparent", cursor: "pointer", marginLeft: 4 }}
                            onClick={() => removeEntry("skills", index)}
                            aria-label={`Remove ${skill}`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="cluster">
                      <Input
                        value={skillInput}
                        placeholder="Add a skill that is true for you"
                        onChange={(e) => setSkillInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addSkill(skillInput);
                          }
                        }}
                      />
                      <Button type="button" variant="secondary" onClick={() => addSkill(skillInput)}>
                        Add
                      </Button>
                    </div>
                  </>
                ) : (
                  lines.map((line, index) => (
                    <div className="stack" key={`${section}-${index}`} style={{ gap: 6 }}>
                      <Textarea
                        value={line}
                        onChange={(e) => setEntry(section, index, e.target.value)}
                        rows={section === "summary" ? 4 : 3}
                        aria-label={`${section} entry ${index + 1}`}
                      />
                      <Button
                        variant="quiet"
                        type="button"
                        onClick={() => removeEntry(section, index)}
                      >
                        Remove entry
                      </Button>
                    </div>
                  ))
                )}
                {!lines.length ? (
                  <p className="muted" style={{ margin: 0 }}>
                    No entries yet in this section of your resume.
                  </p>
                ) : null}
              </Card>
            );
          })}

          <div className="cluster">
            <Button disabled={busy || !isDirty} onClick={() => void saveExistingResume()}>
              {busy ? "Saving…" : "Save changes to this resume"}
            </Button>
            <Button
              variant="secondary"
              disabled={busy || !analysis?.job_description_id}
              onClick={() => void saveAndRescore()}
            >
              {isDirty ? "Save & re-score ATS" : "Re-run ATS on this resume"}
            </Button>
          </div>
        </div>

        <LiveResumePaper
          title={analysis?.resume?.title}
          filename={version?.original_filename}
          headerLines={headerLines}
          entries={entries}
          highlightTerms={missingTerms}
        />
      </div>

      <Card className="stack">
        <h2 style={{ margin: 0 }}>AI suggestions for this resume (evidence-checked)</h2>
        <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
          Suggestions only rewrite text that already exists on this resume. Applied changes update this same resume.
          {!capabilities?.improvement_available
            ? " AI suggestions are unavailable right now — you can still edit manually, export, and re-score."
            : " AI suggestions are available for this resume."}
        </p>

        <fieldset className="section-picker">
          <legend>Sections (max 4)</legend>
          {sectionKeys.map((key) => (
            <label key={key} className="row" style={{ gap: 6, justifyContent: "flex-start" }}>
              <input
                type="checkbox"
                checked={sectionPick.includes(key)}
                onChange={() => toggleSectionPick(key)}
              />
              <span>{key}</span>
            </label>
          ))}
        </fieldset>
        <div className="cluster">
          <Button
            disabled={busy || !capabilities?.improvement_available || !sectionPick.length || isDirty}
            onClick={() => void generateAiSuggestions()}
          >
            {busy ? "Working…" : "Generate AI suggestions"}
          </Button>
          <Button
            variant="secondary"
            disabled={busy || !runId || acceptedCount === 0}
            onClick={() => void applyAccepted()}
          >
            Apply to this resume ({acceptedCount})
          </Button>
        </div>
        {suggestions.map((item) => {
          const draft = editDrafts[item.id] ?? item.candidate_text ?? item.suggested_text;
          return (
            <div className="suggestion suggestion-card stack" key={item.id} style={{ gap: 8 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <Badge tone="info">{item.section_key}</Badge>
                <span className="mono">{item.decision || "pending"}</span>
              </div>
              <div className="suggestion-copy">
                <div>
                  <small>On your resume now</small>
                  <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{item.original_text}</p>
                </div>
                <div>
                  <small>Suggested change</small>
                  <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{item.suggested_text}</p>
                </div>
              </div>
              {item.reason ? (
                <p className="muted" style={{ margin: 0 }}>
                  {item.reason}
                </p>
              ) : null}
              <label className="field-label">
                Your edit (optional)
                <Textarea
                  value={draft}
                  onChange={(e) =>
                    setEditDrafts((current) => ({ ...current, [item.id]: e.target.value }))
                  }
                  rows={3}
                />
              </label>
              <div className="cluster">
                <Button
                  variant="secondary"
                  disabled={busy || item.decision === "accepted"}
                  onClick={() => void decide(item.id, "accepted")}
                >
                  Accept
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => void saveEditedSuggestion(item)}>
                  Save my edit
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy || item.decision === "rejected"}
                  onClick={() => void decide(item.id, "rejected")}
                >
                  Reject
                </Button>
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
