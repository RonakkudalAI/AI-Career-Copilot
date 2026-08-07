import { useEffect, useMemo, useRef, useState } from "react";
import createGlobe from "cobe";
import { isWebGLAvailable } from "./globe-utils";

export type GlobeJobPin = {
  id: string;
  title: string;
  company: string;
  location?: string | null;
  work_mode?: string | null;
  description?: string | null;
  requirements?: string[];
  application_url?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  latitude: number;
  longitude: number;
};

export { isWebGLAvailable };

export default function CareerGlobe({ jobs = [] }: { jobs?: GlobeJobPin[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerRef = useRef({ x: 0, y: 0, active: false, pointerId: -1 });
  const velocityRef = useRef({ phi: 0, theta: 0 });
  const anglesRef = useRef({ phi: 0, theta: 0.2 });
  const [webgl, setWebgl] = useState(true);
  const [isDragging, setIsDragging] = useState(false);

  const markers = useMemo(
    () =>
      jobs
        .filter(
          (job) =>
            typeof job.latitude === "number" &&
            Number.isFinite(job.latitude) &&
            typeof job.longitude === "number" &&
            Number.isFinite(job.longitude),
        )
        .slice(0, 12)
        .map((job) => ({
          location: [job.latitude, job.longitude] as [number, number],
          size: 0.05,
        })),
    [jobs],
  );

  useEffect(() => {
    if (!isWebGLAvailable()) {
      setWebgl(false);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;

    let width = canvas.parentElement?.clientWidth || 480;
    const onResize = () => {
      width = canvas.parentElement?.clientWidth || 480;
    };
    window.addEventListener("resize", onResize);

    let globe: ReturnType<typeof createGlobe> | undefined;
    let frame = 0;
    try {
      globe = createGlobe(canvas, {
        devicePixelRatio: 2,
        width: width * 2,
        height: width * 2,
        phi: anglesRef.current.phi,
        theta: anglesRef.current.theta,
        dark: 1,
        diffuse: 1.2,
        mapSamples: 16000,
        mapBrightness: 6,
        baseColor: [0.12, 0.18, 0.28],
        markerColor: [0.35, 0.75, 1],
        glowColor: [0.2, 0.35, 0.55],
        markers,
      });
    } catch {
      setWebgl(false);
      window.removeEventListener("resize", onResize);
      return;
    }

    const animate = () => {
      if (!pointerRef.current.active) {
        anglesRef.current.phi += 0.003 + velocityRef.current.phi;
        anglesRef.current.theta = Math.max(
          -0.8,
          Math.min(0.8, anglesRef.current.theta + velocityRef.current.theta),
        );
        velocityRef.current.phi *= 0.94;
        velocityRef.current.theta *= 0.94;
        if (Math.abs(velocityRef.current.phi) < 0.00005) velocityRef.current.phi = 0;
        if (Math.abs(velocityRef.current.theta) < 0.00005) velocityRef.current.theta = 0;
      }
      globe?.update({
        phi: anglesRef.current.phi,
        theta: anglesRef.current.theta,
        width: width * 2,
        height: width * 2,
        markers,
      });
      frame = window.requestAnimationFrame(animate);
    };
    frame = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      globe?.destroy();
    };
  }, [markers]);

  if (!webgl) {
    return (
      <div className="globe-fallback" data-testid="career-globe" role="img" aria-label="Career opportunity map unavailable">
        <p className="muted">Interactive globe requires WebGL in this browser.</p>
        <ul className="stack" style={{ margin: 0, paddingLeft: 18 }}>
          {jobs.slice(0, 5).map((job) => (
            <li key={job.id}>
              {job.title}
              {job.company ? ` · ${job.company}` : ""}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div
      className="globe-stage"
      data-testid="career-globe"
      role="application"
      aria-label="Interactive globe of career opportunities. Drag to rotate the globe."
      style={{ touchAction: "none", cursor: isDragging ? "grabbing" : "grab" }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        pointerRef.current = { x: event.clientX, y: event.clientY, active: true, pointerId: event.pointerId };
        velocityRef.current = { phi: 0, theta: 0 };
        setIsDragging(true);
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        pointerRef.current = { ...pointerRef.current, active: false, pointerId: -1 };
        setIsDragging(false);
      }}
      onPointerCancel={() => {
        pointerRef.current = { ...pointerRef.current, active: false, pointerId: -1 };
        setIsDragging(false);
      }}
      onPointerMove={(event) => {
        if (!pointerRef.current.active) return;
        const dx = event.clientX - pointerRef.current.x;
        const dy = event.clientY - pointerRef.current.y;
        const phiVelocity = dx * 0.005;
        const thetaVelocity = dy * 0.003;
        anglesRef.current.phi += phiVelocity;
        anglesRef.current.theta = Math.max(-0.8, Math.min(0.8, anglesRef.current.theta + thetaVelocity));
        velocityRef.current = { phi: phiVelocity, theta: thetaVelocity };
        pointerRef.current = { ...pointerRef.current, x: event.clientX, y: event.clientY };
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", maxWidth: 520, aspectRatio: "1 / 1", display: "block", margin: "0 auto", pointerEvents: "none" }}
      />
      {/* Native Cobe markers are the only globe pins; details remain in the job list below. */}
      {/*
        <div
          className="globe-job-preview"
          role="status"
          onMouseEnter={() => setHoveredJobId(hoveredJob.id)}
          onMouseLeave={() => setHoveredJobId(null)}
        >
          <strong>{hoveredJob.title}</strong>
          <span>{hoveredJob.company}</span>
          {hoveredJob.location ? <span>{hoveredJob.location}</span> : null}
          {hoveredJob.work_mode ? <span>{hoveredJob.work_mode}</span> : null}
          {hoveredJob.salary_min || hoveredJob.salary_max ? (
            <span>
              {hoveredJob.salary_min && hoveredJob.salary_max
                ? `$${hoveredJob.salary_min.toLocaleString()} – $${hoveredJob.salary_max.toLocaleString()}`
                : hoveredJob.salary_min
                  ? `From $${hoveredJob.salary_min.toLocaleString()}`
                  : `Up to $${hoveredJob.salary_max?.toLocaleString()}`}
            </span>
          ) : null}
          {hoveredJob.description ? <p>{hoveredJob.description}</p> : null}
          {hoveredJob.requirements?.length ? (
            <ul>
              {hoveredJob.requirements.slice(0, 5).map((requirement) => (
                <li key={requirement}>{requirement}</li>
              ))}
            </ul>
          ) : null}
          {hoveredJob.application_url ? (
            <a href={hoveredJob.application_url} target="_blank" rel="noreferrer">
              View full job
            </a>
          ) : null}
        </div>
      */}
    </div>
  );
}
