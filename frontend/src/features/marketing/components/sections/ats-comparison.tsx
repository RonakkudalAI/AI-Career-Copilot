"use client";

import { useState } from "react";
import { ParallaxLayer } from "@/shared/ui/parallax-layer";

export function AtsComparison() {
  const [showAfter, setShowAfter] = useState(true);

  return (
    <section className="section">
      <div className="container">
        <div style={{ textAlign: "center", marginBottom: "64px" }}>
          <ParallaxLayer speed={0.1}>
            <p className="eyebrow" style={{ color: "var(--primary-strong)" }}>The Difference</p>
            <h2>Stop guessing what systems want.</h2>
            <div style={{ display: "inline-flex", gap: "8px", background: "var(--surface)", padding: "4px", borderRadius: "999px", border: "1px solid var(--border)", marginTop: "24px" }}>
              <button 
                className="button button-quiet"
                onClick={() => setShowAfter(false)}
                style={{ background: !showAfter ? "var(--background-subtle)" : "transparent", borderRadius: "999px" }}
                aria-pressed={!showAfter}
              >
                Before Career Copilot
              </button>
              <button 
                className="button button-quiet"
                onClick={() => setShowAfter(true)}
                style={{ background: showAfter ? "var(--primary-strong)" : "transparent", color: showAfter ? "var(--text-on-primary)" : "inherit", borderRadius: "999px" }}
                aria-pressed={showAfter}
              >
                With Career Copilot
              </button>
            </div>
          </ParallaxLayer>
        </div>

        <div className="comparison-card panel" style={{ maxWidth: "800px", margin: "0 auto", minHeight: "300px", transition: "background 0.3s ease" }}>
          {!showAfter ? (
            <div className="state-before" style={{ display: "grid", gap: "24px", animation: "page-enter 0.3s ease" }}>
              <h3 style={{ borderBottom: "1px solid var(--border)", paddingBottom: "16px" }}>Generic ATS Checkers</h3>
              <ul style={{ display: "grid", gap: "16px", padding: 0, listStyle: "none", margin: 0 }}>
                <li>❌ Keyword guessing based on word clouds</li>
                <li>❌ Unclear gaps with no actionable advice</li>
                <li>❌ Generic &quot;improve your impact&quot; feedback</li>
                <li>❌ Disconnected reports for every application</li>
              </ul>
            </div>
          ) : (
            <div className="state-after" style={{ display: "grid", gap: "24px", animation: "page-enter 0.3s ease" }}>
              <h3 style={{ borderBottom: "1px solid var(--border)", paddingBottom: "16px", color: "var(--primary-strong)" }}>Career Copilot</h3>
              <ul style={{ display: "grid", gap: "16px", padding: 0, listStyle: "none", margin: 0 }}>
                <li>✅ Evidence-backed analysis tracing directly to your resume</li>
                <li>✅ Confirmed skill gaps mapped to real learning paths</li>
                <li>✅ Grounded improvements that don&apos;t invent experience</li>
                <li>✅ One evolving career profile that gets smarter</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
