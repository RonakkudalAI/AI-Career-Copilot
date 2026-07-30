"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Input, PageHeader, Progress, Textarea } from "@/components/ui/primitives";
import { apiRequest } from "@/lib/api/client";
import { isValidCareerFile } from "@/lib/utils";

type StructuredResume = {
  schema_version?: string;
  sections: Record<string, string[]>;
  unclassified_blocks?: string[];
  warnings?: string[];
  corrections?: Record<string, unknown>;
};
type ResumeVersion = {
  id: string;
  resume_id: string;
  version_number: number;
  source_type: string;
  extraction_status: string;
  structured_content: StructuredResume;
  created_from_version_id?: string | null;
  created_at: string;
};
type Resume = { id: string; title: string; is_active: boolean; created_at: string; versions?: ResumeVersion[] };
type Analysis = {
  id: string;
  status: string;
  overall_score: number | null;
  score_breakdown?: { matched_terms?: string[]; missing_terms?: string[]; total_terms?: number };
  summary?: { method?: string; disclaimer?: string };
  created_at: string;
};
type JobDescription = {
  id: string;
  title: string;
  extraction_status: string;
  structured_content?: StructuredResume;
  raw_text?: string;
};
type AtsEvidence = {
  id: string;
  requirement_text: string;
  resume_evidence_text?: string | null;
  match_status: "strong_match" | "partial_match" | "not_found" | "unverified" | "not_applicable";
  explanation?: string | null;
};
type Capability = {
  nvidia_configured: boolean;
  selected_model: string | null;
  improvement_available: boolean;
  export_formats: string[];
  manual_editing_available: boolean;
};
type Suggestion = {
  id: string;
  run_id: string;
  section_key: string;
  source_block_id: string;
  original_text: string;
  suggested_text: string;
  reason: string;
  evidence_references: string[];
  validation_status: "passed" | "warning" | "stale";
  validation_issues: string[];
  decision: "pending" | "accepted" | "edited" | "rejected";
  candidate_text?: string | null;
};
type Decision = Pick<Suggestion, "decision" | "candidate_text">;
type DecisionHistory = { id: string; before: Decision; after: Decision };
type Comparison = {
  source_version: ResumeVersion;
  target_version: ResumeVersion;
  changes: Array<{ block_id: string; section_key: string; status: string; before: string; after: string }>;
};

export function AnalysisHistory() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([apiRequest<Resume[]>("/resumes"), apiRequest<Analysis[]>("/ats-analyses")])
      .then(([resumeRows, analysisRows]) => {
        setResumes(resumeRows);
        setAnalyses(analysisRows);
      })
      .catch((reason: Error) => setError(reason.message));
  }, []);
  return <>
    <PageHeader eyebrow="Resume intelligence" title="Resume library and analyses" description="Every item below is loaded from your account." action={<Link className="button button-primary" href="/resume-analysis/new">New upload</Link>} />
    {error && <p role="alert" className="field-error">{error}</p>}
    <div className="grid-2">
      <Card><h2>Resumes</h2>{resumes.length ? resumes.map((resume) => <div className="suggestion" key={resume.id}><strong>{resume.title}</strong><span>{resume.is_active ? "Active" : "Stored"}</span><Link href={`/resume-builder/${resume.id}`}>Open builder</Link></div>) : <p>No resumes uploaded.</p>}</Card>
      <Card><h2>ATS analyses</h2>{analyses.length ? analyses.map((analysis) => <div className="suggestion" key={analysis.id}><strong>{analysis.overall_score == null ? "No score" : `${analysis.overall_score}/100`}</strong><span>{analysis.status}</span>{analysis.status === "completed" && <Link href={`/resume-analysis/report/${analysis.id}`}>Open evidence report</Link>}</div>) : <p>No ATS analysis exists yet. Add and confirm a resume and job description to calculate one.</p>}</Card>
    </div>
  </>;
}

export function NewAnalysis() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [jd, setJd] = useState("");
  const [resume, setResume] = useState<Resume | null>(null);
  const [resumeVersion, setResumeVersion] = useState<ResumeVersion | null>(null);
  const [job, setJob] = useState<JobDescription | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([apiRequest<Resume[]>("/resumes"), apiRequest<JobDescription[]>("/job-descriptions")])
      .then(async ([resumeRows, jobRows]) => {
        const latestResume = resumeRows.at(-1) || null;
        const latestJob = jobRows.at(-1) || null;
        const detail = latestResume ? await apiRequest<Resume>(`/resumes/${latestResume.id}`) : null;
        if (!active) return;
        setResume(detail || latestResume);
        setResumeVersion(detail?.versions?.[0] || null);
        setJob(latestJob);
      })
      .catch((reason: Error) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, []);

  async function upload() {
    if (!file || !isValidCareerFile(file)) return setError("Choose a PDF or DOCX no larger than 10 MB.");
    const body = new FormData(); body.set("title", title || file.name); body.set("file", file);
    setBusy(true);
    try {
      const result = await apiRequest<{ resume: Resume; version: ResumeVersion }>("/resumes", { method: "POST", body });
      setResume(result.resume); setResumeVersion(result.version); setReviewed(false);
      setMessage(`Stored ${result.resume.title}. Review both extracted inputs below, then calculate the score.`); setError("");
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  }
  async function addJd() {
    setBusy(true);
    try {
      const result = await apiRequest<JobDescription>("/job-descriptions", { method: "POST", body: JSON.stringify({ title: "Job description", raw_text: jd }) });
      setJob(result); setReviewed(false);
      setMessage("Job description stored. Review both extracted inputs below, then calculate the score."); setError("");
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  }
  async function calculate() {
    if (!resume || !resumeVersion || !job || !reviewed) return;
    setBusy(true); setError(""); setMessage("Confirming evidence and calculating deterministic keyword coverage…");
    try {
      let confirmedVersion = resumeVersion;
      if (confirmedVersion.extraction_status !== "confirmed") {
        confirmedVersion = await apiRequest<ResumeVersion>(`/resume-versions/${confirmedVersion.id}/confirm`, { method: "POST" });
        setResumeVersion(confirmedVersion);
      }
      if (!resume.is_active) {
        const activeResume = await apiRequest<Resume>(`/resumes/${resume.id}/activate`, { method: "POST" });
        setResume(activeResume);
      }
      let confirmedJob = job;
      if (confirmedJob.extraction_status !== "confirmed") {
        confirmedJob = await apiRequest<JobDescription>(`/job-descriptions/${confirmedJob.id}/confirm`, { method: "POST" });
        setJob(confirmedJob);
      }
      const analysis = await apiRequest<Analysis>("/ats-analyses", {
        method: "POST",
        body: JSON.stringify({ resume_version_id: confirmedVersion.id, job_description_id: confirmedJob.id }),
      });
      router.push(`/resume-analysis/report/${analysis.id}`);
    } catch (reason) { setError((reason as Error).message); setMessage(""); } finally { setBusy(false); }
  }
  const resumeSections = resumeVersion?.structured_content?.sections || {};
  const jobSections = job?.structured_content?.sections || {};
  return <>
    <PageHeader eyebrow="Real document ingestion" title="Add resume and job evidence" description="Files are validated, stored privately, parsed deterministically, and marked for your review." />
    <div className="grid-2">
      <Card className="stack"><h2>Resume</h2><label className="field-label">Library title<Input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label className="field-label">PDF or DOCX<Input type="file" accept=".pdf,.docx" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label><Button disabled={busy} onClick={upload}>{busy ? "Working…" : "Upload resume"}</Button></Card>
      <Card className="stack"><h2>Job description</h2><label className="field-label">Paste text<Textarea value={jd} onChange={(event) => setJd(event.target.value)} /></label><Button disabled={busy || !jd.trim()} onClick={addJd}>{busy ? "Working…" : "Store job description"}</Button></Card>
    </div>
    {error && <p role="alert" className="field-error">{error}</p>}{message && <Card><p role="status">{message}</p></Card>}
    {(resumeVersion || job) && <Card className="stack ats-review"><div className="row"><div><p className="eyebrow">Required review</p><h2>Confirm the evidence used for scoring</h2></div><Badge tone={resumeVersion && job ? "success" : "warning"}>{resumeVersion && job ? "Both inputs ready" : "One input missing"}</Badge></div>
      <div className="grid-2">
        <div><h3>Resume · {resume?.title || "Not uploaded"}</h3><p className="muted">Status: {resumeVersion?.extraction_status || "missing"}</p>{Object.keys(resumeSections).length ? <details><summary>View extracted resume</summary>{Object.entries(resumeSections).map(([section, lines]) => <div key={section}><strong>{section.replaceAll("_", " ")}</strong><p>{lines.join(" · ")}</p></div>)}</details> : <p>No extracted resume is available.</p>}</div>
        <div><h3>Job description · {job?.title || "Not stored"}</h3><p className="muted">Status: {job?.extraction_status || "missing"}</p>{Object.keys(jobSections).length ? <details><summary>View extracted job description</summary>{Object.entries(jobSections).map(([section, lines]) => <div key={section}><strong>{section.replaceAll("_", " ")}</strong><p>{lines.join(" · ")}</p></div>)}</details> : <p>No extracted job description is available.</p>}</div>
      </div>
      <label><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} /> I reviewed the extracted resume and job description and confirm they can be used for ATS keyword coverage.</label>
      <Button disabled={busy || !resumeVersion || !job || !reviewed} onClick={calculate}>{busy ? "Calculating…" : "Confirm inputs and calculate ATS score"}</Button>
      <p className="muted">The score measures normalized JD keyword coverage and stores matched and missing evidence. It is not a hiring prediction.</p>
    </Card>}
  </>;
}

export function ExtractionReview() {
  return <><PageHeader eyebrow="Candidate review required" title="Review extracted content" description="Open a specific resume version from the library to edit and confirm its structured extraction." /><Card className="empty-state"><h2>Select a resume version</h2><p>This page never auto-confirms parsed content.</p><Link href="/resume-analysis">Return to library</Link></Card></>;
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
    ]).then(([record, rows]) => { setAnalysis(record); setEvidence(rows); }).catch((reason: Error) => setError(reason.message));
  }, [params.reportId]);
  if (error) return <><PageHeader eyebrow="ATS analysis" title="Report unavailable" description="The persisted report could not be loaded." /><Card><p role="alert" className="field-error">{error}</p></Card></>;
  if (!analysis) return <><PageHeader eyebrow="ATS analysis" title="Loading evidence report" description="Reading the persisted analysis from your workspace…" /></>;
  const matched = evidence.filter((item) => item.match_status === "strong_match");
  const missing = evidence.filter((item) => item.match_status === "not_found");
  return <div className="stack"><PageHeader eyebrow="ATS keyword coverage" title={`${analysis.overall_score ?? 0}/100`} description="A deterministic comparison of confirmed resume text against confirmed job-description terms." action={<Link className="button button-secondary" href="/resume-analysis/new">Run another analysis</Link>} />
    <Card className="stack panel-blue"><Progress value={analysis.overall_score || 0} label="JD keyword coverage" /><p><strong>{matched.length}</strong> matched and <strong>{missing.length}</strong> missing across {evidence.length} scored terms.</p><p>{analysis.summary?.disclaimer || "Coverage evidence is not a hiring prediction."}</p></Card>
    <div className="grid-2"><Card className="stack"><h2>Matched evidence</h2>{matched.length ? matched.map((item) => <div className="suggestion" key={item.id}><strong>{item.requirement_text}</strong><span>{item.resume_evidence_text || "Matched in confirmed resume text"}</span></div>) : <p>No scored JD term was found in the confirmed resume.</p>}</Card>
      <Card className="stack"><h2>Missing terms</h2>{missing.length ? missing.map((item) => <div className="suggestion" key={item.id}><strong>{item.requirement_text}</strong><span>{item.explanation}</span></div>) : <p>No scored JD terms are missing.</p>}</Card></div>
    <Card><p className="muted">Method: {analysis.summary?.method || "Deterministic normalized keyword coverage"}. Matching is exact after normalization, so it remains auditable and does not invent candidate experience.</p></Card>
  </div>;
}

export function ResumeBuilder() {
  const params = useParams<{ resumeId: string }>();
  const resumeId = params.resumeId;
  const [resume, setResume] = useState<Resume | null>(null);
  const [jobs, setJobs] = useState<JobDescription[]>([]);
  const [capability, setCapability] = useState<Capability | null>(null);
  const [versionId, setVersionId] = useState("");
  const [jobId, setJobId] = useState("");
  const [sections, setSections] = useState<string[]>([]);
  const [editor, setEditor] = useState<StructuredResume | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [runId, setRunId] = useState("");
  const [comparisonId, setComparisonId] = useState("");
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [editedText, setEditedText] = useState<Record<string, string>>({});
  const [confirmedEdits, setConfirmedEdits] = useState<Record<string, boolean>>({});
  const [undoStack, setUndoStack] = useState<DecisionHistory[]>([]);
  const [redoStack, setRedoStack] = useState<DecisionHistory[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (preferredVersion?: string) => {
    const [resumeRecord, jobRows, capabilities] = await Promise.all([
      apiRequest<Resume>(`/resumes/${resumeId}`),
      apiRequest<JobDescription[]>("/job-descriptions"),
      apiRequest<Capability>("/resume-improvements/capabilities"),
    ]);
    const confirmed = (resumeRecord.versions || []).filter((version) => version.extraction_status === "confirmed");
    const selected = confirmed.find((version) => version.id === preferredVersion) || confirmed[0];
    setResume(resumeRecord); setJobs(jobRows.filter((job) => job.extraction_status === "confirmed")); setCapability(capabilities);
    if (selected) {
      setVersionId(selected.id); setEditor(structuredClone(selected.structured_content));
      setSections(Object.keys(selected.structured_content.sections || {}).slice(0, 4));
      setComparisonId(confirmed.find((version) => version.id !== selected.id)?.id || "");
    }
  }, [resumeId]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => load()).catch((reason: Error) => {
      if (active) setError(reason.message);
    });
    return () => { active = false; };
  }, [load]);
  const versions = useMemo(() => (resume?.versions || []).filter((version) => version.extraction_status === "confirmed"), [resume]);
  const selectedVersion = versions.find((version) => version.id === versionId);

  function chooseVersion(nextId: string) {
    const version = versions.find((item) => item.id === nextId); setVersionId(nextId); setSuggestions([]); setRunId(""); setComparison(null);
    if (version) { setEditor(structuredClone(version.structured_content)); setSections(Object.keys(version.structured_content.sections || {}).slice(0, 4)); }
  }
  function toggleSection(section: string) { setSections((current) => current.includes(section) ? current.filter((item) => item !== section) : [...current, section].slice(0, 4)); }
  function updateSection(section: string, value: string) {
    setEditor((current) => current ? { ...current, sections: { ...current.sections, [section]: value.split("\n") } } : current);
  }
  async function generate() {
    setBusy(true); setError(""); setStatus("Preparing verified evidence and generating suggestions…");
    try {
      const result = await apiRequest<{ run: { id: string }; suggestions: Suggestion[]; message?: string }>("/resume-improvements", { method: "POST", body: JSON.stringify({ resume_version_id: versionId, job_description_id: jobId || null, ats_analysis_id: null, section_keys: sections }) });
      setRunId(result.run.id); setSuggestions(result.suggestions); setStatus(result.message || `${result.suggestions.length} validated suggestions are ready for review.`);
      setEditedText(Object.fromEntries(result.suggestions.map((item) => [item.id, item.suggested_text])));
    } catch (reason) { setError((reason as Error).message); setStatus(""); } finally { setBusy(false); }
  }
  async function persistDecision(id: string, next: Decision, record = true) {
    const current = suggestions.find((item) => item.id === id); if (!current) return;
    const payload = { decision: next.decision, candidate_text: next.decision === "edited" ? next.candidate_text : null, candidate_confirmed: next.decision === "edited" };
    const updated = await apiRequest<Suggestion>(`/resume-suggestions/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
    setSuggestions((rows) => rows.map((row) => row.id === id ? updated : row));
    if (record) { setUndoStack((items) => [...items, { id, before: { decision: current.decision, candidate_text: current.candidate_text }, after: next }]); setRedoStack([]); }
  }
  async function undo() { const item = undoStack.at(-1); if (!item) return; await persistDecision(item.id, item.before, false); setUndoStack((rows) => rows.slice(0, -1)); setRedoStack((rows) => [...rows, item]); }
  async function redo() { const item = redoStack.at(-1); if (!item) return; await persistDecision(item.id, item.after, false); setRedoStack((rows) => rows.slice(0, -1)); setUndoStack((rows) => [...rows, item]); }
  async function apply() {
    setBusy(true); setError("");
    try { const result = await apiRequest<{ resume_version: ResumeVersion }>(`/resume-improvements/${runId}/apply`, { method: "POST" }); await load(result.resume_version.id); setStatus(`Version ${result.resume_version.version_number} created. The source version was preserved.`); setSuggestions([]); setRunId(""); } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  }
  async function saveManual() {
    if (!editor) return; setBusy(true); setError("");
    try { const version = await apiRequest<ResumeVersion>(`/resume-versions/${versionId}/manual-edit`, { method: "POST", body: JSON.stringify({ structured_content: editor, candidate_confirmed: true }) }); await load(version.id); setStatus(`Candidate-confirmed version ${version.version_number} created.`); } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  }
  async function compare() {
    if (!comparisonId) return; setBusy(true); setError("");
    try { setComparison(await apiRequest<Comparison>(`/resume-comparisons?source_version_id=${comparisonId}&target_version_id=${versionId}`)); } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  }
  async function exportVersion(format: "pdf" | "docx") {
    setBusy(true); setError("");
    try {
      const record = await apiRequest<{ id: string }>(`/resume-versions/${versionId}/exports`, { method: "POST", body: JSON.stringify({ format }) });
      const download = await apiRequest<{ download_url: string; filename: string }>(`/resume-exports/${record.id}/download`);
      const anchor = document.createElement("a"); anchor.href = download.download_url; anchor.download = download.filename; anchor.rel = "noopener"; anchor.click(); setStatus(`${format.toUpperCase()} export created privately.`);
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  }

  if (!resume) return <><PageHeader eyebrow="Resume versioning" title="Resume builder" description="Loading your confirmed resume versions…" />{error && <p role="alert" className="field-error">{error}</p>}</>;
  if (!selectedVersion || !editor) return <><PageHeader eyebrow="Resume versioning" title={resume.title} description="Confirm an extracted resume version before editing or requesting improvements." /><Card className="empty-state"><h2>No confirmed version</h2><p>AI suggestions never use unconfirmed extraction.</p></Card></>;

  return <div className="stack resume-builder">
    <PageHeader eyebrow="Evidence-grounded resume editing" title={resume.title} description="Review every change, preserve the source version, and export only candidate-approved content." />
    {error && <p role="alert" className="field-error">{error}</p>}{status && <p role="status" className="panel">{status}</p>}
    <Card className="stack"><div className="grid-2"><label className="field-label">Confirmed version<select className="field" value={versionId} onChange={(event) => chooseVersion(event.target.value)}>{versions.map((version) => <option key={version.id} value={version.id}>Version {version.version_number} · {version.source_type}</option>)}</select></label><label className="field-label">Optional confirmed job description<select className="field" value={jobId} onChange={(event) => setJobId(event.target.value)}><option value="">No job description</option>{jobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label></div><div className="cluster"><Button variant="secondary" disabled={busy} onClick={() => exportVersion("pdf")}>Export PDF</Button><Button variant="secondary" disabled={busy} onClick={() => exportVersion("docx")}>Export DOCX</Button></div></Card>
    <div className="resume-builder-grid">
      <Card className="stack"><div className="row"><h2>Candidate editor</h2><Badge tone="success">Confirmed source</Badge></div>{Object.entries(editor.sections || {}).map(([section, lines]) => <label className="field-label" key={section}>{section.replaceAll("_", " ")}<Textarea value={lines.join("\n")} onChange={(event) => updateSection(section, event.target.value)} /></label>)}<p className="muted">Saving creates a new candidate-confirmed version. It never mutates version {selectedVersion.version_number}.</p><Button disabled={busy} onClick={saveManual}>Create Manual Version</Button></Card>
      <div className="stack"><Card className="stack"><div className="row"><h2>AI improvements</h2><Badge tone={capability?.nvidia_configured ? "ai" : "warning"}>{capability?.nvidia_configured ? "NVIDIA ready" : "Provider unavailable"}</Badge></div>{capability?.nvidia_configured ? <><fieldset className="section-picker"><legend>Sections, maximum four</legend>{Object.keys(editor.sections || {}).map((section) => <label key={section}><input type="checkbox" checked={sections.includes(section)} onChange={() => toggleSection(section)} /> {section.replaceAll("_", " ")}</label>)}</fieldset><Button disabled={busy || !sections.length} onClick={generate}>{busy ? "Working…" : "Generate grounded suggestions"}</Button></> : <p>AI suggestions are unavailable until the server-only NVIDIA configuration is added. Viewing, manual editing, versioning, comparison, and export remain available.</p>}</Card>
        {suggestions.length > 0 && <Card className="stack"><div className="row"><h2>Validated suggestions</h2><span>{suggestions.filter((item) => item.decision !== "pending").length}/{suggestions.length} reviewed</span></div><div className="cluster"><Button variant="quiet" disabled={!undoStack.length} onClick={undo}>Undo</Button><Button variant="quiet" disabled={!redoStack.length} onClick={redo}>Redo</Button></div>{suggestions.map((suggestion) => <article className="suggestion suggestion-card" key={suggestion.id}><div className="row"><strong>{suggestion.section_key.replaceAll("_", " ")}</strong><Badge tone={suggestion.validation_status === "passed" ? "success" : "warning"}>{suggestion.validation_status}</Badge></div><div className="suggestion-copy"><div><small>Original</small><p>{suggestion.original_text}</p></div><div><small>Suggested</small><p>{suggestion.suggested_text}</p></div></div><p>{suggestion.reason}</p><details><summary>Supporting evidence</summary><ul>{suggestion.evidence_references.map((reference) => <li key={reference}>{reference}</li>)}</ul></details><label className="field-label">Candidate-edited text<Textarea value={editedText[suggestion.id] || ""} onChange={(event) => setEditedText((values) => ({ ...values, [suggestion.id]: event.target.value }))} /></label><label><input type="checkbox" checked={Boolean(confirmedEdits[suggestion.id])} onChange={(event) => setConfirmedEdits((values) => ({ ...values, [suggestion.id]: event.target.checked }))} /> I confirm candidate-edited facts are accurate.</label><div className="cluster"><Button variant="secondary" onClick={() => persistDecision(suggestion.id, { decision: "accepted", candidate_text: null })}>Accept</Button><Button variant="secondary" disabled={!confirmedEdits[suggestion.id] || !editedText[suggestion.id]?.trim()} onClick={() => persistDecision(suggestion.id, { decision: "edited", candidate_text: editedText[suggestion.id] })}>Use my edit</Button><Button variant="danger" onClick={() => persistDecision(suggestion.id, { decision: "rejected", candidate_text: null })}>Reject</Button></div><strong>Decision: {suggestion.decision}</strong></article>)}<Button disabled={busy || suggestions.every((item) => !["accepted", "edited"].includes(item.decision))} onClick={apply}>Create New Version</Button></Card>}
      </div>
    </div>
    <Card className="stack"><h2>Version comparison</h2><div className="grid-2"><label className="field-label">Source version<select className="field" value={comparisonId} onChange={(event) => setComparisonId(event.target.value)}><option value="">Select a version</option>{versions.filter((version) => version.id !== versionId).map((version) => <option key={version.id} value={version.id}>Version {version.version_number}</option>)}</select></label><Button disabled={busy || !comparisonId} onClick={compare}>Compare with current</Button></div>{comparison && <div className="stack">{comparison.changes.map((change) => <article className={`diff-block diff-${change.status}`} key={change.block_id}><div className="row"><strong>{change.section_key}</strong><Badge tone={change.status === "unchanged" ? "info" : "ai"}>{change.status}</Badge></div>{change.status !== "added" && <p><small>Before</small><br />{change.before}</p>}{change.status !== "removed" && <p><small>After</small><br />{change.after}</p>}</article>)}</div>}</Card>
  </div>;
}
