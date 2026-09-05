import { Link } from "@/shared/ui/router-link";
import { useSyncExternalStore } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  FileCheck2,
  FileText,
  Play,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import {
  extractMissing,
  resolveCompletion,
} from "@/features/profile/model/profile-completion";
import { isDemoSession } from "@/features/auth/demo-session";
import { Card, PageHeader } from "@/shared/ui/primitives";
import {
  AnimatedNumber,
  DimensionBars,
  MiniMetricRing,
  ScoreRing,
  ScoreTrendChart,
  type InterviewProgress,
} from "@/features/dashboard/components/interview-progress-charts";
import { useWorkspaceBootstrap } from "@/features/workspace/bootstrap-context";

function formatWhen(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function readDemoMode() {
  return isDemoSession();
}

function subscribeDemoMode() {
  return () => undefined;
}

function DashboardSkeleton() {
  return (
    <div className="dashboard-skeleton" aria-busy="true" aria-live="polite">
      <span className="dashboard-visually-hidden">Loading your workspace snapshot</span>
      <div className="dashboard-metrics-grid">
        <div className="dashboard-skel-card" />
        <div className="dashboard-skel-card" />
        <div className="dashboard-skel-card" />
        <div className="dashboard-skel-card" />
      </div>
      <div className="dashboard-visual-grid">
        <div className="dashboard-skel-card dashboard-skel-tall" />
        <div className="dashboard-skel-card dashboard-skel-tall" />
      </div>
    </div>
  );
}

export function Dashboard() {
  const { data, error, loading, refresh } = useWorkspaceBootstrap();
  const demoMode = useSyncExternalStore(subscribeDemoMode, readDemoMode, () => false);
  const reduceMotion = useReducedMotion();

  const first = data?.profile?.full_name?.split(" ")[0] || "there";
  const details =
    data?.workspace?.profile_completion_details || data?.profile?.profile_completion_details || null;
  const missing = extractMissing(details, data?.workspace?.profile_missing);
  const completion = resolveCompletion(
    data?.workspace?.profile_completion ?? data?.profile?.profile_completion,
    details,
    missing,
  );

  const actions = data?.latest_actions;
  const lastResume = actions?.last_resume_upload;
  const hasConfirmedResume = Boolean(data?.workspace?.has_confirmed_resume);
  const lastInterview = actions?.last_interview;
  const lastJob = actions?.last_job_applied;

  const atsScore =
    data?.latest_ats_analysis?.overall_score == null
      ? null
      : Math.round(Number(data.latest_ats_analysis.overall_score));

  const interviewProgress = data?.interview_progress as InterviewProgress | null | undefined;
  const interviewLatest = interviewProgress?.latest_overall ?? null;
  const interviewDelta = interviewProgress?.delta ?? null;
  const history = interviewProgress?.history || [];
  const hasInterviewScores = history.some((h) => h.overall_score != null);

  const jobCount = data?.counts?.saved_jobs ?? (lastJob ? 1 : 0);

  const interviewHref = lastInterview?.id
    ? interviewLatest != null
      ? `/mock-interview/report/${lastInterview.id}`
      : `/mock-interview/session/${lastInterview.id}`
    : "/mock-interview";

  const atsHref = data?.latest_ats_analysis?.id
    ? `/resume-analysis/report/${data.latest_ats_analysis.id}`
    : "/resume-analysis?tab=upload";

  const containerVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: reduceMotion ? 0 : 0.06,
        delayChildren: 0.02,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 12 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: "spring" as const, bounce: 0, duration: 0.44 },
    },
  };

  if (loading && !data && !error) {
    return (
      <div className="feature-page dashboard-page">
        <DashboardSkeleton />
      </div>
    );
  }

  return (
    <motion.div
      className="feature-page dashboard-page"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      {/* Header */}
      <motion.div variants={itemVariants}>
        <PageHeader
          title={`Welcome, ${first}.`}
          description="High-signal metrics, preparation trajectory, and immediate next steps."
          action={
            <div className="dashboard-header-actions">
              <Link className="button button-secondary" href="/mock-interview">
                <Play size={14} className="button-icon" />
                <span>Practice Interview</span>
              </Link>
              <Link className="button button-primary" href="/resume-analysis?tab=upload">
                <Sparkles size={14} className="button-icon" />
                <span>New ATS Run</span>
              </Link>
            </div>
          }
        />
      </motion.div>

      {/* Demo notice */}
      {demoMode && (
        <motion.div variants={itemVariants} className="feature-alert" data-tone="info" role="status">
          <p className="eyebrow" style={{ margin: 0 }}>
            Demo Mode Active
          </p>
          <p>
            You are browsing interactive demo data. Sign in with Google or email to sync real resumes,
            live ATS scoring, and interview transcripts.
          </p>
        </motion.div>
      )}

      {/* Error alert */}
      {error && (
        <motion.div variants={itemVariants} className="feature-alert" role="alert">
          <p className="field-error">{error}</p>
          <button type="button" className="button button-secondary" onClick={() => refresh()}>
            Retry
          </button>
        </motion.div>
      )}

      {/* Priority Next Step Banner */}
      {!hasConfirmedResume && (
        <motion.div variants={itemVariants}>
          <Card className="dashboard-next-step-card">
            <div className="dashboard-next-step-main">
              <div className="dashboard-next-step-icon">
                <FileText size={22} />
              </div>
              <div>
                <span className="dashboard-badge-pill">Priority Next Step</span>
                <h3>Upload your confirmed resume</h3>
                <p>
                  A confirmed resume powers ATS scoring, personalized mock interviews, and skill gap
                  insights.
                </p>
              </div>
            </div>
            <Link className="button button-primary" href="/resume-analysis?tab=upload">
              Upload Resume <ArrowRight size={14} />
            </Link>
          </Card>
        </motion.div>
      )}

      {/* Tier 1: 4 Essential Stat Cards */}
      <motion.section className="dashboard-metrics-grid" aria-label="Essential metrics" variants={itemVariants}>
        {/* Stat 1: ATS Score */}
        <article className="dashboard-stat-card">
          <div className="dashboard-stat-header">
            <span className="dashboard-stat-label">ATS Score</span>
            <MiniMetricRing
              value={atsScore}
              max={100}
              tone={atsScore != null && atsScore >= 75 ? "success" : "accent"}
            />
          </div>
          <div className="dashboard-stat-body">
            <div className="dashboard-stat-value-row">
              <span className="dashboard-stat-value">
                {atsScore != null ? <AnimatedNumber value={atsScore} /> : "—"}
                {atsScore != null && <small className="dashboard-stat-unit">%</small>}
              </span>
            </div>
            <p className="dashboard-stat-note">
              {atsScore != null
                ? "Match against target role"
                : hasConfirmedResume
                ? "Ready for your first scan"
                : "Upload resume to score"}
            </p>
          </div>
          <div className="dashboard-stat-footer">
            <Link className="dashboard-stat-link" href={atsHref}>
              {data?.latest_ats_analysis?.id ? "Open analysis" : "Run scan"}
              <ArrowRight size={13} />
            </Link>
          </div>
        </article>

        {/* Stat 2: Interview Score */}
        <article className="dashboard-stat-card">
          <div className="dashboard-stat-header">
            <span className="dashboard-stat-label">Interview Score</span>
            <MiniMetricRing
              value={interviewLatest}
              max={100}
              tone={interviewLatest != null && interviewLatest >= 75 ? "success" : "accent"}
            />
          </div>
          <div className="dashboard-stat-body">
            <div className="dashboard-stat-value-row">
              <span className="dashboard-stat-value">
                {interviewLatest != null ? <AnimatedNumber value={interviewLatest} /> : "—"}
              </span>
              {interviewDelta != null && (
                <span
                  className="dashboard-delta-chip"
                  data-tone={interviewDelta > 0 ? "up" : interviewDelta < 0 ? "down" : "flat"}
                >
                  {interviewDelta > 0 ? `+${interviewDelta}` : interviewDelta}
                </span>
              )}
            </div>
            <p className="dashboard-stat-note">
              {interviewLatest != null
                ? `${interviewProgress?.sessions_completed || 1} scored sessions logged`
                : "Complete a mock interview to score"}
            </p>
          </div>
          <div className="dashboard-stat-footer">
            <Link className="dashboard-stat-link" href={interviewHref}>
              {interviewLatest != null ? "View report" : "Start session"}
              <ArrowRight size={13} />
            </Link>
          </div>
        </article>

        {/* Stat 3: Verified Resumes */}
        <article className="dashboard-stat-card">
          <div className="dashboard-stat-header">
            <span className="dashboard-stat-label">Active Resume</span>
            <span
              className="dashboard-stat-badge"
              data-status={hasConfirmedResume ? "verified" : "empty"}
            >
              {hasConfirmedResume ? <CheckCircle2 size={12} /> : null}
              {hasConfirmedResume ? "Verified" : "None"}
            </span>
          </div>
          <div className="dashboard-stat-body">
            <div className="dashboard-stat-value-row">
              <span className="dashboard-stat-value" style={{ fontSize: "1.25rem", fontWeight: 650 }}>
                {lastResume?.title || lastResume?.filename || (hasConfirmedResume ? "Confirmed Resume" : "No Resume")}
              </span>
            </div>
            <p className="dashboard-stat-note">
              {hasConfirmedResume ? "Confirmed for ATS & applications" : "Upload your master profile"}
            </p>
          </div>
          <div className="dashboard-stat-footer">
            <Link className="dashboard-stat-link" href="/resume-analysis?tab=resumes">
              Manage resumes
              <ArrowRight size={13} />
            </Link>
          </div>
        </article>

        {/* Stat 4: Job Pipeline */}
        <article className="dashboard-stat-card">
          <div className="dashboard-stat-header">
            <span className="dashboard-stat-label">Job Pipeline</span>
            <Briefcase size={16} className="dashboard-stat-icon" />
          </div>
          <div className="dashboard-stat-body">
            <div className="dashboard-stat-value-row">
              <span className="dashboard-stat-value">
                <AnimatedNumber value={jobCount} />
              </span>
              <small className="dashboard-stat-unit">saved</small>
            </div>
            <p className="dashboard-stat-note">
              {lastJob?.label ? `Latest: ${lastJob.label}` : "Tracked positions and target roles"}
            </p>
          </div>
          <div className="dashboard-stat-footer">
            <Link className="dashboard-stat-link" href="/jobs">
              Explore opportunities
              <ArrowRight size={13} />
            </Link>
          </div>
        </article>
      </motion.section>

      {/* Tier 2: Visual Intelligence Bento (2 Columns) */}
      <motion.section className="dashboard-visual-grid" aria-label="Performance visualizations" variants={itemVariants}>
        {/* Trajectory Column */}
        <Card className="dashboard-card dashboard-chart-card">
          <div className="dashboard-card-header">
            <div>
              <span className="dashboard-card-eyebrow">Performance Trajectory</span>
              <h3 className="dashboard-card-title">Interview Improvement</h3>
            </div>
            {hasInterviewScores && (
              <Link className="button button-secondary" href="/mock-interview">
                All Sessions
              </Link>
            )}
          </div>

          <div className="dashboard-card-content">
            {hasInterviewScores ? (
              <div className="dashboard-trajectory-layout">
                <ScoreTrendChart history={history} />
                {interviewProgress?.dimensions ? (
                  <div className="dashboard-dimensions-wrapper">
                    <h4 className="dashboard-subhead">Skill Dimension Breakdown</h4>
                    <DimensionBars dimensions={interviewProgress.dimensions} />
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="dashboard-empty-trajectory">
                <div className="empty-sparkline" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <h4 className="dashboard-empty-title">No interview trend yet</h4>
                <p className="dashboard-empty-desc">
                  Complete your first mock interview debrief to view your progress trend and skill dimension
                  breakdown.
                </p>
                <Link className="button button-primary" href="/mock-interview/setup">
                  Start Practice Session
                </Link>
              </div>
            )}
          </div>
        </Card>

        {/* Readiness & Milestones Column */}
        <Card className="dashboard-card dashboard-milestones-card">
          <div className="dashboard-card-header">
            <div>
              <span className="dashboard-card-eyebrow">Profile & Milestones</span>
              <h3 className="dashboard-card-title">Career Readiness</h3>
            </div>
            <Link className="dashboard-inline-action" href="/settings/profile">
              Edit Profile
            </Link>
          </div>

          <div className="dashboard-card-content">
            {/* Readiness score ring row */}
            <div className="dashboard-readiness-row">
              <ScoreRing score={completion} label="Profile ready" size={88} unit="%" tone="accent" />
              <div className="dashboard-readiness-meta">
                <h4 className="dashboard-readiness-heading">
                  {completion >= 100
                    ? "Profile Fully Optimized"
                    : `Profile ${completion}% Complete`}
                </h4>
                <p className="dashboard-readiness-desc">
                  {completion >= 100
                    ? "Your evidence records and background credentials are comprehensive."
                    : missing.length > 0
                    ? `Add ${missing[0]?.label || "more details"} to sharpen ATS alignment.`
                    : "Add your latest projects and certifications to stand out."}
                </p>
                {completion < 100 && (
                  <Link className="dashboard-inline-action" href="/settings/profile">
                    Complete profile <ArrowRight size={12} style={{ display: "inline", verticalAlign: "middle" }} />
                  </Link>
                )}
              </div>
            </div>

            {/* Milestones list */}
            <div className="dashboard-milestones-list">
              {/* Milestone 1: Resume */}
              <div className="dashboard-milestone-item">
                <div className="dashboard-milestone-icon">
                  <FileCheck2 size={16} />
                </div>
                <div className="dashboard-milestone-info">
                  <span className="dashboard-milestone-label">Latest Resume</span>
                  {lastResume?.title || lastResume?.filename ? (
                    <Link className="dashboard-milestone-value" href="/resume-analysis?tab=resumes">
                      {lastResume.title || lastResume.filename}
                    </Link>
                  ) : (
                    <span className="dashboard-milestone-empty">No resume uploaded</span>
                  )}
                </div>
                {lastResume?.created_at && (
                  <span className="dashboard-milestone-time">{formatWhen(lastResume.created_at)}</span>
                )}
              </div>

              {/* Milestone 2: Interview */}
              <div className="dashboard-milestone-item">
                <div className="dashboard-milestone-icon">
                  <TrendingUp size={16} />
                </div>
                <div className="dashboard-milestone-info">
                  <span className="dashboard-milestone-label">Latest Interview</span>
                  {lastInterview ? (
                    <Link className="dashboard-milestone-value" href={interviewHref}>
                      {lastInterview.label || "Mock Session"}
                      {lastInterview.status ? ` (${lastInterview.status.replaceAll("_", " ")})` : ""}
                    </Link>
                  ) : (
                    <span className="dashboard-milestone-empty">No sessions yet</span>
                  )}
                </div>
                {lastInterview?.at && (
                  <span className="dashboard-milestone-time">{formatWhen(lastInterview.at)}</span>
                )}
              </div>

              {/* Milestone 3: Job */}
              <div className="dashboard-milestone-item">
                <div className="dashboard-milestone-icon">
                  <Briefcase size={16} />
                </div>
                <div className="dashboard-milestone-info">
                  <span className="dashboard-milestone-label">
                    {lastJob?.is_application ? "Last Applied" : "Last Saved Job"}
                  </span>
                  {lastJob?.title || lastJob?.label ? (
                    <Link
                      className="dashboard-milestone-value"
                      href={lastJob.job_id ? `/jobs/${lastJob.job_id}` : "/jobs"}
                    >
                      {lastJob.title || lastJob.label}
                      {lastJob.company ? ` · ${lastJob.company}` : ""}
                    </Link>
                  ) : (
                    <span className="dashboard-milestone-empty">No tracked jobs</span>
                  )}
                </div>
                {lastJob?.at && (
                  <span className="dashboard-milestone-time">{formatWhen(lastJob.at)}</span>
                )}
              </div>
            </div>
          </div>
        </Card>
      </motion.section>

      {/* Tier 3: Recent Activity Stream */}
      {data?.recent_activity && data.recent_activity.length > 0 && (
        <motion.div variants={itemVariants}>
          <Card className="dashboard-card dashboard-activity-card">
            <div className="dashboard-card-header">
              <div>
                <span className="dashboard-card-eyebrow">Audit Stream</span>
                <h3 className="dashboard-card-title">Recent Activity</h3>
              </div>
              <span className="dashboard-activity-count">
                {data.recent_activity.length} recent events
              </span>
            </div>
            <div className="dashboard-card-content">
              <div className="dashboard-activity-timeline">
                {data.recent_activity.slice(0, 5).map((item) => (
                  <div key={item.id} className="dashboard-timeline-item">
                    <div className="dashboard-timeline-dot" />
                    <div className="dashboard-timeline-body">
                      <p className="dashboard-timeline-summary">{item.summary}</p>
                      <span className="dashboard-timeline-time">{formatWhen(item.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}
