"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface ParallaxLayerProps {
  children: ReactNode;
  speed?: number;
  className?: string;
  zIndex?: number;
}

/**
 * Scroll-linked transform layer with a pending-frame guard.
 * Only one requestAnimationFrame is scheduled at a time while scroll events fire.
 */
export function ParallaxLayer({
  children,
  speed = 0.5,
  className = "",
  zIndex = 1,
}: ParallaxLayerProps) {
  const [offset, setOffset] = useState(0);
  const layerRef = useRef<HTMLDivElement>(null);
  const pendingFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const hasMatchMedia = typeof window !== "undefined" && typeof window.matchMedia === "function";
    const reducedMotion = hasMatchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;
    if (reducedMotion) return;

    const handleScroll = () => {
      // Pending-frame guard: skip scheduling if a frame is already queued
      if (pendingFrameRef.current !== null) return;

      pendingFrameRef.current = requestAnimationFrame(() => {
        pendingFrameRef.current = null;
        const scrollY = window.scrollY;
        if (layerRef.current) {
          const rect = layerRef.current.getBoundingClientRect();
          const isVisible = rect.top < window.innerHeight + 200 && rect.bottom > -200;
          if (isVisible) {
            setOffset(scrollY * speed * 0.1);
          }
        }
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (pendingFrameRef.current !== null) {
        cancelAnimationFrame(pendingFrameRef.current);
        pendingFrameRef.current = null;
      }
    };
  }, [speed]);

  return (
    <div
      ref={layerRef}
      className={className}
      style={{
        transform: `translate3d(0, ${offset}px, 0)`,
        willChange: "transform",
        position: "relative",
        zIndex,
      }}
    >
      {children}
    </div>
  );
}
