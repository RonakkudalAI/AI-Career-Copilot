"use client";

import { Html, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import React, { Component, ReactNode, useMemo, useRef, useState, useEffect } from "react";
import * as THREE from "three";
import { calculatePinLifecycle, PinLifecycleState } from "../utils/globe-lifecycle";

export { calculatePinLifecycle };
export type { PinLifecycleState };

export type GlobeJobPin = {
  id: string;
  title: string;
  company: string;
  latitude: number;
  longitude: number;
};

/**
 * WebGL context availability utility.
 */
export function isWebGLAvailable(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl");
    return !!gl;
  } catch {
    return false;
  }
}

/**
 * Error boundary catching R3F/Three.js rendering crashes.
 */
interface ErrorBoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class GlobeErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { hasError: false };

  public static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.warn("CareerGlobe Canvas rendering error caught by boundary:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

/**
 * Static SVG visual fallback component when WebGL is unsupported or encounters errors.
 */
export function GlobeFallback({ jobs = [] }: { jobs?: GlobeJobPin[] }) {
  const displayJobs = jobs;

  return (
    <div
      className="globe-fallback-container"
      role="img"
      aria-label="Static global opportunities visualization fallback"
    >
      <div className="globe-fallback-bg" />
      <svg viewBox="0 0 200 200" className="globe-fallback-svg" aria-hidden="true">
        <circle cx="100" cy="100" r="90" fill="none" stroke="currentColor" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.4" />
        <circle cx="100" cy="100" r="65" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.3" />
        <ellipse cx="100" cy="100" rx="90" ry="32" fill="none" stroke="currentColor" strokeWidth="0.75" opacity="0.4" />
        <ellipse cx="100" cy="100" rx="32" ry="90" fill="none" stroke="currentColor" strokeWidth="0.75" opacity="0.4" />
        <line x1="10" y1="100" x2="190" y2="100" stroke="currentColor" strokeWidth="0.5" opacity="0.3" />
        <line x1="100" y1="10" x2="100" y2="190" stroke="currentColor" strokeWidth="0.5" opacity="0.3" />
      </svg>
      <div className="globe-fallback-pins">
        {displayJobs.slice(0, 6).map((job) => (
          <div key={job.id} className="globe-fallback-pin-item">
            <span className="globe-fallback-dot" />
            <span className="globe-fallback-text">{job.title} · {job.company}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handler);
      return () => mediaQuery.removeEventListener("change", handler);
    } else if (mediaQuery.addListener) {
      mediaQuery.addListener(handler);
      return () => mediaQuery.removeListener(handler);
    }
  }, []);

  return reduced;
}

function point(latitude: number, longitude: number, radius = 2.05) {
  const phi = (90 - latitude) * (Math.PI / 180);
  const theta = (longitude + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function Pin({
  job,
  staggerOffset,
  cycleDuration = 6.0,
  activeDuration = 4.0,
}: {
  job: GlobeJobPin;
  staggerOffset: number;
  cycleDuration?: number;
  activeDuration?: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const htmlGroupRef = useRef<HTMLDivElement>(null);
  const basePosition = useMemo(() => point(job.latitude, job.longitude), [job.latitude, job.longitude]);
  const reduced = usePrefersReducedMotion();

  useFrame(({ clock }) => {
    if (reduced) {
      if (groupRef.current) groupRef.current.position.copy(basePosition);
      if (materialRef.current) {
        materialRef.current.opacity = 1;
        materialRef.current.emissiveIntensity = 0.28;
      }
      if (htmlGroupRef.current) {
        htmlGroupRef.current.style.opacity = "1";
        htmlGroupRef.current.style.pointerEvents = "auto";
      }
      return;
    }

    const state = calculatePinLifecycle(clock.getElapsedTime(), staggerOffset, cycleDuration, activeDuration);

    if (materialRef.current) {
      materialRef.current.opacity = state.opacity;
      materialRef.current.emissiveIntensity = state.emissiveIntensity;
    }

    if (groupRef.current) {
      groupRef.current.position.copy(basePosition).add(basePosition.clone().normalize().multiplyScalar(state.offset));
    }

    if (htmlGroupRef.current) {
      htmlGroupRef.current.style.opacity = state.labelVisible ? "1" : "0";
      htmlGroupRef.current.style.pointerEvents = state.labelVisible ? "auto" : "none";
    }
  });

  return (
    <group ref={groupRef} position={basePosition}>
      <mesh>
        <sphereGeometry args={[0.075, 14, 14]} />
        {/* Three.js materials require color literals; CSS tokens cannot bind into WebGL shaders. */}
        <meshStandardMaterial ref={materialRef} color="#3da2ff" emissive="#3da2ff" emissiveIntensity={0.28} transparent opacity={0} />
      </mesh>
      <Html center distanceFactor={6} position={[0, 0.12, 0]}>
        <div ref={htmlGroupRef} style={{ transition: 'opacity 0.2s', opacity: 0, pointerEvents: 'none' }}>
          <span className="globe-job-label" title={`${job.title} · ${job.company}`}>
            {job.title} · {job.company}
          </span>
        </div>
      </Html>
    </group>
  );
}

function GlobeMesh({ jobs }: { jobs: GlobeJobPin[] }) {
  const group = useRef<THREE.Group>(null);
  const texture = useLoader(THREE.TextureLoader, "/jobs/earth-texture.png");
  const earthTexture = useMemo(() => {
    const clone = texture.clone();
    clone.colorSpace = THREE.SRGBColorSpace;
    clone.anisotropy = 4;
    clone.needsUpdate = true;
    return clone;
  }, [texture]);

  const reduced = usePrefersReducedMotion();

  useFrame((_, delta) => {
    if (group.current && !reduced) group.current.rotation.y += delta * 0.07;
  });

  const activeDuration = 4.0;
  const cycleDuration = Math.max(6.0, jobs.length * 1.2);

  return (
    <group ref={group} rotation={[0.18, -0.5, 0]}>
      <mesh>
        <sphereGeometry args={[2, 64, 64]} />
        <meshStandardMaterial
          map={earthTexture}
          color="#d9efff"
          roughness={0.82}
          metalness={0.1}
          emissive="#5d91b6"
          emissiveIntensity={0.08}
        />
      </mesh>
      {jobs.map((job, i) => (
        <Pin
          key={job.id}
          job={job}
          staggerOffset={i * 1.2}
          cycleDuration={cycleDuration}
          activeDuration={activeDuration}
        />
      ))}
    </group>
  );
}

export default function CareerGlobe({ jobs = [] }: { jobs?: GlobeJobPin[] }) {
  const displayJobs = jobs;
  const containerRef = useRef<HTMLDivElement>(null);
  const [webGLSupported, setWebGLSupported] = useState<boolean | null>(null);
  const [isInView, setIsInView] = useState(true);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setWebGLSupported(isWebGLAvailable());
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry.isIntersecting);
      },
      { threshold: 0.05 }
    );

    const el = containerRef.current;
    if (el) observer.observe(el);

    return () => {
      if (el) observer.unobserve(el);
      observer.disconnect();
    };
  }, []);

  if (webGLSupported === false) {
    return <GlobeFallback jobs={displayJobs} />;
  }

  if (webGLSupported === null) {
    return <div className="globe-loading">Loading global roles…</div>;
  }

  return (
    <div
      ref={containerRef}
      data-testid="career-globe"
      data-in-view={isInView ? "true" : "false"}
      style={{ width: "100%", height: "100%", position: "relative" }}
    >
      <GlobeErrorBoundary fallback={<GlobeFallback jobs={displayJobs} />}>
        <Canvas
          dpr={[1, 1.5]}
          camera={{ position: [0, 0, 6.1], fov: 46 }}
          gl={{ antialias: true, alpha: true }}
          frameloop={isInView ? "always" : "demand"}
          aria-label="Rotating Earth with illustrative global role locations"
          data-testid="r3f-canvas"
        >
          <ambientLight intensity={1.45} />
          <directionalLight position={[4, 4, 6]} intensity={2.2} />
          <GlobeMesh jobs={displayJobs} />
          <OrbitControls enableZoom={false} enablePan={false} minPolarAngle={Math.PI / 2.8} maxPolarAngle={Math.PI / 1.7} />
        </Canvas>
      </GlobeErrorBoundary>
    </div>
  );
}
