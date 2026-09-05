import {
  Bookmark,
  X,
  MapPin,
  Building2,
  Briefcase,
  CheckCircle2,
  Send,
  ThumbsDown,
  ExternalLink,
} from "lucide-react";
import { useEffect } from "react";
import type { Job, Recommendation, SavedJobStatus } from "./job-types";
import { statusLabel, statusTone } from "./job-types";
import { Button } from "@/shared/ui/primitives";
import { AnimatedIcon } from "@/components/ui/animated-icon";

export function JobModal({
  job,
  recommendation,
  status,
  onToggleSave,
  onMarkApplied,
  onMarkRejected,
  onClose,
  onDismiss,
}: {
  job: Job;
  recommendation: Recommendation | undefined;
  status?: SavedJobStatus | string | null;
  onToggleSave: () => void;
  onMarkApplied: () => void;
  onMarkRejected: () => void;
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

  const normalized = (status || "").toLowerCase();
  const isSaved = Boolean(status) && normalized !== "dismissed";
  const isApplied = normalized === "applied" || normalized === "interviewing" || normalized === "offer";
  const isRejected = normalized === "rejected";

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, []);

  function handleApplyClick() {
    // Track the application when the candidate opens the external apply link.
    if (!isApplied) onMarkApplied();
  }

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 100 }}>
      <div
        className="modal-panel modal-panel-wide"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
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
                <AnimatedIcon icon={Building2} size={14} aria-hidden /> {job.company}
                {job.location ? (
                  <>
                    {" · "}
                    <AnimatedIcon icon={MapPin} size={14} aria-hidden /> {job.location}
                  </>
                ) : null}
              </p>
            </div>
            <button type="button" className="button button-secondary" onClick={onClose} aria-label="Close">
              <AnimatedIcon icon={X} size={16} idle={false} />
            </button>
          </div>
        </div>
        <div style={{ padding: 24, overflow: "auto", flex: 1 }}>
          <div className="cluster" style={{ marginBottom: 16 }}>
            {recommendation ? (
              <span className="badge badge-success">
                <AnimatedIcon icon={CheckCircle2} size={14} aria-hidden /> {Math.round(recommendation.match_score)}% match
              </span>
            ) : null}
            {isSaved ? (
              <span className="status-chip" data-tone={statusTone(status)}>
                {statusLabel(status)}
              </span>
            ) : null}
            {job.work_mode ? (
              <span className="badge badge-info">
                <AnimatedIcon icon={Briefcase} size={14} aria-hidden /> {job.work_mode}
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
        <div className="cluster" style={{ padding: 16, borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
          <Button onClick={onToggleSave} variant="secondary">
            <AnimatedIcon icon={Bookmark} size={16} aria-hidden /> {isSaved && !isApplied && !isRejected ? "Unsave" : "Save"}
          </Button>
          <Button
            variant={isApplied ? "secondary" : "primary"}
            onClick={onMarkApplied}
            disabled={isApplied}
            aria-label={isApplied ? "Already marked applied" : "Mark as applied"}
          >
            <AnimatedIcon icon={Send} size={16} aria-hidden /> {isApplied ? "Applied" : "Mark applied"}
          </Button>
          <Button
            variant="secondary"
            onClick={onMarkRejected}
            disabled={isRejected}
            aria-label={isRejected ? "Already marked rejected" : "Mark as rejected"}
          >
            <AnimatedIcon icon={ThumbsDown} size={16} aria-hidden /> {isRejected ? "Rejected" : "Mark rejected"}
          </Button>
          <Button variant="ghost" onClick={onDismiss}>
            Dismiss
          </Button>
          {job.application_url ? (
            <a
              className="button button-primary"
              href={job.application_url}
              target="_blank"
              rel="noreferrer"
              onClick={handleApplyClick}
            >
              Apply
              <AnimatedIcon icon={ExternalLink} size={14} aria-hidden />
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
