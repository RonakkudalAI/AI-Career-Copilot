import { dynamic } from "@/shared/dynamic";
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
import type { Job, Recommendation, SavedJobRow, SavedJobStatus } from "./job-types";
import { isPipelineStatus } from "./job-types";
import { jobRecsCacheKey, readJobRecsCache, writeJobRecsCache } from "../job-recs-cache";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/shared/ui/primitives";

export type { Job, Recommendation } from "./job-types";

const CareerGlobe = dynamic(() => import("@/features/jobs/components/career-globe"), {
  ssr: false,
  loading: () => <div className="globe-loading">Loading Earth map...</div>,
});

type PipelineFilter = "all" | "saved" | "applied" | "rejected";

function hasCoordinates(job: Job): boolean {
  return (
    typeof job.latitude === "number" &&
    Number.isFinite(job.latitude) &&
    typeof job.longitude === "number" &&
    Number.isFinite(job.longitude)
  );
}

function locationPinRank(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

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
  const limit = 20;
  const requestSequence = useRef(0);
  const hydratedCacheKey = useRef<string | null>(null);
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
      return;
    }
    // Different filters without cache: drop previous filter's rows so UI does not lie.
    setRecommendations([]);
    setJobs([]);
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
          const [result, savedRows] = await Promise.all([
            apiRequest<{ recommendations: Recommendation[] }>("/job-recommendations/generate", {
              method: "POST",
              body: JSON.stringify(body),
            }),
            apiRequest<SavedJobRow[]>("/saved-jobs"),
          ]);
          const newRecs = result.recommendations || [];
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
    queueMicrotask(load);
  }, [savedOnly, filterLocation, filterWorkMode, filterSalaryMin, load]);

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
    const previous = { ...statusByJobId };

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
      setStatusByJobId(previous);
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

  const globeJobs = useMemo(
    () =>
      visibleJobs
        .filter(hasCoordinates)
        .sort((a, b) => locationPinRank(a.id) - locationPinRank(b.id))
        .slice(0, 12)
        .map((job) => ({
          id: job.id,
          title: job.title,
          company: job.company,
          location: job.location,
          work_mode: job.work_mode,
          description: job.description,
          requirements: job.requirements,
          application_url: job.application_url,
          salary_min: job.salary_min,
          salary_max: job.salary_max,
          latitude: job.latitude as number,
          longitude: job.longitude as number,
        })),
    [visibleJobs],
  );

  const selected = visibleJobs.find((job) => job.id === selectedJob) || jobs.find((j) => j.id === selectedJob) || null;
  const selectedRec = recommendations.find((row) => row.job.id === selectedJob);
  const selectedStatus = selected ? statusByJobId[selected.id] : undefined;

  return (
    <div className="feature-page">
      <PageHeader
        eyebrow="Jobs"
        title={savedOnly ? "My job pipeline" : "Job recommendations"}
        description={
          savedOnly
            ? "Track jobs you saved, applied to, or rejected. Counts update as you mark each role."
            : "Recommendations are scored from confirmed resume evidence. Save roles, mark applied, or mark rejected as you go."
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

      <div className="grid-3" style={{ marginBottom: 8 }}>
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
          <Button variant="secondary" onClick={() => void syncExternalJobs()}>
            <RefreshCw size={16} aria-hidden /> Sync external jobs
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

      {globeJobs.length > 0 ? (
        <Card className="jobs-globe-card">
          <div className="jobs-globe">
            <CareerGlobe jobs={globeJobs} />
          </div>
        </Card>
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
        eyebrow="Job record"
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
              <MapPin size={14} aria-hidden /> {job.location || "Location not specified"}
            </Badge>
            <Badge variant="secondary">
              <CheckCircle2 size={14} aria-hidden /> Stored job record
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
                Apply on employer site <ExternalLink size={14} aria-hidden />
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
