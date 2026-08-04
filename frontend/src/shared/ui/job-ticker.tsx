"use client";

import { useId, useState } from "react";
import Link from "next/link";

export interface JobSignal {
  id: string;
  role: string;
  location: string;
  mode: string;
  skills: string[];
  /** When set, the card is a real navigable link. Illustrative cards omit this. */
  href?: string;
}

const defaultJobs: JobSignal[] = [
  { id: "1", role: "AI Engineer", location: "Bengaluru", mode: "Hybrid", skills: ["Python", "PyTorch", "AWS"] },
  { id: "2", role: "Data Analyst", location: "London", mode: "On-site", skills: ["SQL", "Tableau", "Python"] },
  { id: "3", role: "Backend Engineer", location: "Berlin", mode: "Remote", skills: ["Go", "PostgreSQL", "Docker"] },
  { id: "4", role: "Product Designer", location: "Toronto", mode: "Hybrid", skills: ["Figma", "UX Research"] },
  { id: "5", role: "ML Engineer", location: "Singapore", mode: "On-site", skills: ["TensorFlow", "C++", "CUDA"] },
  { id: "6", role: "Cloud Engineer", location: "Sydney", mode: "Remote", skills: ["AWS", "Terraform", "Kubernetes"] },
];

export function JobTicker({ jobs = defaultJobs }: { jobs?: JobSignal[] }) {
  const [paused, setPaused] = useState(false);
  const headingId = useId();
  const mid = Math.ceil(jobs.length / 2);
  const row1Jobs = jobs.slice(0, mid);
  const row2Jobs = jobs.slice(mid);

  return (
    <section className="job-ticker-section section" aria-labelledby={headingId}>
      <div className="container">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "16px",
            flexWrap: "wrap",
            marginBottom: "32px",
          }}
        >
          <h2
            id={headingId}
            className="text-center"
            style={{ fontSize: "var(--text-lg)", margin: 0, textAlign: "center" }}
          >
            Illustrative global roles — opportunity patterns, not live openings.
          </h2>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setPaused((p) => !p)}
            aria-pressed={paused}
            style={{ minHeight: 36, padding: "6px 12px", fontSize: "var(--text-xs)" }}
          >
            {paused ? "Resume motion" : "Pause motion"}
          </button>
        </div>
      </div>

      <div
        className={`ticker-container${paused ? " is-paused" : ""}`}
        style={{ overflow: "hidden", display: "grid", gap: "16px", padding: "10px 0" }}
        aria-label="Illustrative global roles carousel"
      >
        <div className="ticker-row row-left" style={{ display: "flex", gap: "16px", width: "max-content" }}>
          <TickerTrack items={row1Jobs} />
        </div>
        <div className="ticker-row row-right" style={{ display: "flex", gap: "16px", width: "max-content" }}>
          <TickerTrack items={row2Jobs} />
        </div>
      </div>

      <style>{`
        .ticker-row {
          animation: slide-left 40s linear infinite;
        }
        .ticker-row.row-right {
          animation: slide-right 40s linear infinite;
          transform: translateX(-50%);
        }
        .ticker-container.is-paused .ticker-row,
        .ticker-row:hover,
        .ticker-row:focus-within {
          animation-play-state: paused;
        }
        @keyframes slide-left {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes slide-right {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }
        .job-card-mini {
          padding: 16px 20px;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--surface);
          min-width: 320px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          box-shadow: var(--shadow-sm);
          color: inherit;
          text-decoration: none;
        }
        a.job-card-mini:hover,
        a.job-card-mini:focus-visible {
          border-color: var(--primary-strong);
          box-shadow: var(--shadow-md);
        }
        .job-card-mini h3 { margin: 0; font-size: var(--text-md); color: var(--ink); }
        .job-card-meta { display: flex; gap: 8px; font-size: var(--text-xs); color: var(--muted); font-family: var(--font-code); text-transform: uppercase; }
        .job-card-skills { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
        .job-card-skills span { background: var(--background-subtle); padding: 2px 8px; border-radius: 999px; font-size: var(--text-xs); color: var(--primary-strong); border: 1px solid var(--border); }
        @media (prefers-reduced-motion: reduce) {
          .ticker-row, .ticker-row.row-right {
            animation: none;
            transform: none !important;
            flex-wrap: wrap;
            width: 100%;
            justify-content: center;
          }
          .ticker-container { overflow: visible; padding: 20px; }
        }
      `}</style>
    </section>
  );
}

function TickerTrack({ items }: { items: JobSignal[] }) {
  const renderItems = (isDuplicate = false) =>
    items.map((job) => {
      const content = (
        <>
          <h3>{job.role}</h3>
          <div className="job-card-meta">
            <span>{job.location}</span>
            <span aria-hidden>•</span>
            <span>{job.mode}</span>
          </div>
          <div className="job-card-skills">
            {job.skills.map((skill) => (
              <span key={skill}>{skill}</span>
            ))}
          </div>
        </>
      );

      // FE-007: non-actionable illustrative cards are not keyboard stops.
      // Actionable cards use a real link with meaningful accessible name.
      if (job.href && !isDuplicate) {
        return (
          <Link
            key={job.id}
            href={job.href}
            className="job-card-mini"
            aria-label={`${job.role} in ${job.location}, ${job.mode}`}
          >
            {content}
          </Link>
        );
      }

      return (
        <div
          key={isDuplicate ? `dup-${job.id}` : job.id}
          className="job-card-mini"
          aria-hidden={isDuplicate || undefined}
        >
          {content}
        </div>
      );
    });

  return (
    <>
      {renderItems(false)}
      {renderItems(true)}
    </>
  );
}
