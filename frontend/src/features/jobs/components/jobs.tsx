import { dynamic } from "@/shared/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, RefreshCw, MapPin, CheckCircle2, Building2, Briefcase } from "lucide-react";
import { apiRequest } from "@/shared/api/client";
import { JobCardSkeleton } from "./job-card-skeleton";
import { JobModal } from "./job-modal";
import type { Job, Recommendation } from "./job-types";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/shared/ui/primitives";

export type { Job, Recommendation } from "./job-types";

const CareerGlobe = dynamic(() => import("@/features/jobs/components/career-globe"), {
  ssr: false,
  loading: () => <div className="globe-loading">Loading Earth map...</div>,
});

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

export function JobsHome({ savedOnly = false }: { savedOnly?: boolean }) {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [filterLocation, setFilterLocation] = useState("");
  const [filterWorkMode, setFilterWorkMode] = useState("");
  const [filterSalaryMin, setFilterSalaryMin] = useState<number | "">("");
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const limit = 20;
  const requestSequence = useRef(0);

  const fetchJobs = useCallback(
    async (currentOffset: number, append: boolean = false) => {
      const sequence = ++requestSequence.current;
      setError("");
      if (!append) setIsLoading(true);
      else setIsLoadingMore(true);
      try {
        if (savedOnly) {
          const rows = await apiRequest<Array<{ jobs?: Job | null }>>("/saved-jobs");
          if (sequence !== requestSequence.current) return;
          setSaved(new Set(rows.map((row) => row.jobs?.id).filter((id): id is string => Boolean(id))));
          setJobs(rows.map((row) => row.jobs).filter((job): job is Job => Boolean(job)));
          setHasMore(false);
        } else {
          const body: Record<string, string | number> = { limit, offset: currentOffset };
          if (filterLocation) body.location = filterLocation;
          if (filterWorkMode) body.work_mode = filterWorkMode;
          if (filterSalaryMin) body.salary_min = filterSalaryMin;
          const [result, savedRows] = await Promise.all([
            apiRequest<{ recommendations: Recommendation[] }>("/job-recommendations/generate", {
              method: "POST",
              body: JSON.stringify(body),
            }),
            apiRequest<Array<{ jobs?: Job | null }>>("/saved-jobs"),
          ]);
          const newRecs = result.recommendations || [];
          const newJobs = newRecs.map((row) => row.job);
          if (sequence !== requestSequence.current) return;
          setSaved(
            new Set(savedRows.map((row) => row.jobs?.id).filter((id): id is string => Boolean(id))),
          );
          if (append) {
            setRecommendations((prev) => [...prev, ...newRecs]);
            setJobs((prev) => [...prev, ...newJobs]);
          } else {
            setRecommendations(newRecs);
            setJobs(newJobs);
          }
          setHasMore(newRecs.length === limit);
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [savedOnly, filterLocation, filterWorkMode, filterSalaryMin],
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
    const isSaved = saved.has(jobId);
    setSaved((current) => {
      const next = new Set(current);
      if (isSaved) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
    try {
      await apiRequest(`/saved-jobs/${jobId}`, { method: isSaved ? "DELETE" : "POST" });
    } catch (err) {
      setError((err as Error).message);
      setSaved((current) => {
        const next = new Set(current);
        if (isSaved) next.add(jobId);
        else next.delete(jobId);
        return next;
      });
    }
  }

  async function dismissJob(jobId: string, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    setJobs((current) => current.filter((j) => j.id !== jobId));
    setRecommendations((current) => current.filter((r) => r.job.id !== jobId));
    if (selectedJob === jobId) setSelectedJob(null);
    try {
      await apiRequest(`/saved-jobs/${jobId}`, { method: "POST" }).catch(() => undefined);
      await apiRequest(`/saved-jobs/${jobId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "dismissed" }),
      });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const globeJobs = useMemo(
    () =>
      jobs
        .filter(hasCoordinates)
        .sort((a, b) => locationPinRank(a.id) - locationPinRank(b.id))
        .slice(0, 12)
        .map((job) => ({
          id: job.id,
          title: job.title,
          country: job.location || job.company,
          company: job.company,
          latitude: job.latitude as number,
          longitude: job.longitude as number,
        })),
    [jobs],
  );

  const selected = jobs.find((job) => job.id === selectedJob) || null;
  const selectedRec = recommendations.find((row) => row.job.id === selectedJob);

  return (
    <>
      <PageHeader
        eyebrow="Jobs"
        title={savedOnly ? "Saved jobs" : "Job recommendations"}
        description="Recommendations are scored from confirmed resume evidence only."
      />
      {!savedOnly ? (
        <div className="cluster" style={{ marginBottom: 16 }}>
          <label className="field">
            <span className="field-label">Location</span>
            <input
              value={filterLocation}
              onChange={(e: any) => setFilterLocation(e.target.value)}
              placeholder="City or region"
            />
          </label>
          <label className="field">
            <span className="field-label">Work mode</span>
            <input
              value={filterWorkMode}
              onChange={(e: any) => setFilterWorkMode(e.target.value)}
              placeholder="remote, hybrid…"
            />
          </label>
          <label className="field">
            <span className="field-label">Min salary</span>
            <input
              type="number"
              value={filterSalaryMin}
              onChange={(e: any) =>
                setFilterSalaryMin(e.target.value === "" ? "" : Number(e.target.value))
              }
            />
          </label>
          <Button variant="secondary" onClick={() => void syncExternalJobs()}>
            <RefreshCw size={16} aria-hidden /> Sync external jobs
          </Button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="field-error">
          {error}
        </p>
      ) : null}
      {globeJobs.length > 0 ? (
        <Card className="jobs-globe-card">
          <div>
            <span className="mono">Verified job locations</span>
            <h2>Where opportunities are located</h2>
            <p className="muted">Pins come only from job records with valid coordinates.</p>
          </div>
          <div className="jobs-globe">
            <CareerGlobe jobs={globeJobs} />
          </div>
        </Card>
      ) : null}
      {isLoading ? (
        <div className="stack">
          <JobCardSkeleton />
          <JobCardSkeleton />
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState
          title="No jobs yet"
          description={
            savedOnly
              ? "Save a recommendation to build this list."
              : "Confirm a resume and sync jobs to see matches."
          }
        />
      ) : (
        <div className="stack">
          {jobs.map((job) => {
            const rec = recommendations.find((row) => row.job.id === job.id);
            return (
              <Card key={job.id} className="job-card" onClick={() => setSelectedJob(job.id)}>
                <div className="cluster" style={{ justifyContent: "space-between" }}>
                  <div>
                    <h3 style={{ margin: 0 }}>{job.title}</h3>
                    <p className="muted" style={{ margin: "4px 0 0" }}>
                      <Building2 size={14} aria-hidden /> {job.company}
                      {job.location ? (
                        <>
                          {" · "}
                          <MapPin size={14} aria-hidden /> {job.location}
                        </>
                      ) : null}
                    </p>
                  </div>
                  <div className="cluster">
                    {rec ? (
                      <Badge variant="secondary">
                        <CheckCircle2 size={14} aria-hidden /> {Math.round(rec.match_score)}%
                      </Badge>
                    ) : null}
                    {job.work_mode ? (
                      <Badge variant="secondary">
                        <Briefcase size={14} aria-hidden /> {job.work_mode}
                      </Badge>
                    ) : null}
                    <Button
                      variant="secondary"
                      onClick={(e: any) => void toggleSave(job.id, e)}
                      aria-label={saved.has(job.id) ? "Unsave job" : "Save job"}
                    >
                      <Bookmark size={16} />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
          {!savedOnly && hasMore ? (
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
          ) : null}
        </div>
      )}
      {selected ? (
        <JobModal
          job={selected}
          recommendation={selectedRec}
          isSaved={saved.has(selected.id)}
          onToggleSave={() => void toggleSave(selected.id)}
          onClose={() => setSelectedJob(null)}
          onDismiss={() => void dismissJob(selected.id)}
        />
      ) : null}
    </>
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
          job ? `${job.company}${job.location ? `  -  ${job.location}` : ""}` : "Loading job details"
        }
      />
      {error ? (
        <Card>
          <p role="alert" className="field-error">
            {error}
          </p>
        </Card>
      ) : job ? (
        <Card>
          <div className="cluster">
            <Badge variant="secondary">
              <MapPin size={14} aria-hidden /> {job.location || "Location not specified"}
            </Badge>
            <Badge variant="secondary">
              <CheckCircle2 size={14} aria-hidden /> Stored job record
            </Badge>
          </div>
          <p>{job.description || "No description supplied."}</p>
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
