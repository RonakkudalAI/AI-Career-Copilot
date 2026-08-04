"use client";

import createGlobe from "cobe";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/shared/utils";

type GlobeJob = {
  id: string;
  role: string;
  city: string;
  location: [number, number];
};

const JOBS: GlobeJob[] = [
  { id: "bengaluru", role: "AI Engineer", city: "Bengaluru", location: [12.9716, 77.5946] },
  { id: "berlin", role: "Backend Engineer", city: "Berlin", location: [52.52, 13.405] },
  { id: "toronto", role: "Product Designer", city: "Toronto", location: [43.6532, -79.3832] },
  { id: "singapore", role: "ML Engineer", city: "Singapore", location: [1.3521, 103.8198] },
  { id: "sydney", role: "Cloud Engineer", city: "Sydney", location: [-33.8688, 151.2093] },
  { id: "london", role: "Data Analyst", city: "London", location: [51.5072, -0.1276] },
];

const GLOBE_MARKERS = JOBS.map((job) => ({ location: job.location, size: 0.035, id: job.id }));

export function Globe({ className, speed = 0.003 }: { className?: string; speed?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const dragOffset = useRef({ phi: 0, theta: 0 });
  const rotationOffset = useRef({ phi: 0, theta: 0 });
  const paused = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const finishPointerInteraction = useCallback(() => {
    if (pointerStart.current) {
      rotationOffset.current.phi += dragOffset.current.phi;
      rotationOffset.current.theta += dragOffset.current.theta;
      dragOffset.current = { phi: 0, theta: 0 };
    }
    pointerStart.current = null;
    paused.current = false;
    if (canvasRef.current) canvasRef.current.style.cursor = "grab";
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (!pointerStart.current) return;
      dragOffset.current = {
        phi: (event.clientX - pointerStart.current.x) / 300,
        theta: (event.clientY - pointerStart.current.y) / 1000,
      };
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerup", finishPointerInteraction, { passive: true });
    window.addEventListener("pointercancel", finishPointerInteraction, { passive: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishPointerInteraction);
      window.removeEventListener("pointercancel", finishPointerInteraction);
    };
  }, [finishPointerInteraction]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let globe: ReturnType<typeof createGlobe> | null = null;
    let animationFrame = 0;
    let phi = 0;
    let resizeObserver: ResizeObserver | null = null;

    const init = () => {
      if (globe || canvas.offsetWidth === 0) return;
      const width = Math.min(canvas.offsetWidth, 440);
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

      globe = createGlobe(canvas, {
        devicePixelRatio: pixelRatio,
        width: width * pixelRatio,
        height: width * pixelRatio,
        phi: 0,
        theta: 0.18,
        dark: 0,
        diffuse: 1.15,
        mapSamples: 10000,
        mapBrightness: 3.2,
        baseColor: [1, 1, 1],
        markerColor: [0.09, 0.32, 0.66],
        glowColor: [0.86, 0.92, 1],
        markerElevation: 0.02,
        markers: GLOBE_MARKERS,
      });

      canvas.style.opacity = "1";
      const animate = () => {
        if (!paused.current) phi += speed;
        globe?.update({
          phi: phi + rotationOffset.current.phi + dragOffset.current.phi,
          theta: 0.18 + rotationOffset.current.theta + dragOffset.current.theta,
        });
        animationFrame = window.requestAnimationFrame(animate);
      };
      animate();
    };

    if (canvas.offsetWidth > 0) {
      init();
    } else if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => init());
      resizeObserver.observe(canvas);
    } else {
      // Test environments may not implement ResizeObserver; retry on the next frame.
      animationFrame = window.requestAnimationFrame(init);
    }

    return () => {
      resizeObserver?.disconnect();
      window.cancelAnimationFrame(animationFrame);
      globe?.destroy();
    };
  }, [speed]);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % JOBS.length);
    }, 2600);
    return () => window.clearInterval(timer);
  }, []);

  const activeJob = JOBS[activeIndex];

  return (
    <div className={cn("light-globe", className)} role="img" aria-label="Rotating globe showing illustrative job locations">
      <canvas
        ref={canvasRef}
        className="light-globe-canvas"
        onPointerDown={(event) => {
          pointerStart.current = { x: event.clientX, y: event.clientY };
          paused.current = true;
          canvasRef.current?.style.setProperty("cursor", "grabbing");
        }}
        onPointerUp={finishPointerInteraction}
        onPointerCancel={finishPointerInteraction}
      />
      <div className="light-globe-callout" aria-hidden="true">
        <span className="light-globe-job-role">{activeJob.role}</span>
        <span className="light-globe-job-city">{activeJob.city}</span>
      </div>
      <p className="sr-only" aria-live="polite">
        Showing {activeJob.role} in {activeJob.city}.
      </p>
    </div>
  );
}
