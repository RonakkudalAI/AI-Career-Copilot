"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowRight, Menu, ShieldCheck, X } from "lucide-react";
import { ButtonLink } from "@/shared/ui/primitives";
import { JobTicker } from "@/shared/ui/job-ticker";
import { CareerJourney } from "./sections/career-journey";
import { ResumeIntelligence } from "./sections/resume-intelligence";
import { AtsComparison } from "./sections/ats-comparison";
import { InterviewSimulation } from "./sections/interview-simulation";
import { LivingProfile } from "./sections/living-profile";
import { ParallaxLayer } from "@/shared/ui/parallax-layer";

const Globe = dynamic(() => import("@/components/ui/globe").then((module) => module.Globe), {
  ssr: false,
  loading: () => <div className="globe-loading" aria-hidden="true" />,
});


const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function LandingPage() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const drawerTitleId = useId();

  const closeDrawer = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // FE-006: focus trap, Escape to close, restore focus to menu button
  useEffect(() => {
    if (!open) return;

    const drawer = drawerRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const menuButton = menuButtonRef.current;

    const focusables = () =>
      drawer
        ? (Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
            (el) => !el.hasAttribute("disabled") && el.tabIndex !== -1
          ) as HTMLElement[])
        : [];

    const items = focusables();
    (items[0] ?? drawer)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !drawer) return;

      const list = focusables();
      if (list.length === 0) {
        event.preventDefault();
        drawer.focus();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (active === first || !drawer.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previouslyFocused && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      } else {
        menuButton?.focus();
      }
    };
  }, [open]);

  useEffect(() => {
    let pendingFrame: number | null = null;
    const onScroll = () => {
      if (pendingFrame !== null) return;
      pendingFrame = window.requestAnimationFrame(() => {
        pendingFrame = null;
        setScrolled(window.scrollY > 20);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (pendingFrame !== null) window.cancelAnimationFrame(pendingFrame);
    };
  }, []);

  return (
    <>
      <nav
        className={`marketing-nav ${scrolled ? "nav-scrolled" : ""}`}
        style={{
          position: "fixed",
          width: "100%",
          background: scrolled ? undefined : "transparent",
          borderBottom: scrolled ? undefined : "none",
          transition: "all 0.3s ease",
        }}
        aria-label="Primary"
      >
        <div className="container nav-inner">
          <Link className="brand" href="/" onClick={closeDrawer}>
            Career Copilot
          </Link>
          <div className="nav-links">
            <a href="#journey">How it works</a>
            <a href="#analysis">Resume Analysis</a>
            <a href="#interview">Mock Interview</a>
            <Link href="/sign-in" className="button button-quiet">
              Sign in
            </Link>
            <ButtonLink href="/sign-up">Get started</ButtonLink>
          </div>
          <div className="marketing-nav-actions">
            <button
              ref={menuButtonRef}
              type="button"
              className="icon-button mobile-menu-button"
              onClick={() => setOpen((current) => !current)}
              aria-label={open ? "Close navigation" : "Open navigation"}
              aria-expanded={open}
              aria-controls="mobile-navigation"
            >
              {open ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
            </button>
          </div>
        </div>
      </nav>
      {open && (
        <div
          id="mobile-navigation"
          ref={drawerRef}
          className="mobile-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby={drawerTitleId}
          tabIndex={-1}
        >
          <h2 id={drawerTitleId} className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
            Mobile navigation
          </h2>
          <a href="#journey" onClick={closeDrawer}>
            How it works
          </a>
          <a href="#analysis" onClick={closeDrawer}>
            Resume Analysis
          </a>
          <a href="#interview" onClick={closeDrawer}>
            Mock Interview
          </a>
          <Link href="/sign-in" onClick={closeDrawer}>
            Sign in
          </Link>
          <Link href="/sign-up" className="button button-primary" onClick={closeDrawer}>
            Get started
            <ArrowRight size={17} aria-hidden />
          </Link>
        </div>
      )}
      <main id="main-content">
        <section className="container landing-hero">
          <div className="hero-copy">
            <h1 style={{ marginBottom: "24px", maxWidth: "100%" }}>
              Navigate your career with evidence, not guesswork.
            </h1>
            <p style={{ fontSize: "var(--text-lg)", marginBottom: "40px", maxWidth: "480px" }}>
              Analyze your resume, understand your gaps, practice real interviews, build the right
              skills, and discover roles that match your progress.
            </p>
            <div className="cluster">
              <ButtonLink href="/sign-up">Start Your Career Journey</ButtonLink>
              <a href="#journey" className="button button-secondary">
                Explore How It Works
              </a>
            </div>
            <p className="hero-note" style={{ marginTop: "32px" }}>
              <ShieldCheck size={16} aria-hidden />
              <span>
                Your career profile evolves with every analysis, interview, and learning milestone.
              </span>
            </p>
          </div>
          <div className="globe-frame">
            <Globe />
          </div>
        </section>

        <div className="landing-deferred">
          <JobTicker />
        </div>

        <div id="journey" className="landing-deferred">
          <CareerJourney />
        </div>
        <div id="analysis" className="landing-deferred">
          <ResumeIntelligence />
        </div>
        <div className="landing-deferred">
          <AtsComparison />
        </div>
        <div id="interview" className="landing-deferred">
          <InterviewSimulation />
        </div>
        <div className="landing-deferred">
          <LivingProfile />
        </div>

        <section
          className="section"
          style={{
            background: "var(--surface)",
            borderTop: "1px solid var(--border)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div className="container" style={{ textAlign: "center", maxWidth: "800px" }}>
            <ParallaxLayer speed={0.05}>
              <h2>Meaningful outcomes.</h2>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  display: "grid",
                  gap: "16px",
                  fontSize: "var(--text-lg)",
                  color: "var(--muted)",
                  margin: "48px 0",
                }}
              >
                <li>Know why a role matches.</li>
                <li>See which skills are actually missing.</li>
                <li>Improve without inventing experience.</li>
                <li>Practice before the real interview.</li>
                <li>Track progress across your entire journey.</li>
              </ul>
            </ParallaxLayer>
          </div>
        </section>

        <section
          className="section"
          style={{
            padding: "160px 0",
            textAlign: "center",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div className="container" style={{ position: "relative", zIndex: 2 }}>
            <h2 style={{ fontSize: "clamp(2rem, 4vw, 3rem)", marginBottom: "24px" }}>
              Your next role should not depend on guesswork.
            </h2>
            <p style={{ fontSize: "var(--text-lg)", margin: "0 auto 48px", maxWidth: "600px" }}>
              Build a career profile that becomes more useful every time you analyze, practice,
              learn, and apply.
            </p>
            <div className="cluster" style={{ justifyContent: "center" }}>
              <ButtonLink href="/sign-up">Create Your Profile</ButtonLink>
              <ButtonLink href="/sign-in" className="button-secondary">
                Sign In
              </ButtonLink>
            </div>
          </div>

          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "min(800px, 90vw)",
              height: "min(800px, 90vw)",
              borderRadius: "50%",
              border: "1px solid color-mix(in srgb, var(--primary-strong) 20%, transparent)",
              zIndex: 1,
              pointerEvents: "none",
            }}
            aria-hidden
          >
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: "75%",
                height: "75%",
                borderRadius: "50%",
                border: "1px solid color-mix(in srgb, var(--primary-strong) 15%, transparent)",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: "50%",
                height: "50%",
                borderRadius: "50%",
                background: "color-mix(in srgb, var(--primary-strong) 5%, transparent)",
              }}
            />
          </div>
        </section>
      </main>
      <footer className="footer">
        <div className="container row">
          <div className="brand">Career Copilot</div>
          <div className="cluster">
            <Link href="/sign-in">Sign in</Link>
            <Link href="/sign-up">Create account</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
