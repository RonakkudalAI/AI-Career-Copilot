"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { ParallaxLayer } from "@/shared/ui/parallax-layer";

export function ResumeIntelligence() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start center", "end center"],
  });

  const lineOpacity = useTransform(scrollYProgress, [0.3, 0.5], [0, 1]);

  return (
    <section className="section" ref={containerRef} style={{ background: "var(--surface-blue)", padding: "120px 0" }}>
      <div className="container">
        <ParallaxLayer speed={0.05}>
          <p className="eyebrow" style={{ color: "var(--primary-strong)" }}>
            Evidence-Backed Analysis
          </p>
          <h2 style={{ maxWidth: "600px", marginBottom: "64px" }}>
            See exactly how your experience translates into confirmed skills.
          </h2>
        </ParallaxLayer>

        <div
          className="intelligence-grid"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "64px", position: "relative" }}
        >
          <motion.svg
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
              zIndex: 0,
              opacity: lineOpacity,
            }}
            aria-hidden
          >
            <path
              d="M 400 120 C 500 120, 450 80, 560 80"
              fill="transparent"
              stroke="var(--primary-strong)"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
            <path
              d="M 400 240 C 500 240, 450 200, 560 200"
              fill="transparent"
              stroke="var(--primary-strong)"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
          </motion.svg>

          <div className="resume-panel panel" style={{ position: "relative", zIndex: 1 }}>
            <h3 className="mono" style={{ fontSize: "var(--text-xs)", marginBottom: "24px" }}>
              Uploaded Resume
            </h3>

            <div className="resume-block" style={{ marginBottom: "24px" }}>
              <div style={{ fontWeight: 600, marginBottom: "8px" }}>Experience</div>
              <p style={{ fontSize: "var(--text-sm)", borderLeft: "2px solid var(--border)", paddingLeft: "12px" }}>
                Built scalable microservices using{" "}
                <span
                  style={{
                    background: "var(--keyword-hit-bg)",
                    color: "var(--keyword-hit-fg)",
                    padding: "0 4px",
                    borderRadius: "3px",
                  }}
                >
                  Go
                </span>{" "}
                and{" "}
                <span
                  style={{
                    background: "var(--keyword-hit-bg)",
                    color: "var(--keyword-hit-fg)",
                    padding: "0 4px",
                    borderRadius: "3px",
                  }}
                >
                  Docker
                </span>
                .
              </p>
            </div>

            <div className="resume-block">
              <div style={{ fontWeight: 600, marginBottom: "8px" }}>Projects</div>
              <p style={{ fontSize: "var(--text-sm)", borderLeft: "2px solid var(--border)", paddingLeft: "12px" }}>
                Designed an API in{" "}
                <span
                  style={{
                    background: "var(--keyword-hit-bg)",
                    color: "var(--keyword-hit-fg)",
                    padding: "0 4px",
                    borderRadius: "3px",
                  }}
                >
                  FastAPI
                </span>{" "}
                serving 10k req/sec.
              </p>
            </div>
          </div>

          <div className="analysis-panel panel" style={{ position: "relative", zIndex: 1 }}>
            <h3 className="mono" style={{ fontSize: "var(--text-xs)", marginBottom: "24px" }}>
              Copilot Analysis
            </h3>

            <div
              className="analysis-result"
              style={{
                padding: "16px",
                background: "var(--background-subtle)",
                borderRadius: "12px",
                marginBottom: "16px",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <strong style={{ fontSize: "var(--text-sm)" }}>Go (Golang)</strong>
                <span className="badge badge-success">Matched skill</span>
              </div>
              <p style={{ fontSize: "var(--text-xs)", margin: 0 }}>Evidence found in Experience</p>
            </div>

            <div
              className="analysis-result"
              style={{
                padding: "16px",
                background: "var(--background-subtle)",
                borderRadius: "12px",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <strong style={{ fontSize: "var(--text-sm)" }}>FastAPI</strong>
                <span className="badge badge-info">Project evidence</span>
              </div>
              <p style={{ fontSize: "var(--text-xs)", margin: 0 }}>Evidence found in Projects</p>
            </div>
          </div>
        </div>
      </div>
      <style>{`
        @media (max-width: 800px) {
          .intelligence-grid { grid-template-columns: 1fr !important; gap: 32px !important; }
          .intelligence-grid svg { display: none; }
        }
      `}</style>
    </section>
  );
}
