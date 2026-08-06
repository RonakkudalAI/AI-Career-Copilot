
import { Bookmark, X, MapPin, Building2, Briefcase, CheckCircle2 } from "lucide-react";
import { useEffect } from "react";
import type { Job, Recommendation } from "./job-types";
import { Button } from "@/shared/ui/primitives";

export function JobModal({
  job,
  recommendation,
  isSaved,
  onToggleSave,
  onClose,
  onDismiss,
}: {
  job: Job;
  recommendation: Recommendation | undefined;
  isSaved: boolean;
  onToggleSave: () => void;
  onClose: () => void;
  onDismiss: () => void;
}) {
  const publishedDate = job.published_at ? new Date(job.published_at).toLocaleDateString() : null;
  const salaryText =
    job.salary_min && job.salary_max
      ? `$${job.salary_min.toLocaleString()} - $${job.salary_max.toLocaleString()}`
      : job.salary_min
        ? `$${job.salary_min.toLocaleString()}`
        : job.salary_max
          ? `Up to $${job.salary_max.toLocaleString()}`
          : null;

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, []);

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 100 }}>
      <div
        className="modal-panel modal-panel-wide"
        onClick={(e: any) => e.stopPropagation()}
        style={{
          display: "flex",
          flexDirection: "column",
          height: "min(92vh, 850px)",
          maxHeight: "92vh",
          padding: 0,
          overflow: "hidden",
        }}
      >
        <div className="modal-hero">
          <div className="cluster" style={{ justifyContent: "space-between" }}>
            <div>
              <h2 style={{ margin: 0 }}>{job.title}</h2>
              <p className="muted" style={{ margin: "8px 0 0" }}>
                <Building2 size={14} aria-hidden /> {job.company}
                {job.location ? (
                  <>
                    {" · "}
                    <MapPin size={14} aria-hidden /> {job.location}
                  </>
                ) : null}
              </p>
            </div>
            <button type="button" className="button button-secondary" onClick={onClose} aria-label="Close">
              <X size={16} />
            </button>
          </div>
        </div>
        <div style={{ padding: 24, overflow: "auto", flex: 1 }}>
          <div className="cluster" style={{ marginBottom: 16 }}>
            {recommendation ? (
              <span className="badge badge-success">
                <CheckCircle2 size={14} aria-hidden /> {Math.round(recommendation.match_score)}% match
              </span>
            ) : null}
            {job.work_mode ? (
              <span className="badge badge-info">
                <Briefcase size={14} aria-hidden /> {job.work_mode}
              </span>
            ) : null}
            {salaryText ? <span className="badge badge-info">{salaryText}</span> : null}
            {publishedDate ? <span className="badge badge-info">Posted {publishedDate}</span> : null}
          </div>
          <p>{job.description || "No description supplied."}</p>
          {recommendation?.match_breakdown?.missing_requirements?.length ? (
            <div style={{ marginTop: 16 }}>
              <h3>Gaps vs your resume</h3>
              <ul>
                {recommendation.match_breakdown.missing_requirements.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <div className="cluster" style={{ padding: 16, borderTop: "1px solid var(--border)" }}>
          <Button onClick={onToggleSave}>
            <Bookmark size={16} aria-hidden /> {isSaved ? "Unsave" : "Save"}
          </Button>
          <Button variant="secondary" onClick={onDismiss}>
            Dismiss
          </Button>
          {job.application_url ? (
            <a className="button button-primary" href={job.application_url} target="_blank" rel="noreferrer">
              Apply
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
