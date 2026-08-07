import { Link } from "@/shared/ui/router-link";

export type InterviewHistoryPoint = {
  session_id: string;
  label?: string | null;
  mode?: string | null;
  status?: string | null;
  at?: string | null;
  overall_score?: number | null;
  communication_score?: number | null;
  structure_score?: number | null;
  content_score?: number | null;
  eye_contact_score?: number | null;
};

export type DimensionStats = {
  latest?: number | null;
  previous?: number | null;
  average?: number | null;
};

export type InterviewProgress = {
  sessions_total?: number;
  sessions_completed?: number;
  sessions_with_scores?: number;
  latest_overall?: number | null;
  previous_overall?: number | null;
  delta?: number | null;
  best_overall?: number | null;
  average_overall?: number | null;
  trend?: "up" | "down" | "flat" | "none" | string;
  history?: InterviewHistoryPoint[];
  dimensions?: {
    communication?: DimensionStats;
    structure?: DimensionStats;
    content?: DimensionStats;
    eye_contact?: DimensionStats;
  };
};

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

function formatShortDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function deltaLabel(delta?: number | null) {
  if (delta == null) return null;
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

function trendTone(trend?: string, delta?: number | null): "up" | "down" | "flat" | "none" {
  if (trend === "up" || trend === "down" || trend === "flat" || trend === "none") return trend;
  if (delta == null) return "none";
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "flat";
}

/** Circular readiness ring for the latest overall score. */
export function ScoreRing({
  score,
  label = "Latest overall",
  size = 128,
}: {
  score: number | null | undefined;
  label?: string;
  size?: number;
}) {
  const safe = score == null ? null : clampScore(score);
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = safe == null ? 0 : safe / 100;
  const offset = circumference * (1 - progress);

  return (
    <div className="score-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          className="score-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
        />
        <circle
          className="score-ring-progress"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="score-ring-center">
        <span className="score-ring-value metric-value">{safe ?? "—"}</span>
        <span className="score-ring-label">{label}</span>
      </div>
    </div>
  );
}

/** Area + line chart of overall scores across sessions (oldest → newest). */
export function ScoreTrendChart({ history }: { history: InterviewHistoryPoint[] }) {
  // Coerce string scores from Firestore and drop invalid points so the chart never blanks.
  const points = history.filter((h) => {
    const n = Number(h.overall_score);
    return Number.isFinite(n) && h.session_id;
  });
  if (points.length === 0) {
    return (
      <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
        No plotted scores yet — complete a session debrief to unlock the trend line.
      </p>
    );
  }

  const width = 560;
  const height = 180;
  const padX = 28;
  const padY = 24;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;

  const scores = points.map((p) => clampScore(Number(p.overall_score)));
  const minScore = Math.max(0, Math.min(...scores, 0));
  const maxScore = Math.min(100, Math.max(...scores, 100));
  // Always show a full 0–100 band when only one point so the chart is readable.
  const lo = points.length === 1 ? 0 : Math.max(0, minScore - 8);
  const hi = points.length === 1 ? 100 : Math.min(100, maxScore + 8);
  const range = Math.max(1, hi - lo);

  const coords = points.map((point, index) => {
    const x =
      points.length === 1
        ? padX + plotW / 2
        : padX + (index / (points.length - 1)) * plotW;
    const y = padY + plotH - ((clampScore(Number(point.overall_score)) - lo) / range) * plotH;
    return { x, y, point, score: clampScore(Number(point.overall_score)) };
  });

  const linePath = coords
    .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(" ");
  const areaPath =
    coords.length > 0
      ? `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${(padY + plotH).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(padY + plotH).toFixed(1)} Z`
      : "";

  // Guide lines at 25/50/75 within the visible range
  const guides = [25, 50, 75].filter((g) => g >= lo && g <= hi);

  return (
    <div className="trend-chart" role="img" aria-label="Mock interview score trend over sessions">
      <svg className="trend-chart-svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="interviewTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary-strong)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--primary-strong)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {guides.map((guide) => {
          const y = padY + plotH - ((guide - lo) / range) * plotH;
          return (
            <g key={guide}>
              <line
                className="trend-chart-guide"
                x1={padX}
                x2={width - padX}
                y1={y}
                y2={y}
              />
              <text className="trend-chart-guide-label" x={4} y={y + 3}>
                {guide}
              </text>
            </g>
          );
        })}
        {areaPath ? <path className="trend-chart-area" d={areaPath} fill="url(#interviewTrendFill)" /> : null}
        <path className="trend-chart-line" d={linePath} fill="none" />
        {coords.map((c, index) => (
          <g key={`${c.point.session_id}-${index}`}>
            <circle className="trend-chart-dot" cx={c.x} cy={c.y} r={5} />
            <title>
              {c.point.label || "Session"} · {c.score}/100 · {formatShortDate(c.point.at)}
            </title>
          </g>
        ))}
      </svg>
      <div className="trend-chart-axis" aria-hidden="true">
        {points.map((point, index) => (
          <span key={`${point.session_id}-tick-${index}`} className="trend-chart-tick">
            {formatShortDate(point.at)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Horizontal bars comparing communication / structure / content. */
export function DimensionBars({
  dimensions,
}: {
  dimensions?: InterviewProgress["dimensions"];
}) {
  const rows: Array<{ key: string; label: string; stats?: DimensionStats }> = [
    { key: "communication", label: "Communication", stats: dimensions?.communication },
    { key: "structure", label: "Structure", stats: dimensions?.structure },
    { key: "content", label: "Content depth", stats: dimensions?.content },
    { key: "eye_contact", label: "Camera presence", stats: dimensions?.eye_contact },
  ];

  const hasAny = rows.some((row) => row.stats?.latest != null);
  if (!hasAny) return null;

  return (
    <div className="dimension-bars" aria-label="Skill dimension scores">
      {rows.map((row) => {
        const latest = row.stats?.latest;
        const previous = row.stats?.previous;
        const average = row.stats?.average;
        const width = latest == null ? 0 : clampScore(latest);
        const prevWidth = previous == null ? null : clampScore(previous);
        const delta =
          latest != null && previous != null ? latest - previous : null;

        return (
          <div className="dimension-row" key={row.key}>
            <div className="dimension-row-head">
              <span className="dimension-label">{row.label}</span>
              <span className="dimension-score mono">
                {latest ?? "—"}
                {delta != null ? (
                  <span className="dimension-delta" data-tone={delta > 0 ? "up" : delta < 0 ? "down" : "flat"}>
                    {" "}
                    {deltaLabel(delta)}
                  </span>
                ) : null}
              </span>
            </div>
            <div className="dimension-track">
              {prevWidth != null ? (
                <span
                  className="dimension-fill dimension-fill-prev"
                  style={{ width: `${prevWidth}%` }}
                  title={previous != null ? `Previous: ${previous}` : undefined}
                />
              ) : null}
              <span
                className="dimension-fill"
                style={{ width: `${width}%` }}
                title={latest != null ? `Latest: ${latest}` : undefined}
              />
            </div>
            {average != null ? (
              <p className="dimension-avg muted">Avg across sessions {average}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** Compact session list with score chips — most recent first. */
export function SessionScoreList({ history }: { history: InterviewHistoryPoint[] }) {
  if (history.length === 0) return null;
  const recent = [...history].reverse().slice(0, 5);

  return (
    <ul className="session-score-list">
      {recent.map((item) => {
        const score = item.overall_score;
        const tone =
          score == null ? "neutral" : score >= 75 ? "strong" : score >= 55 ? "mid" : "low";
        return (
          <li key={item.session_id} className="session-score-item">
            <div className="session-score-main">
              <Link className="session-score-title" href={`/mock-interview/report/${item.session_id}`}>
                {item.label || "Mock interview"}
              </Link>
              <span className="session-score-meta mono">
                {(item.mode || "session").replaceAll("_", " ")} · {formatShortDate(item.at)}
              </span>
            </div>
            <span className="session-score-chip" data-tone={tone}>
              {score ?? "—"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function InterviewProgressPanel({ progress }: { progress?: InterviewProgress | null }) {
  const history = progress?.history || [];
  const hasScores = history.some((h) => h.overall_score != null);
  const trend = trendTone(progress?.trend, progress?.delta);
  const deltaText = deltaLabel(progress?.delta);

  if (!progress || (!hasScores && !(progress.sessions_total || 0))) {
    return (
      <section className="interview-progress-panel is-empty" aria-label="Mock interview improvement">
        <div className="interview-progress-head">
          <div>
            <p className="eyebrow" style={{ margin: 0 }}>
              Mock interview progress
            </p>
            <h2>See how your answers improve</h2>
            <p className="muted">
              Complete practice sessions to unlock score trends, dimension bars, and session-to-session
              deltas.
            </p>
          </div>
          <Link className="button button-primary" href="/mock-interview/setup">
            Start a session
          </Link>
        </div>
        <div className="interview-progress-empty-visual" aria-hidden="true">
          <div className="empty-sparkline">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
            Your overall, communication, structure, and content scores will plot here after the first
            completed debrief.
          </p>
        </div>
      </section>
    );
  }

  if (!hasScores) {
    return (
      <section className="interview-progress-panel is-empty" aria-label="Mock interview improvement">
        <div className="interview-progress-head">
          <div>
            <p className="eyebrow" style={{ margin: 0 }}>
              Mock interview progress
            </p>
            <h2>
              {progress.sessions_total || 0} session
              {(progress.sessions_total || 0) === 1 ? "" : "s"} · scores pending
            </h2>
            <p className="muted">
              Finish a session to generate a debrief report. Scores appear here once a report is stored.
            </p>
          </div>
          <Link className="button button-primary" href="/mock-interview">
            Open sessions
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="interview-progress-panel" aria-label="Mock interview improvement">
      <div className="interview-progress-head">
        <div>
          <p className="eyebrow" style={{ margin: 0 }}>
            Mock interview progress
          </p>
          <h2>How your interviews are improving</h2>
          <p className="muted">
            Scores from completed debriefs — overall trend plus communication, structure, content, and
            camera presence when measured.
          </p>
        </div>
        <div className="interview-progress-actions">
          {deltaText != null ? (
            <span className="progress-delta-badge" data-tone={trend}>
              <span className="progress-delta-value">{deltaText}</span>
              <span className="progress-delta-caption">vs last session</span>
            </span>
          ) : null}
          <Link className="button button-secondary" href="/mock-interview">
            All sessions
          </Link>
        </div>
      </div>

      <div className="interview-progress-stats">
        <article className="ip-stat">
          <p className="ip-stat-label">Sessions scored</p>
          <p className="ip-stat-value metric-value">
            {progress.sessions_with_scores ?? history.length}
            <small>/{progress.sessions_total ?? history.length}</small>
          </p>
        </article>
        <article className="ip-stat">
          <p className="ip-stat-label">Average</p>
          <p className="ip-stat-value metric-value">
            {progress.average_overall ?? "—"}
          </p>
        </article>
        <article className="ip-stat">
          <p className="ip-stat-label">Best</p>
          <p className="ip-stat-value metric-value">{progress.best_overall ?? "—"}</p>
        </article>
        <article className="ip-stat">
          <p className="ip-stat-label">Completed</p>
          <p className="ip-stat-value metric-value">{progress.sessions_completed ?? "—"}</p>
        </article>
      </div>

      <div className="interview-progress-grid">
        <div className="interview-progress-chart-col">
          <div className="interview-chart-card">
            <div className="interview-chart-card-head">
              <h3>Score trend</h3>
              <p className="muted">Overall score by session</p>
            </div>
            <ScoreTrendChart history={history} />
          </div>
          <div className="interview-chart-card">
            <div className="interview-chart-card-head">
              <h3>Recent sessions</h3>
              <p className="muted">Open a report for full feedback</p>
            </div>
            <SessionScoreList history={history} />
          </div>
        </div>

        <aside className="interview-progress-side">
          <div className="interview-chart-card interview-ring-card">
            <ScoreRing score={progress.latest_overall} label="Latest overall" />
            {progress.previous_overall != null ? (
              <p className="muted ring-compare">
                Previous session <strong className="mono">{progress.previous_overall}</strong>
              </p>
            ) : null}
          </div>
          <div className="interview-chart-card">
            <div className="interview-chart-card-head">
              <h3>Skill dimensions</h3>
              <p className="muted">Latest vs previous (ghost bar)</p>
            </div>
            <DimensionBars dimensions={progress.dimensions} />
          </div>
        </aside>
      </div>
    </section>
  );
}
