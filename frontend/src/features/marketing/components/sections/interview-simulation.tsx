"use client";

import { ParallaxLayer } from "@/shared/ui/parallax-layer";
import { Mic, Video, Settings, PlaySquare } from "lucide-react";

export function InterviewSimulation() {
  // Pre-calculated pseudo-random values to avoid impure render functions
  const waveformHeights = [45, 80, 30, 95, 20, 60, 85, 40, 75, 25, 90, 50, 65, 35, 15, 70, 55, 10, 100, 45, 85, 30, 95, 20];
  const waveformDelays = [0.1, 0.4, 0.2, 0.7, 0.3, 0.9, 0.5, 0.8, 0.2, 0.6, 0.1, 0.4, 0.7, 0.3, 0.9, 0.5, 0.2, 0.8, 0.6, 0.1, 0.4, 0.7, 0.3, 0.9];

  return (
    <section
      className="section"
      style={{ background: "var(--primary-deep)", color: "var(--text-on-primary)", padding: "120px 0" }}
    >
      <div className="container">
        <div style={{ textAlign: "center", marginBottom: "64px" }}>
          <ParallaxLayer speed={0.1}>
            <p className="eyebrow" style={{ color: "var(--primary-strong)" }}>
              Realistic Practice
            </p>
            <h2 style={{ color: "var(--text-on-primary)" }}>Practice under realistic conditions.</h2>
            <p style={{ margin: "0 auto", color: "var(--muted)", maxWidth: "600px" }}>
              Review what you said, how clearly you explained it, and what to improve next.
            </p>
          </ParallaxLayer>
        </div>

        {/* FE-009: room chrome uses semantic CSS tokens, not raw hex literals */}
        <div className="interview-room-frame">
          <div className="interview-room-header">
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <div
                style={{ width: "12px", height: "12px", borderRadius: "50%", background: "var(--danger)" }}
                aria-hidden
              />
              <span className="mono" style={{ fontSize: "var(--text-xs)" }}>
                REC 04:22
              </span>
            </div>
            <div style={{ display: "flex", gap: "16px" }} aria-hidden>
              <Mic size={18} />
              <Video size={18} />
              <Settings size={18} />
            </div>
          </div>

          <div
            className="room-body"
            style={{ display: "grid", gridTemplateColumns: "1fr 280px", minHeight: "400px" }}
          >
            <div
              className="main-feed"
              style={{ padding: "32px", display: "grid", placeItems: "center", position: "relative" }}
            >
              <div style={{ textAlign: "center", maxWidth: "400px" }}>
                <p
                  style={{
                    fontSize: "var(--text-lg)",
                    color: "var(--text-on-primary)",
                    fontWeight: 600,
                    lineHeight: 1.4,
                  }}
                >
                  &quot;Can you walk me through a time when you had to scale a system under unexpected
                  load?&quot;
                </p>
                <div
                  className="waveform"
                  style={{
                    display: "flex",
                    gap: "4px",
                    justifyContent: "center",
                    marginTop: "32px",
                    height: "32px",
                    alignItems: "center",
                  }}
                  aria-hidden
                >
                  {waveformHeights.map((h, i) => (
                    <div
                      key={i}
                      style={{
                        width: "4px",
                        background: "var(--primary-strong)",
                        borderRadius: "2px",
                        height: `${h}%`,
                        animation: `pulse-height 1s ease-in-out infinite ${waveformDelays[i]}s`,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div
              className="side-feed"
              style={{
                borderLeft: "1px solid color-mix(in srgb, var(--surface) 10%, transparent)",
                padding: "16px",
                display: "grid",
                gap: "16px",
                gridTemplateRows: "min-content 1fr",
              }}
            >
              <div className="interview-room-cam">
                <span
                  style={{
                    color: "var(--muted)",
                    fontSize: "var(--text-xs)",
                    fontFamily: "var(--font-code)",
                  }}
                >
                  CANDIDATE_CAM
                </span>
              </div>

              <div className="interview-room-timeline">
                <h4
                  style={{
                    margin: "0 0 16px 0",
                    fontSize: "var(--text-xs)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--muted)",
                  }}
                >
                  Session Timeline
                </h4>
                <div
                  style={{
                    display: "grid",
                    gap: "12px",
                    fontSize: "var(--text-xs)",
                    color: "var(--muted)",
                  }}
                >
                  <div style={{ display: "flex", gap: "8px" }}>
                    <PlaySquare size={14} color="var(--success)" aria-hidden /> Q1: System Design
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <PlaySquare size={14} color="var(--primary-strong)" aria-hidden /> Q2: Scaling
                  </div>
                  <div style={{ display: "flex", gap: "8px", opacity: 0.5 }}>
                    <PlaySquare size={14} aria-hidden /> Q3: Conflict
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes pulse-height {
          0%, 100% { transform: scaleY(0.4); }
          50% { transform: scaleY(1); }
        }
        @media (max-width: 800px) {
          .room-body { grid-template-columns: 1fr !important; }
          .side-feed { border-left: none !important; border-top: 1px solid color-mix(in srgb, var(--surface) 10%, transparent); }
        }
      `}</style>
    </section>
  );
}
