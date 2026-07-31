"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Button, Card, PageHeader } from "@/components/ui/primitives";
import { apiRequest } from "@/lib/api/client";

const CareerGlobe = dynamic(() => import("@/features/marketing/career-globe"), {
  ssr: false,
  loading: () => <div className="globe-loading">Loading Earth map…</div>,
});

type Job = {
  id: string;
  title: string;
  company: string;
  location?: string | null;
  work_mode?: string | null;
  description?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};
type SavedJobRow = { jobs?: Job | null };

function hasCoordinates(job: Job): boolean {
  return (
    typeof job.latitude === "number" &&
    Number.isFinite(job.latitude) &&
    job.latitude >= -90 &&
    job.latitude <= 90 &&
    typeof job.longitude === "number" &&
    Number.isFinite(job.longitude) &&
    job.longitude >= -180 &&
    job.longitude <= 180
  );
}

export function JobsHome({ savedOnly = false }: { savedOnly?: boolean }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    apiRequest<Job[] | SavedJobRow[]>(savedOnly ? "/saved-jobs" : "/jobs")
      .then((rows) => {
        if (savedOnly) {
          setJobs((rows as SavedJobRow[]).map((row) => row.jobs).filter((job): job is Job => Boolean(job)));
        } else {
          setJobs(rows as Job[]);
        }
      })
      .catch((e: Error) => setError(e.message));
  }, [savedOnly]);

  async function save(id: string) {
    try {
      await apiRequest(`/saved-jobs/${id}`, { method: "POST" });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const globeJobs = jobs
    .filter(hasCoordinates)
    .slice(0, 12)
    .map((job) => ({
      id: job.id,
      title: job.title,
      company: job.company,
      latitude: job.latitude as number,
      longitude: job.longitude as number,
    }));

  return (
    <>
      <PageHeader
        eyebrow="Jobs"
        title={savedOnly ? "Saved jobs" : "Available jobs"}
        description="Browse roles available in your account. Only real listings from your workspace appear here."
      />
      {error && <p role="alert" className="field-error">{error}</p>}
      {globeJobs.length > 0 ? (
        <Card className="jobs-globe-card">
          <div>
            <span className="mono">Verified job locations</span>
            <h2>Where opportunities are located</h2>
            <p className="muted">Pins come only from job records with valid latitude and longitude values.</p>
          </div>
          <div className="jobs-globe">
            <CareerGlobe jobs={globeJobs} />
          </div>
        </Card>
      ) : null}
      <div className="grid-2">
        {jobs.map((job) => (
          <Card key={job.id}>
            <h2>{job.title}</h2>
            <p>{job.company}{job.location ? ` · ${job.location}` : ""}</p>
            <p>{job.description || "No description supplied."}</p>
            {!savedOnly && <Button onClick={() => save(job.id)}>Save job</Button>}
          </Card>
        ))}
      </div>
      {!error && jobs.length === 0 ? (
        <Card className="empty-state">
          <h2>No {savedOnly ? "saved " : ""}jobs yet</h2>
          <p>{savedOnly ? "Jobs you save will appear here." : "An administrator or ingestion service must add real jobs before they appear."}</p>
        </Card>
      ) : null}
    </>
  );
}

export function JobDetail({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiRequest<Job>(`/jobs/${jobId}`).then(setJob).catch((e: Error) => setError(e.message));
  }, [jobId]);

  return (
    <>
      <PageHeader
        eyebrow="Job record"
        title={job?.title || "Job details"}
        description={job ? `${job.company}${job.location ? ` · ${job.location}` : ""}` : "Loading job details"}
      />
      {error ? <Card><p role="alert">{error}</p></Card> : <Card><p>{job?.description || "No description supplied."}</p></Card>}
    </>
  );
}
