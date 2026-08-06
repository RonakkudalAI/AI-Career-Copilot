/** Pure label helpers for ATS history / report UI (unit-tested). */

export type AnalysisSourceRefs = {
  resume_version_id?: string | null;
  job_description_id?: string | null;
  resume?: {
    id?: string | null;
    title?: string | null;
    original_filename?: string | null;
    version_number?: number | null;
    unavailable?: boolean | null;
  } | null;
  job_description?: {
    id?: string | null;
    title?: string | null;
    company?: string | null;
    role_title?: string | null;
    input_type?: string | null;
    original_filename?: string | null;
    unavailable?: boolean | null;
  } | null;
};

export function resumeLabel(analysis: AnalysisSourceRefs): string {
  const resume = analysis.resume;
  if (!resume) {
    return analysis.resume_version_id
      ? `Resume version ${String(analysis.resume_version_id).slice(0, 8)}…`
      : "Resume unavailable";
  }
  const file = (resume.original_filename || resume.title || "").trim();
  const version =
    resume.version_number != null && resume.version_number !== undefined
      ? ` · v${resume.version_number}`
      : "";
  if (file) {
    const suffix = resume.unavailable ? " (unavailable)" : "";
    return `${file}${version}${suffix}`;
  }
  if (resume.unavailable) return `Resume unavailable${version}`;
  return `Resume${version}`;
}

export function jdLabel(analysis: AnalysisSourceRefs): string {
  const job = analysis.job_description;
  if (!job) {
    return analysis.job_description_id
      ? `Job description ${String(analysis.job_description_id).slice(0, 8)}…`
      : "Job description unavailable";
  }
  const title = (job.title || job.role_title || "").trim() || "Job description";
  const company = job.company ? ` · ${job.company}` : "";
  const source = job.original_filename
    ? ` · ${job.original_filename}`
    : job.input_type
      ? ` · ${job.input_type}`
      : "";
  const suffix = job.unavailable ? " (unavailable)" : "";
  return `${title}${company}${source}${suffix}`;
}
