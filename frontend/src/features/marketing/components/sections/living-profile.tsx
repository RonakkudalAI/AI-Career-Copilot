"use client";

import { useRef } from "react";
import { ParallaxLayer } from "@/shared/ui/parallax-layer";
import { useScroll, motion, useTransform } from "motion/react";
import { FileSearch, Video, BookOpenCheck, BriefcaseBusiness } from "lucide-react";

export function LivingProfile() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start center", "center center"],
  });

  const scale = useTransform(scrollYProgress, [0, 1], [0.8, 1]);
  const opacity = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <section className="section" ref={containerRef} style={{ padding: "120px 0", overflow: "hidden" }}>
      <div className="container" style={{ textAlign: "center" }}>
        <ParallaxLayer speed={0.1}>
          <p className="eyebrow" style={{ color: "var(--primary-strong)" }}>
            Continuous Growth
          </p>
          <h2>One evolving career profile.</h2>
          <p style={{ margin: "0 auto 80px", maxWidth: "600px" }}>
            Every resume analysis, interview practice, and learning milestone contributes to a
            single career profile that strengthens over time.
          </p>
        </ParallaxLayer>

        <motion.div className="living-orbit" style={{ scale, opacity }}>
          <div className="living-orbit-center">
            <span style={{ fontWeight: 600, fontFamily: "var(--font-heading)" }}>Your Profile</span>
          </div>

          <div className="living-orbit-ring living-orbit-ring-inner" aria-hidden />
          <div className="living-orbit-ring living-orbit-ring-outer" aria-hidden />

          <ModuleNode top="10%" left="20%" icon={<FileSearch size={20} />} label="Confirmed Skill" delay={0} />
          <ModuleNode top="80%" left="30%" icon={<Video size={20} />} label="Completed Interview" delay={0.2} />
          <ModuleNode top="20%" left="80%" icon={<BookOpenCheck size={20} />} label="Learning Milestone" delay={0.4} />
          <ModuleNode top="75%" left="75%" icon={<BriefcaseBusiness size={20} />} label="Relevant Opportunity" delay={0.6} />

          <SignalDot top="10%" left="20%" delay={0} />
          <SignalDot top="80%" left="30%" delay={0.2} />
          <SignalDot top="20%" left="80%" delay={0.4} />
          <SignalDot top="75%" left="75%" delay={0.6} />
        </motion.div>
      </div>
      <style>{`
        @keyframes signal-travel {
          0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          100% { top: 50%; left: 50%; transform: translate(-50%, -50%) scale(0); opacity: 0; }
        }
      `}</style>
    </section>
  );
}

function ModuleNode({
  top,
  left,
  icon,
  label,
  delay,
}: {
  top: string;
  left: string;
  icon: React.ReactNode;
  label: string;
  delay: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top,
        left,
        transform: "translate(-50%, -50%)",
        zIndex: 5,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "8px",
      }}
    >
      <motion.div
        initial={{ y: 10, opacity: 0 }}
        whileInView={{ y: 0, opacity: 1 }}
        transition={{ delay, duration: 0.5 }}
        style={{
          width: "clamp(40px, 8vw, 48px)",
          height: "clamp(40px, 8vw, 48px)",
          borderRadius: "14px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          display: "grid",
          placeItems: "center",
          color: "var(--primary-strong)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        {icon}
      </motion.div>
      <span className="living-module-label badge badge-info" style={{ whiteSpace: "nowrap" }}>
        {label}
      </span>
    </div>
  );
}

function SignalDot({ top, left, delay }: { top: string; left: string; delay: number }) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        top,
        left,
        width: "8px",
        height: "8px",
        borderRadius: "50%",
        background: "var(--primary-strong)",
        zIndex: 2,
        animation: `signal-travel 3s cubic-bezier(0.4, 0, 0.2, 1) infinite ${delay}s`,
      }}
    />
  );
}
