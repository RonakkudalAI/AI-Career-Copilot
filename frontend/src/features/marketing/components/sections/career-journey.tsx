"use client";

import { useRef } from "react";
import { ParallaxLayer } from "@/shared/ui/parallax-layer";
import { useScroll, motion } from "motion/react";

const stages = [
  { id: "01", title: "Understand", desc: "Resume and job-description analysis" },
  { id: "02", title: "Improve", desc: "Grounded resume recommendations" },
  { id: "03", title: "Practice", desc: "Realistic mock interviews" },
  { id: "04", title: "Learn", desc: "Personalized skill-gap learning paths" },
  { id: "05", title: "Discover", desc: "Relevant job opportunities" },
  { id: "06", title: "Evolve", desc: "A career profile that improves over time" },
];

export function CareerJourney() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start center", "end center"],
  });

  return (
    <section className="section" ref={containerRef} style={{ position: "relative" }}>
      <ParallaxLayer speed={-0.1} zIndex={0}>
        <div className="container">
          <p className="eyebrow" style={{ color: "var(--primary-strong)" }}>
            Career Orbit
          </p>
          <h2>A connected journey, not isolated tools.</h2>
        </div>
      </ParallaxLayer>

      <div className="container" style={{ position: "relative", marginTop: "64px", zIndex: 1 }}>
        <div className="orbit-path" />

        {/* FE-005: progress line uses a stable class, not a motion.div selector hack */}
        <motion.div
          className="journey-progress-line"
          style={{
            scaleY: scrollYProgress,
          }}
          aria-hidden
        />

        <div className="journey-stages">
          {stages.map((stage, i) => {
            const side = i % 2 === 0 ? "left" : "right";
            return (
              <div key={stage.id} className="journey-stage-row" data-side={side} data-stage={stage.id}>
                <div className="journey-stage-node" aria-hidden />

                <motion.div
                  className="journey-stage-card"
                  data-journey-card
                  initial={{ opacity: 0, x: side === "left" ? -20 : 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-20%" }}
                  transition={{ duration: 0.5 }}
                >
                  <span
                    className="mono"
                    style={{ color: "var(--primary-strong)", marginBottom: "8px", display: "block" }}
                  >
                    {stage.id} — {stage.title}
                  </span>
                  <p style={{ margin: 0, color: "var(--ink)" }}>{stage.desc}</p>
                </motion.div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
