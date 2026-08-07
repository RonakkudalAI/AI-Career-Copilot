
import { Link } from "@/shared/ui/router-link";
import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowRight, Menu, ShieldCheck, X } from "lucide-react";

import { JobTicker } from "@/shared/ui/job-ticker";
import { CareerJourney } from "./sections/career-journey";
import { ResumeIntelligence } from "./sections/resume-intelligence";
import { AtsComparison } from "./sections/ats-comparison";
import { InterviewSimulation } from "./sections/interview-simulation";
import { LivingProfile } from "./sections/living-profile";
import { ParallaxLayer } from "@/shared/ui/parallax-layer";
import { ButtonLink } from "@/shared/ui/primitives";

const Globe = lazy(() => import("@/features/jobs/components/career-globe"));


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
    <div className="landing-page">
      <nav
        className={`marketing-nav ${scrolled ? "nav-scrolled" : ""} ${open ? "nav-open" : ""}`}
        aria-label="Primary"
      >
        <div className="container nav-inner">
          <Link className="brand" href="/" onClick={closeDrawer}>
            Career Copilot
          </Link>
          <div className="nav-links">
            <a href="#journey">How it works</a>
            <a href="#analysis">Resume analysis</a>
            <a href="#interview">Mock interview</a>
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
            Resume analysis
          </a>
          <a href="#interview" onClick={closeDrawer}>
            Mock interview
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
            <p className="eyebrow hero-eyebrow">Evidence-led career ops</p>
            <h1 className="hero-title">
              Navigate your career with evidence, not guesswork.
            </h1>
            <p className="hero-lede">
              Analyze your resume, understand your gaps, practice real interviews, build the right
              skills, and discover roles that match your progress.
            </p>
            <div className="cluster hero-actions">
              <ButtonLink href="/sign-up">Start your career journey</ButtonLink>
              <a href="#journey" className="button button-secondary">
                See how it works
              </a>
            </div>
            <p className="hero-note">
              <ShieldCheck size={16} aria-hidden />
              <span>
                Your career profile evolves with every analysis, interview, and learning milestone.
              </span>
            </p>
          </div>
          <div className="globe-frame" aria-label="Interactive map of opportunities">
            <Suspense fallback={<div className="globe-loading" data-testid="mock-globe">Loading map...</div>}>
              <Globe />
            </Suspense>
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

        <section className="section landing-outcomes">
          <div className="container landing-outcomes-inner">
            <ParallaxLayer speed={0.05}>
              <p className="eyebrow">What you gain</p>
              <h2>Meaningful outcomes.</h2>
              <ul className="landing-outcome-list">
                <li>Know why a role matches.</li>
                <li>See which skills are actually missing.</li>
                <li>Improve without inventing experience.</li>
                <li>Practice before the real interview.</li>
                <li>Track progress across your entire journey.</li>
              </ul>
            </ParallaxLayer>
          </div>
        </section>

        <section className="section landing-cta">
          <div className="container landing-cta-inner">
            <h2 className="landing-cta-title">
              Your next role should not depend on guesswork.
            </h2>
            <p className="landing-cta-copy">
              Build a career profile that becomes more useful every time you analyze, practice,
              learn, and apply.
            </p>
            <div className="cluster landing-cta-actions">
              <ButtonLink href="/sign-up">Create your profile</ButtonLink>
              <ButtonLink href="/sign-in" className="button-secondary">
                Sign in
              </ButtonLink>
            </div>
          </div>
          <div className="landing-cta-rings" aria-hidden>
            <span />
            <span />
            <span />
          </div>
        </section>
      </main>
      <footer className="footer">
        <div className="container footer-inner">
          <div>
            <div className="brand">Career Copilot</div>
            <p className="footer-tagline">Private career records. Evidence you can review.</p>
          </div>
          <div className="footer-links">
            <Link href="/sign-in">Sign in</Link>
            <Link href="/sign-up">Create account</Link>
            <a href="#journey">How it works</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
