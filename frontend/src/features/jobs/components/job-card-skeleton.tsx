export function JobCardSkeleton() {
  return (
    <div className="job-card job-card-skeleton panel" aria-hidden="true">
      <div className="job-card-top">
        <div className="job-score job-score-empty skeleton-block" />
        <div className="job-card-body" style={{ gap: 10, display: "grid", flex: 1 }}>
          <span className="skeleton-line" style={{ width: "40%" }} />
          <span className="skeleton-line" style={{ width: "78%", height: 18 }} />
          <span className="skeleton-line" style={{ width: "55%" }} />
        </div>
      </div>
      <span className="skeleton-line" style={{ width: "100%" }} />
      <span className="skeleton-line" style={{ width: "88%" }} />
      <div className="job-card-tags">
        <span className="skeleton-chip" />
        <span className="skeleton-chip" />
        <span className="skeleton-chip" />
      </div>
      <div className="job-card-footer">
        <span className="skeleton-line" style={{ width: 72 }} />
        <div className="job-card-actions">
          <span className="skeleton-chip" style={{ width: 72, height: 36 }} />
          <span className="skeleton-chip" style={{ width: 72, height: 36 }} />
        </div>
      </div>
    </div>
  );
}
