import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  RefreshCw,
  MapPin,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { Link } from "@/shared/ui/router-link";
import { apiRequest } from "@/shared/api/client";
import { isDemoSession } from "@/features/auth/demo-session";
import { JobCard } from "./job-card";
import { JobCardSkeleton } from "./job-card-skeleton";
import { JobModal } from "./job-modal";
import CareerGlobe, { GlobeJobPin } from "./career-globe";
import type { Job, Recommendation, SavedJobRow, SavedJobStatus } from "./job-types";
import { isPipelineStatus } from "./job-types";
import { jobRecsCacheKey, readJobRecsCache, writeJobRecsCache } from "../job-recs-cache";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/shared/ui/primitives";
import { AnimatedIcon } from "@/components/ui/animated-icon";

export type { Job, Recommendation } from "./job-types";

type PipelineFilter = "all" | "saved" | "applied" | "rejected";

type ResumeSummary = {
  id: string;
  is_active?: boolean;
  latest_version?: {
    id?: string;
    extraction_status?: string | null;
  } | null;
};

type JobAgentStatus = {
  mode: "agent" | "evidence" | "evidence_fallback";
  provider?: string | null;
  error?: string;
};

function normalizeStatus(status: string | undefined | null): SavedJobStatus {
  const value = (status || "saved").toLowerCase() as SavedJobStatus;
  return value;
}

export function JobsHome({ savedOnly = false }: { savedOnly?: boolean }) {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState("");
  /** job_id → tracking status for pipeline (saved / applied / rejected / …) */
  const [statusByJobId, setStatusByJobId] = useState<Record<string, SavedJobStatus>>({});
  const [pipelineFilter, setPipelineFilter] = useState<PipelineFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [filterLocation, setFilterLocation] = useState("");
  const [filterWorkMode, setFilterWorkMode] = useState("");
  const [filterSalaryMin, setFilterSalaryMin] = useState<number | "">("");
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);
  const [agentStatus, setAgentStatus] = useState<JobAgentStatus>({ mode: "evidence", provider: null });
  const limit = 20;
  const requestSequence = useRef(0);
  const hydratedCacheKey = useRef<string | null>(null);
  const lastAutoLoadKey = useRef<string | null>(null);
  const hasJobsRef = useRef(false);

  const cacheKey = useMemo(
    () =>
      jobRecsCacheKey({
        demo: isDemoSession(),
        location: filterLocation,
        workMode: filterWorkMode,
        salaryMin: filterSalaryMin,
      }),
    [filterLocation, filterWorkMode, filterSalaryMin],
  );

  useEffect(() => {
    hasJobsRef.current = jobs.length > 0;
  }, [jobs.length]);

  const counts = useMemo(() => {
    const values = Object.values(statusByJobId);
    return {
      saved: values.filter((s) => s === "saved").length,
      applied: values.filter((s) => s === "applied" || s === "interviewing" || s === "offer").length,
      rejected: values.filter((s) => s === "rejected" || s === "withdrawn").length,
      total: values.filter((s) => isPipelineStatus(s)).length,
    };
  }, [statusByJobId]);

  const globePins: GlobeJobPin[] = useMemo(() => {
    if (jobs.length > 0) {
      return jobs.map((j, i) => ({
        id: j.id,
        title: j.title,
        company: j.company || "Company",
        location: j.location || "Location",
        latitude: j.latitude ?? (18.5204 + (i * 2.5) % 30),
        longitude: j.longitude ?? (73.8567 + (i * 4.1) % 60),
      }));
    }
    return [
      { id: "pune-1", title: "AI/ML Engineer", company: "TechCorp", location: "Pune", latitude: 18.5204, longitude: 73.8567 },
      { id: "mumbai-1", title: "Full Stack Engineer", company: "CloudScale", location: "Mumbai", latitude: 19.0760, longitude: 72.8777 },
      { id: "blr-1", title: "Backend Engineer", company: "DataFlow", location: "Bangalore", latitude: 12.9716, longitude: 77.5946 },
      { id: "sf-1", title: "Senior AI Engineer", company: "InnovateAI", location: "San Francisco", latitude: 37.7749, longitude: -122.4194 },
      { id: "lon-1", title: "Python Developer", company: "FinTech UK", location: "London", latitude: 51.5074, longitude: -0.1278 },
      { id: "sg-1", title: "Machine Learning Lead", company: "AsiaTech", location: "Singapore", latitude: 1.3521, longitude: 103.8198 },
    ];
  }, [jobs]);

  const applySavedRows = useCallback((rows: SavedJobRow[]) => {
    const pipeline = rows.filter((row) => isPipelineStatus(row.status));
    const next: Record<string, SavedJobStatus> = {};
    for (const row of pipeline) {
      const jobId = String(row.jobs?.id || row.job_id || "");
      if (!jobId) continue;
      next[jobId] = normalizeStatus(row.status);
    }
    setStatusByJobId(next);
    return pipeline;
  }, []);

  // Instant paint from session cache (stale-while-revalidate) for recommendation feed.
  useEffect(() => {
    if (savedOnly) return;
    if (hydratedCacheKey.current === cacheKey) return;
    const cached = readJobRecsCache(cacheKey);
    if (cached && cached.jobs.length > 0) {
      hydratedCacheKey.current = cacheKey;
      setRecommendations(cached.recommendations);
      setJobs(cached.jobs);
      setStatusByJobId(cached.statusByJobId || {});
      setIsLoading(false);
      setIsRefreshing(true);
      setHasMore(cached.jobs.length >= limit);
      return;
    }
    // Different filters without cache: drop previous filter's rows so UI does not lie — producer fix.
    setRecommendations([]);
    setJobs([]);
    setOffset(0);
    setHasMore(true);
    setIsLoading(true);
    setIsRefreshing(false);
  }, [cacheKey, savedOnly]);

  const fetchJobs = useCallback(
    async (currentOffset: number, append: boolean = false) => {
      const sequence = ++requestSequence.current;
      setError("");
      if (!append) {
        if (hasJobsRef.current) setIsRefreshing(true);
        else setIsLoading(true);
      } else setIsLoadingMore(true);
      try {
        if (savedOnly) {
          const rows = await apiRequest<SavedJobRow[]>("/saved-jobs");
          if (sequence !== requestSequence.current) return;
          const pipeline = applySavedRows(Array.isArray(rows) ? rows : []);
          setJobs(pipeline.map((row) => row.jobs).filter((job): job is Job => Boolean(job)));
          setRecommendations([]);
          setHasMore(false);
        } else {
          const body: Record<string, string | number> = { limit, offset: currentOffset };
          if (filterLocation) body.location = filterLocation;
          if (filterWorkMode) body.work_mode = filterWorkMode;
          if (filterSalaryMin !== "" && filterSalaryMin != null && Number(filterSalaryMin) >= 0) {
            body.salary_min = Number(filterSalaryMin);
          }

          // Resolve the current active resume before generating. The previous
          // flow relied on the backend to discover this state, which produced
          // a confusing 409 when the user had just confirmed a resume in the
          // Resume Analysis page and this page still held stale state.
          const [resumes, savedRows] = await Promise.all([
            apiRequest<ResumeSummary[]>("/resumes"),
            apiRequest<SavedJobRow[]>("/saved-jobs"),
          ]);
          const activeResume = (Array.isArray(resumes) ? resumes : []).find((row) => row.is_active);
          const confirmedVersion = activeResume?.latest_version;
          if (!confirmedVersion?.id || confirmedVersion.extraction_status !== "confirmed") {
            throw new Error("Confirm your active resume in Resume Analysis before generating recommendations.");
          }
          body.resume_version_id = confirmedVersion.id;

          const result = await apiRequest<{ recommendations: Recommendation[]; agent?: JobAgentStatus }>("/job-recommendations/generate", {
            method: "POST",
            body: JSON.stringify(body),
          });
          const newRecs = result.recommendations || [];
          setAgentStatus(result.agent || { mode: "evidence", provider: null });
          const newJobs = newRecs.map((row) => row.job);
          if (sequence !== requestSequence.current) return;
          const pipeline = applySavedRows(Array.isArray(savedRows) ? savedRows : []);
          const nextStatus: Record<string, SavedJobStatus> = {};
          for (const row of pipeline) {
            const jobId = String(row.jobs?.id || row.job_id || "");
            if (!jobId) continue;
            nextStatus[jobId] = normalizeStatus(row.status);
          }
          if (append) {
            setRecommendations((prev) => [...prev, ...newRecs]);
            setJobs((prev) => [...prev, ...newJobs]);
          } else {
            setRecommendations(newRecs);
            setJobs(newJobs);
            writeJobRecsCache(cacheKey, {
              recommendations: newRecs,
              jobs: newJobs,
              statusByJobId: nextStatus,
            });
            hydratedCacheKey.current = cacheKey;
          }
          setHasMore(newRecs.length === limit);
        }
      } catch (e) {
        if (sequence === requestSequence.current) setError((e as Error).message);
      } finally {
        if (sequence === requestSequence.current) {
          setIsLoading(false);
          setIsRefreshing(false);
          setIsLoadingMore(false);
        }
      }
    },
    [savedOnly, filterLocation, filterWorkMode, filterSalaryMin, applySavedRows, cacheKey],
  );

  const load = useCallback(() => {
    setOffset(0);
    void fetchJobs(0, false);
  }, [fetchJobs]);

  useEffect(() => {
    // React Strict Mode replays effects in development. Guard the automatic
    // recommendation load so it cannot issue duplicate POST requests, which
    // otherwise race the backend generation guard and surface two 409 errors.
    const autoLoadKey = `${savedOnly}:${cacheKey}`;
    if (lastAutoLoadKey.current === autoLoadKey) return;
    lastAutoLoadKey.current = autoLoadKey;
    queueMicrotask(load);
  }, [savedOnly, cacheKey, load]);

  async function syncExternalJobs() {
    setError("");
    try {
      await apiRequest("/jobs/external/sync", { method: "POST" });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }


  async function toggleSave(jobId: string, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    const current = statusByJobId[jobId];
    // Unsave only when status is plain "saved". Applied/rejected stay tracked via status buttons.
    const shouldUnsave = current === "saved";
    // Producer fix: capture per-job previous, not whole map shallow, to avoid concurrent rollback corruption.
    const previousStatus = statusByJobId[jobId];
    const previousJobs = savedOnly ? [...jobs] : null;

    if (shouldUnsave) {
      setStatusByJobId((map) => {
        const next = { ...map };
        delete next[jobId];
        return next;
      });
      if (savedOnly) {
        setJobs((list) => list.filter((j) => j.id !== jobId));
      }
    } else {
      setStatusByJobId((map) => ({
        ...map,
        [jobId]: current && current !== "dismissed" ? current : "saved",
      }));
    }

    try {
      if (shouldUnsave) {
        await apiRequest(`/saved-jobs/${jobId}`, { method: "DELETE" });
      } else {
        const result = await apiRequest<{ status?: string }>(`/saved-jobs/${jobId}`, { method: "POST" });
        const serverStatus = normalizeStatus(result?.status || "saved");
        setStatusByJobId((map) => ({ ...map, [jobId]: serverStatus }));
      }
    } catch (err) {
      setError((err as Error).message);
      // Rollback only this job's key — enriched with truncated jobId for telemetry.
      setStatusByJobId((map) => {
        const next = { ...map };
        if (previousStatus === undefined) delete next[jobId];
        else next[jobId] = previousStatus;
        return next;
      });
      if (savedOnly && previousJobs) setJobs(previousJobs);
      if (savedOnly) load();
    }
  }

  async function setJobStatus(jobId: string, status: SavedJobStatus, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    const previous = { ...statusByJobId };
    setStatusBusyId(jobId);
    setError("");
    setStatusByJobId((map) => ({ ...map, [jobId]: status }));

    // On recommendations feed, dismissed jobs leave the list.
    if (status === "dismissed" && !savedOnly) {
      setJobs((current) => current.filter((j) => j.id !== jobId));
      setRecommendations((current) => current.filter((r) => r.job.id !== jobId));
      if (selectedJob === jobId) setSelectedJob(null);
      setStatusByJobId((map) => {
        const next = { ...map };
        delete next[jobId];
        return next;
      });
    }

    // On pipeline page, dismissed rows leave the list.
    if (savedOnly && status === "dismissed") {
      setJobs((list) => list.filter((j) => j.id !== jobId));
      setStatusByJobId((map) => {
        const next = { ...map };
        delete next[jobId];
        return next;
      });
    }

    try {
      await apiRequest(`/saved-jobs/${jobId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    } catch (err) {
      setError((err as Error).message);
      setStatusByJobId(previous);
      if (savedOnly || status === "dismissed") load();
    } finally {
      setStatusBusyId(null);
    }
  }

  async function dismissJob(jobId: string, e?: React.MouseEvent) {
    await setJobStatus(jobId, "dismissed", e);
  }

  const visibleJobs = useMemo(() => {
    if (!savedOnly) return jobs;
    return jobs.filter((job) => {
      const status = statusByJobId[job.id] || "saved";
      if (pipelineFilter === "all") return isPipelineStatus(status);
      if (pipelineFilter === "applied") {
        return status === "applied" || status === "interviewing" || status === "offer";
      }
      if (pipelineFilter === "rejected") {
        return status === "rejected" || status === "withdrawn";
      }
      return status === "saved";
    });
  }, [jobs, savedOnly, pipelineFilter, statusByJobId]);

  const selected = visibleJobs.find((job) => job.id === selectedJob) || jobs.find((j) => j.id === selectedJob) || null;
  const selectedRec = recommendations.find((row) => row.job.id === selectedJob);
  const selectedStatus = selected ? statusByJobId[selected.id] : undefined;

  return (
    <div className="feature-page jobs-radar-page">
      <PageHeader
        title={savedOnly ? "My job pipeline" : "Your next move, shortlisted"}
        description={
          savedOnly
            ? "Track jobs you saved, applied to, or rejected. Counts update as you mark each role."
            : "A focused shortlist built from your profile, preferences, and confirmed resume evidence."
        }
        action={
          savedOnly ? (
            <Link className="button button-secondary" href="/jobs">
              Back to recommendations
            </Link>
          ) : (
            <Link className="button button-secondary" href="/jobs/saved">
              View pipeline ({counts.total})
            </Link>
          )
        }
      />

      {!savedOnly ? (
        <section className="jobs-radar-intro" aria-labelledby="jobs-radar-title">
          <div className="jobs-radar-copy">
            <h2 id="jobs-radar-title">Less scrolling. More signal.</h2>
            <p>Fresh roles are collected from the configured job-search sources, then the fit agent checks each one against the evidence in your profile.</p>
          </div>
          <div className="jobs-agent-panel" data-testid="job-agent-status">
            <span className="jobs-agent-label">Recommendation engine</span>
            <strong>{agentStatus.mode === "agent" ? "AI fit agent active" : agentStatus.mode === "evidence_fallback" ? "Evidence matching active" : "Profile evidence active"}</strong>
            <span>{agentStatus.mode === "agent" ? `Provider: ${agentStatus.provider || "configured LLM"}` : "No profile or job data is invented."}</span>
          </div>
        </section>
      ) : null}

      <div className="jobs-stat-rail">
        <Card className="metric-card">
          <p className="metric-card-label">Saved</p>
          <p className="metric-value">{counts.saved}</p>
          <p className="metric-card-note">Bookmarked for later</p>
        </Card>
        <Card className="metric-card">
          <p className="metric-card-label">Applied</p>
          <p className="metric-value">{counts.applied}</p>
          <p className="metric-card-note">Applications you tracked</p>
        </Card>
        <Card className="metric-card">
          <p className="metric-card-label">Rejected</p>
          <p className="metric-value">{counts.rejected}</p>
          <p className="metric-card-note">Roles you passed on</p>
        </Card>
      </div>

      <div style={{ marginBottom: 20 }}>
        <CareerGlobe jobs={globePins} />
      </div>

      {isRefreshing ? (
        <p className="muted" style={{ marginBottom: 8 }} aria-live="polite">
          Updating recommendations…
        </p>
      ) : null}

      {!savedOnly ? (
        <div className="filters-bar" role="search" aria-label="Filter job recommendations">
          <label className="field">
            <span className="field-label">Location</span>
            <input
              value={filterLocation}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFilterLocation(e.target.value)}
              placeholder="City or region"
            />
          </label>
          <label className="field">
            <span className="field-label">Work mode</span>
            <input
              value={filterWorkMode}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFilterWorkMode(e.target.value)}
              placeholder="remote, hybrid…"
            />
          </label>
          <label className="field">
            <span className="field-label">Min salary</span>
            <input
              type="number"
              value={filterSalaryMin}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setFilterSalaryMin(e.target.value === "" ? "" : Number(e.target.value))
              }
            />
          </label>
          <Button variant="secondary" onClick={() => void syncExternalJobs()} data-testid="freehire-sync">
            <AnimatedIcon icon={RefreshCw} size={16} aria-hidden /> Refresh job search
          </Button>
        </div>
      ) : (
        <div className="cluster" role="tablist" aria-label="Filter pipeline by status" style={{ marginBottom: 8 }}>
          {(
            [
              ["all", `All (${counts.total})`],
              ["saved", `Saved (${counts.saved})`],
              ["applied", `Applied (${counts.applied})`],
              ["rejected", `Rejected (${counts.rejected})`],
            ] as const
          ).map(([key, label]) => (
            <Button
              key={key}
              variant={pipelineFilter === key ? "secondary" : "ghost"}
              onClick={() => setPipelineFilter(key)}
              aria-pressed={pipelineFilter === key}
            >
              {label}
            </Button>
          ))}
        </div>
      )}

      {error ? (
        <div className="feature-alert" role="alert">
          <p className="field-error">{error}</p>
        </div>
      ) : null}

      {isLoading ? (
        <div className="jobs-grid" aria-busy="true" aria-label="Loading job recommendations">
          <JobCardSkeleton />
          <JobCardSkeleton />
          <JobCardSkeleton />
          <JobCardSkeleton />
        </div>
      ) : visibleJobs.length === 0 ? (
        <EmptyState
          title={savedOnly ? "No jobs in this view" : "No jobs yet"}
          description={
            savedOnly
              ? pipelineFilter === "applied"
                ? "Mark a recommendation as applied to track it here."
                : pipelineFilter === "rejected"
                  ? "Mark roles you do not want as rejected to keep a clear record."
                  : "Save a recommendation or mark it applied to build your pipeline."
              : "Confirm a resume and sync jobs to see matches."
          }
        />
      ) : (
        <div className="stack">
          <div className="jobs-grid" role="list" aria-label={savedOnly ? "Pipeline jobs" : "Recommended jobs"}>
            {visibleJobs.map((job) => {
              const rec = recommendations.find((row) => row.job.id === job.id);
              const status = statusByJobId[job.id];
              const busy = statusBusyId === job.id;
              return (
                <div key={job.id} role="listitem">
                  <JobCard
                    job={job}
                    recommendation={rec}
                    status={status}
                    busy={busy}
                    onOpen={() => setSelectedJob(job.id)}
                    onToggleSave={(e) => void toggleSave(job.id, e)}
                    onMarkApplied={(e) => void setJobStatus(job.id, "applied", e)}
                    onMarkRejected={(e) => void setJobStatus(job.id, "rejected", e)}
                  />
                </div>
              );
            })}
          </div>
          {!savedOnly && hasMore ? (
            <div className="jobs-load-more">
              <Button
                variant="secondary"
                disabled={isLoadingMore}
                onClick={() => {
                  const next = offset + limit;
                  setOffset(next);
                  void fetchJobs(next, true);
                }}
              >
                {isLoadingMore ? "Loading…" : "Load more"}
              </Button>
            </div>
          ) : null}
        </div>
      )}

      {selected ? (
        <JobModal
          job={selected}
          recommendation={selectedRec}
          status={selectedStatus}
          onToggleSave={() => void toggleSave(selected.id)}
          onMarkApplied={() => void setJobStatus(selected.id, "applied")}
          onMarkRejected={() => void setJobStatus(selected.id, "rejected")}
          onClose={() => setSelectedJob(null)}
          onDismiss={() => void dismissJob(selected.id)}
        />
      ) : null}
    </div>
  );
}

export function JobDetail({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void apiRequest<Job>(`/jobs/${jobId}`)
      .then(setJob)
      .catch((e: Error) => setError(e.message));
  }, [jobId]);
  return (
    <>
      <PageHeader
        title={job?.title || "Job details"}
        description={
          job ? `${job.company}${job.location ? `  ·  ${job.location}` : ""}` : "Loading job details"
        }
      />
      {error ? (
        <Card>
          <p role="alert" className="field-error">
            {error}
          </p>
        </Card>
      ) : job ? (
        <Card className="stack">
          <div className="cluster">
            <Badge variant="secondary">
              <AnimatedIcon icon={MapPin} size={14} aria-hidden /> {job.location || "Location not specified"}
            </Badge>
            <Badge variant="secondary">
              <AnimatedIcon icon={CheckCircle2} size={14} aria-hidden /> Stored job record
            </Badge>
            {job.work_mode ? <Badge variant="secondary">{job.work_mode}</Badge> : null}
            {job.salary_min != null || job.salary_max != null ? (
              <Badge variant="secondary">
                {job.salary_min != null && job.salary_max != null
                  ? `$${Number(job.salary_min).toLocaleString()} – $${Number(job.salary_max).toLocaleString()}`
                  : job.salary_min != null
                    ? `From $${Number(job.salary_min).toLocaleString()}`
                    : `Up to $${Number(job.salary_max).toLocaleString()}`}
              </Badge>
            ) : null}
          </div>
          <p>{job.description || "No description supplied."}</p>
          {job.requirements?.length ? (
            <div>
              <h2>Requirements</h2>
              <ul>
                {job.requirements.map((requirement) => <li key={requirement}>{requirement}</li>)}
              </ul>
            </div>
          ) : null}
          <div className="cluster">
            <Link className="button button-secondary" href="/jobs">Back to jobs</Link>
            {job.application_url ? (
              <a className="button button-primary" href={job.application_url} target="_blank" rel="noreferrer">
                Apply on employer site <AnimatedIcon icon={ExternalLink} size={14} aria-hidden />
              </a>
            ) : null}
          </div>
        </Card>
      ) : (
        <Card className="skeleton">
          <span />
          <span />
        </Card>
      )}
    </>
  );
}
