import { useEffect, useMemo, useRef, useState } from "react";
import createGlobe from "cobe";
import { isWebGLAvailable, projectGlobePoint } from "./globe-utils";

export type GlobeJobPin = {
  id: string;
  title: string;
  company?: string;
  latitude: number;
  longitude: number;
};

export { isWebGLAvailable };

export default function CareerGlobe({ jobs = [] }: { jobs?: GlobeJobPin[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerRef = useRef({ x: 0, y: 0, active: false });
  const anglesRef = useRef({ phi: 0, theta: 0.2 });
  const [webgl, setWebgl] = useState(true);
  const [angles, setAngles] = useState({ phi: 0, theta: 0.2 });

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
        .slice(0, 40)
        .map((job) => ({
          location: [job.latitude, job.longitude] as [number, number],
          size: 0.05,
        })),
    [jobs],
  );

  const projected = useMemo(
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
        .map((job) => {
          const point = projectGlobePoint(job.latitude, job.longitude, angles.phi, angles.theta);
          return { ...job, ...point };
        })
        .filter((job) => job.visible),
    [jobs, angles.phi, angles.theta],
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
    let labelFrame = 0;
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
        anglesRef.current.phi += 0.003;
      }
      globe?.update({
        phi: anglesRef.current.phi,
        theta: anglesRef.current.theta,
        width: width * 2,
        height: width * 2,
        markers,
      });
      labelFrame += 1;
      if (labelFrame % 30 === 0) {
        setAngles({ phi: anglesRef.current.phi, theta: anglesRef.current.theta });
      }
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
      role="img"
      aria-label="Interactive globe of career opportunities"
      onPointerDown={(event) => {
        pointerRef.current = { x: event.clientX, y: event.clientY, active: true };
      }}
      onPointerUp={() => {
        pointerRef.current = { ...pointerRef.current, active: false };
      }}
      onPointerLeave={() => {
        pointerRef.current = { ...pointerRef.current, active: false };
      }}
      onPointerMove={(event) => {
        if (!pointerRef.current.active) return;
        const dx = event.clientX - pointerRef.current.x;
        const dy = event.clientY - pointerRef.current.y;
        anglesRef.current.phi += dx * 0.005;
        anglesRef.current.theta = Math.max(-0.8, Math.min(0.8, anglesRef.current.theta + dy * 0.003));
        pointerRef.current = { x: event.clientX, y: event.clientY, active: true };
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", maxWidth: 520, aspectRatio: "1 / 1", display: "block", margin: "0 auto" }}
      />
      <div className="globe-labels" aria-hidden>
        {projected.map((job) => (
          <span
            key={job.id}
            className="globe-label"
            style={{ left: `${job.x}%`, top: `${job.y}%`, opacity: job.depth > 0 ? 1 : 0.4 }}
          >
            {job.title}
          </span>
        ))}
      </div>
    </div>
  );
}
