import {
  Bookmark,
  MapPin,
  CheckCircle2,
  Building2,
  Briefcase,
  Send,
  ThumbsDown,
  Banknote,
} from "lucide-react";
import type { Job, Recommendation, SavedJobStatus } from "./job-types";
import { statusLabel, statusTone } from "./job-types";
import { Badge, Button, Card } from "@/shared/ui/primitives";

function salaryLabel(job: Job): string | null {
  if (job.salary_min != null && job.salary_max != null) {
    return `$${Number(job.salary_min).toLocaleString()} – $${Number(job.salary_max).toLocaleString()}`;
  }
  if (job.salary_min != null) return `From $${Number(job.salary_min).toLocaleString()}`;
  if (job.salary_max != null) return `Up to $${Number(job.salary_max).toLocaleString()}`;
  return null;
}

function excerpt(text: string | null | undefined, max = 140): string | null {
  const cleaned = (text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).trimEnd()}…`;
}

export function JobCard({
  job,
  recommendation,
  status,
  busy = false,
  onOpen,
  onToggleSave,
  onMarkApplied,
  onMarkRejected,
}: {
  job: Job;
  recommendation?: Recommendation;
  status?: SavedJobStatus | string | null;
  busy?: boolean;
  onOpen: () => void;
  onToggleSave: (e?: React.MouseEvent) => void;
  onMarkApplied: (e?: React.MouseEvent) => void;
  onMarkRejected: (e?: React.MouseEvent) => void;
}) {
  const score = recommendation != null ? Math.round(Number(recommendation.match_score) || 0) : null;
  const salary = salaryLabel(job);
  const blurb = excerpt(job.description);
  const matched = (recommendation?.match_breakdown?.matched_requirements || []).slice(0, 4);
  const missing = (recommendation?.match_breakdown?.missing_requirements || []).slice(0, 2);
  const normalized = (status || "").toLowerCase();
  const isSaved = normalized === "saved";
  const isApplied = normalized === "applied" || normalized === "interviewing" || normalized === "offer";
  const isRejected = normalized === "rejected" || normalized === "withdrawn";
  const scoreTone =
    score == null ? "muted" : score >= 75 ? "high" : score >= 50 ? "mid" : "low";

  function onKeyActivate(event: React.KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  }

  return (
    <Card
      as="article"
      className="job-card"
      onClick={onOpen}
      onKeyDown={onKeyActivate}
      role="button"
      tabIndex={0}
      aria-label={`${job.title} at ${job.company}${score != null ? `, ${score}% match` : ""}`}
    >
      <div className="job-card-top">
        {score != null ? (
          <div className="job-score" data-tone={scoreTone} aria-label={`${score}% match`}>
            <span className="job-score-value">{score}%</span>
            <span className="job-score-label">match</span>
          </div>
        ) : (
          <div className="job-score job-score-empty" aria-hidden="true">
            <Briefcase size={20} />
          </div>
        )}
        <div className="job-card-body">
          <div className="job-card-chips">
            {status ? (
              <span className="status-chip" data-tone={statusTone(status)}>
                {statusLabel(status)}
              </span>
            ) : null}
            {job.work_mode ? (
              <Badge variant="secondary">
                <Briefcase size={12} aria-hidden /> {job.work_mode}
              </Badge>
            ) : null}
            {salary ? (
              <Badge variant="secondary">
                <Banknote size={12} aria-hidden /> {salary}
              </Badge>
            ) : null}
          </div>
          <h3 className="job-card-title">{job.title}</h3>
          <p className="job-card-meta">
            <span>
              <Building2 size={14} aria-hidden /> {job.company || "Company"}
            </span>
            {job.location ? (
              <span>
                <MapPin size={14} aria-hidden /> {job.location}
              </span>
            ) : null}
          </p>
        </div>
      </div>

      {blurb ? <p className="job-card-excerpt">{blurb}</p> : null}

      {matched.length > 0 || missing.length > 0 ? (
        <div className="job-card-tags" aria-label="Match highlights">
          {matched.map((item) => (
            <span key={`m-${item}`} className="job-tag job-tag-matched">
              <CheckCircle2 size={12} aria-hidden /> {item}
            </span>
          ))}
          {missing.map((item) => (
            <span key={`x-${item}`} className="job-tag job-tag-gap">
              {item}
            </span>
          ))}
        </div>
      ) : job.requirements?.length ? (
        <div className="job-card-tags" aria-label="Requirements">
          {job.requirements.slice(0, 4).map((item) => (
            <span key={item} className="job-tag">
              {item}
            </span>
          ))}
        </div>
      ) : null}

      <div className="job-card-footer" onClick={(e) => e.stopPropagation()}>
        <span className="job-card-hint muted">View details</span>
        <div className="job-card-actions">
          <Button
            variant={isSaved ? "primary" : "secondary"}
            disabled={busy}
            onClick={(e) => onToggleSave(e)}
            aria-label={isSaved ? "Unsave job" : "Save job"}
            title={isSaved ? "Unsave" : "Save"}
          >
            <Bookmark size={16} aria-hidden />
            <span className="job-card-action-label">{isSaved ? "Saved" : "Save"}</span>
          </Button>
          <Button
            variant="secondary"
            disabled={busy || isApplied}
            onClick={(e) => onMarkApplied(e)}
            aria-label="Mark as applied"
            title="Mark applied"
          >
            <Send size={16} aria-hidden />
            <span className="job-card-action-label">{isApplied ? "Applied" : "Apply"}</span>
          </Button>
          <Button
            variant="secondary"
            disabled={busy || isRejected}
            onClick={(e) => onMarkRejected(e)}
            aria-label="Mark as rejected"
            title="Mark rejected"
          >
            <ThumbsDown size={16} aria-hidden />
            <span className="job-card-action-label">{isRejected ? "Rejected" : "Pass"}</span>
          </Button>
        </div>
      </div>
    </Card>
  );
}
