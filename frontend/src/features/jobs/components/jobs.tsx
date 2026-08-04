"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, CheckCircle2, MapPin, RefreshCw } from "lucide-react";
import { apiRequest } from "@/shared/api/client";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/shared/ui/primitives";

const CareerGlobe = dynamic(() => import("@/features/jobs/components/career-globe"), { ssr: false, loading: () => <div className="globe-loading">Loading Earth map…</div> });

type Job = { id: string; title: string; company: string; location?: string | null; work_mode?: string | null; description?: string | null; requirements?: string[]; application_url?: string | null; latitude?: number | null; longitude?: number | null };
type Recommendation = { id: string; job: Job; match_score: number; match_breakdown?: { matched_requirements?: string[]; missing_requirements?: string[] }; evidence?: { note?: string } };

function hasCoordinates(job: Job): boolean { return typeof job.latitude === "number" && Number.isFinite(job.latitude) && typeof job.longitude === "number" && Number.isFinite(job.longitude); }
function locationPinRank(id: string): number { let hash = 2166136261; for (let index = 0; index < id.length; index += 1) { hash ^= id.charCodeAt(index); hash = Math.imul(hash, 16777619); } return hash >>> 0; }

export function JobsHome({ savedOnly = false }: { savedOnly?: boolean }) {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]); const [jobs, setJobs] = useState<Job[]>([]); const [error, setError] = useState(""); const [saved, setSaved] = useState<Set<string>>(new Set());
  const loadedMode = useRef<string | null>(null);
  const load = useCallback(async () => {
    setError("");
    try {
      if (savedOnly) { const rows = await apiRequest<Array<{ jobs?: Job | null }>>("/saved-jobs"); setJobs(rows.map((row) => row.jobs).filter((job): job is Job => Boolean(job))); return; }
      const result = await apiRequest<{ recommendations: Recommendation[] }>("/job-recommendations/generate", { method: "POST", body: JSON.stringify({ limit: 20 }) });
      setRecommendations(result.recommendations || []); setJobs((result.recommendations || []).map((row) => row.job)); setSaved(new Set());
    } catch (e) { setError((e as Error).message); }
  }, [savedOnly]);
  useEffect(() => {
    const mode = savedOnly ? "saved" : "recommendations";
    if (loadedMode.current === mode) return;
    loadedMode.current = mode;
    void (async () => {
      setError("");
      try {
        if (savedOnly) {
          const rows = await apiRequest<Array<{ jobs?: Job | null }>>("/saved-jobs");
          if (loadedMode.current === mode) setJobs(rows.map((row) => row.jobs).filter((job): job is Job => Boolean(job)));
          return;
        }
        const result = await apiRequest<{ recommendations: Recommendation[] }>("/job-recommendations/generate", { method: "POST", body: JSON.stringify({ limit: 20 }) });
        if (loadedMode.current === mode) { setRecommendations(result.recommendations || []); setJobs((result.recommendations || []).map((row) => row.job)); setSaved(new Set()); }
      } catch (e) { if (loadedMode.current === mode) setError((e as Error).message); }
    })();
  }, [savedOnly]);
  async function toggleSave(jobId: string) { const isSaved = saved.has(jobId); setSaved((current) => { const next = new Set(current); if (isSaved) next.delete(jobId); else next.add(jobId); return next; }); try { await apiRequest(`/saved-jobs/${jobId}`, { method: isSaved ? "DELETE" : "POST" }); } catch (e) { setError((e as Error).message); setSaved((current) => { const next = new Set(current); if (isSaved) next.add(jobId); else next.delete(jobId); return next; }); } }
  const globeJobs = useMemo(() => jobs.filter(hasCoordinates).sort((a, b) => locationPinRank(a.id) - locationPinRank(b.id)).slice(0, 12).map((job) => ({ id: job.id, title: job.title, company: job.company, latitude: job.latitude as number, longitude: job.longitude as number })), [jobs]);
  const recommendationByJob = useMemo(() => new Map(recommendations.map((row) => [row.job.id, row])), [recommendations]);
  return <>
    <PageHeader eyebrow="Jobs" title={savedOnly ? "Saved jobs" : "Recommended jobs"} description={savedOnly ? "Track roles you saved for later." : "Ranked from active job records against confirmed resume evidence."} action={!savedOnly && <Button variant="secondary" onClick={load}><RefreshCw size={17} aria-hidden /> Refresh matches</Button>} />
    {error && <Card><p role="alert" className="field-error">{error}</p></Card>}
    {globeJobs.length > 0 && <Card className="jobs-globe-card"><div><span className="mono">Verified job locations</span><h2>Where opportunities are located</h2><p className="muted">Pins come only from job records with valid coordinates.</p></div><div className="jobs-globe"><CareerGlobe jobs={globeJobs} /></div></Card>}
    {jobs.length === 0 && !error ? <EmptyState title={savedOnly ? "No saved jobs yet" : "No recommendations yet"} description={savedOnly ? "Jobs you save will appear here." : "Activate and confirm a resume, then ensure active job records exist."} /> : <div className="grid-2">{jobs.map((job) => { const recommendation = recommendationByJob.get(job.id); return <Card key={job.id} as="article"><div className="row"><div><h2>{job.title}</h2><p>{job.company}{job.location ? ` · ${job.location}` : ""}</p></div>{recommendation && <Badge tone={recommendation.match_score >= 70 ? "success" : recommendation.match_score >= 45 ? "warning" : "info"}>{recommendation.match_score}% match</Badge>}</div><p>{job.description || "No description supplied."}</p>{recommendation?.match_breakdown?.matched_requirements?.length ? <p className="muted">Evidence found: {recommendation.match_breakdown.matched_requirements.join(", ")}</p> : null}{recommendation?.match_breakdown?.missing_requirements?.length ? <p className="muted">Not found in resume: {recommendation.match_breakdown.missing_requirements.join(", ")}</p> : null}<div className="cluster"><Button variant="secondary" onClick={() => toggleSave(job.id)}><Bookmark size={17} aria-hidden fill={saved.has(job.id) ? "currentColor" : "none"} />{saved.has(job.id) ? "Saved" : "Save job"}</Button>{job.application_url && <a className="button button-primary" href={job.application_url} target="_blank" rel="noreferrer">Apply</a>}</div></Card>; })}</div>}
  </>;
}

export function JobDetail({ jobId }: { jobId: string }) { const [job, setJob] = useState<Job | null>(null); const [error, setError] = useState(""); useEffect(() => { apiRequest<Job>(`/jobs/${jobId}`).then(setJob).catch((e: Error) => setError(e.message)); }, [jobId]); return <><PageHeader eyebrow="Job record" title={job?.title || "Job details"} description={job ? `${job.company}${job.location ? ` · ${job.location}` : ""}` : "Loading job details"} />{error ? <Card><p role="alert" className="field-error">{error}</p></Card> : job ? <Card><div className="cluster"><Badge tone="info"><MapPin size={14} aria-hidden /> {job.location || "Location not specified"}</Badge><Badge tone="success"><CheckCircle2 size={14} aria-hidden /> Stored job record</Badge></div><p>{job.description || "No description supplied."}</p></Card> : <Card className="skeleton"><span /><span /></Card>}</>; }
