import { Link } from "@/shared/ui/router-link";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { apiRequest } from "@/shared/api/client";
import { Card, PageHeader } from "@/shared/ui/primitives";
import { ScoreRing } from "@/features/dashboard/components/interview-progress-charts";
import type { InterviewReportPayload, Session } from "@/features/interview/types";
import "@/features/interview/interview.css";

export function InterviewReport() {
  const params = useParams();
  const sessionId = String(params?.sessionId || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [reportRow, setReportRow] = useState<InterviewReportPayload | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    apiRequest<{ session: Session; report: InterviewReportPayload }>(`/interviews/${sessionId}/report`)
      .then((payload) => {
        if (!active) return;
        setSession(payload.session);
        setReportRow(payload.report);
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [sessionId]);

  const body = reportRow?.report;
  const overall = body?.overall_score ?? reportRow?.overall_score;
  const communication = body?.communication_score ?? reportRow?.communication_score;
  const structure = body?.structure_score ?? reportRow?.structure_score;
  const content = body?.content_score ?? reportRow?.content_score;
  const reviews = body?.question_reviews || [];
  const readiness = body?.practice_readiness;
  const speaking = body?.speaking_summary;
  const gaze = body?.gaze_summary;
  const series = body?.score_series?.length
    ? body.score_series
    : reviews.map((review, index) => ({
        position: index + 1,
        score: review.score ?? 0,
        label: `Q${index + 1}`,
      }));
  const reportProvider = body?.provider || reportRow?.provider || "unknown";
  const generationStatus = body?.generation_status || reportRow?.generation_status;
  const aiGenerated = generationStatus === "ai_generated" || reportProvider === "groq";

  if (loading) {
    return (
      <div className="feature-page interview-report">
        <p>Loading interview report…</p>
      </div>
    );
  }

  if (error || !reportRow) {
    return (
      <div className="feature-page interview-report">
        <PageHeader
          title="Report unavailable"
          description="Finish a mock interview session to generate a debrief."
        />
        <Card className="empty-state">
          <h2>No report yet</h2>
          <p>{error || "Complete the session to store questions, answers, and coach notes."}</p>
          <Link className="button button-primary" href="/mock-interview">
            Back to mock interview
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="feature-page interview-report">
      <PageHeader
        title={session?.target_role ? `${session.target_role} debrief` : "Mock interview debrief"}
        description="Practice coaching from this session: scores, pace, and what to try next. Not a hiring decision."
        action={
          <Link className="button button-secondary" href="/mock-interview">
            All sessions
          </Link>
        }
      />

      <p className="interview-report-provenance" role="status">
        {aiGenerated
          ? "Narrative generated from this session’s recorded answers and measured delivery."
          : "Scores and coaching come only from the recorded answers and measured metrics."}
      </p>

      {readiness ? (
        <section className="interview-report-readiness">
          <div>
            <p className="interview-kicker">Practice readiness</p>
            <h2>{readiness.label}</h2>
            <p>{readiness.next_step}</p>
            <p className="muted">{readiness.disclaimer}</p>
          </div>
          <ScoreRing score={readiness.composite_score ?? overall} label="Readiness" size={120} />
        </section>
      ) : null}

      <div className="interview-report-grid">
        <section className="interview-report-panel">
          <h2>Dimension scores</h2>
          {(
            [
              ["Overall", overall],
              ["Communication", communication],
              ["Structure", structure],
              ["Content", content],
            ] as const
          ).map(([label, value]) => {
            const safe = typeof value === "number" ? Math.max(0, Math.min(100, value)) : 0;
            return (
              <div key={label} className="interview-score-row">
                <div className="interview-score-row-head">
                  <span>{label}</span>
                  <strong>{value ?? "—"}</strong>
                </div>
                <div className="interview-score-track">
                  <div className="interview-score-fill" style={{ width: `${safe}%` }} />
                </div>
              </div>
            );
          })}
        </section>

        {series.length > 0 ? (
          <section className="interview-report-panel">
            <h2>Score by question</h2>
            <div className="interview-score-bars" role="img" aria-label="Per-question scores">
              {series.map((point, index) => {
                const score = Math.max(0, Math.min(100, Number(point.score) || 0));
                const height = Math.max(8, (score / 100) * 120);
                return (
                  <div key={`${point.label || index}`} className="interview-score-bar">
                    <div
                      title={`${point.label || `Q${index + 1}`}: ${score}/100`}
                      style={{ height }}
                      data-tone={score >= 70 ? "strong" : score >= 45 ? "mid" : "weak"}
                    />
                    <p>{point.label || `Q${point.position || index + 1}`}</p>
                    <strong>{score}</strong>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {speaking ? (
          <section className="interview-report-panel">
            <h2>Speaking delivery</h2>
            <p>
              Average pace:{" "}
              <strong>
                {speaking.average_words_per_minute != null
                  ? `${speaking.average_words_per_minute} wpm`
                  : "not timed"}
              </strong>
            </p>
            <p>
              Fillers: <strong>{speaking.total_fillers ?? 0}</strong> across ~{speaking.total_words ?? 0} words
              {speaking.filler_rate != null ? ` (${Math.round(speaking.filler_rate * 1000) / 10}%)` : ""}
            </p>
          </section>
        ) : null}

        {gaze ? (
          <section className="interview-report-panel interview-report-gaze">
            <h2>Camera presence</h2>
            <div className="interview-report-gaze-body">
              <ScoreRing score={gaze.average_eye_contact_score} label="Eye contact" size={100} />
              <div>
                <p>
                  Looking: <strong>{gaze.looking_samples ?? 0}</strong>
                </p>
                <p>
                  Away: <strong>{gaze.away_samples ?? 0}</strong>
                </p>
                <p className="muted">{gaze.notes}</p>
              </div>
            </div>
          </section>
        ) : null}
      </div>

      <section className="interview-report-panel">
        <h2>Summary</h2>
        <p>{body?.overall_summary || reportRow.summary}</p>
        {body?.filler_summary ? <p className="muted">{body.filler_summary}</p> : null}
      </section>

      {body?.strengths && body.strengths.length > 0 ? (
        <section className="interview-report-panel">
          <h2>Strengths</h2>
          <ul>
            {body.strengths.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {body?.improvements && body.improvements.length > 0 ? (
        <section className="interview-report-panel">
          <h2>Improvements</h2>
          <ul>
            {body.improvements.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {body?.practice_plan && body.practice_plan.length > 0 ? (
        <section className="interview-report-panel">
          <h2>Practice plan</h2>
          <ol>
            {body.practice_plan.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className="interview-report-reviews">
        {reviews.map((review, index) => (
          <article key={`${review.question}-${index}`} className="interview-report-review">
            <header>
              <h2>
                Q{index + 1}. {review.question}
              </h2>
              <span className="status-chip" data-tone="info">
                {(review.verdict || "reviewed").replaceAll("_", " ")}
                {review.score != null ? ` · ${review.score}` : ""}
              </span>
            </header>
            <p className="interview-kicker">Your answer</p>
            <p className="interview-report-answer">{review.answer || "—"}</p>
            {review.interviewer_feedback ? <p>{review.interviewer_feedback}</p> : null}
            {review.better_approach ? (
              <p className="muted">
                <strong>Stronger approach: </strong>
                {review.better_approach}
              </p>
            ) : null}
            {review.filler_analysis?.total_count != null ? (
              <p className="muted">
                Fillers: {review.filler_analysis.total_count}
                {review.filler_analysis.unique?.length
                  ? ` (${review.filler_analysis.unique.join(", ")})`
                  : ""}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
