import { useEffect } from "react";
import { Team5 } from "@/components/ui/team-5";
import { Navigation5 } from "@/components/ui/navigation-5";
import { BeamsBackground } from "@/components/ui/beams-background";
import { RuixenGradientFooter } from "@/components/ui/ruixen-gradient-footer";
import { BrandMark } from "@/components/ui/brand-mark";
import { MotionProvider, useMotion } from "../motion-context";
import { useTheme } from "@/shared/theme";
import { Link } from "@/shared/ui/router-link";
import { warmUpBackend } from "@/shared/route-prefetch";

function TeamsInner() {
  const { isMotionPaused } = useMotion();
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    warmUpBackend();
  }, []);

  return (
    <div
      className="home-page teams-page"
      data-motion={isMotionPaused ? "paused" : "running"}
    >
      <BeamsBackground
        theme={resolvedTheme}
        paused={isMotionPaused}
        intensity="subtle"
        className="home-beams"
      />
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <Navigation5 />
      <main id="main-content">
        <Team5
          className="home-team-block"
          heading="The team"
          description="The builders behind Career Copilot."
        />
      </main>
      <RuixenGradientFooter gradientHeight="44vh" className="home-footer">
        <div className="home-frame home-footer-content">
          <div className="home-footer-top">
            <Link
              href="/"
              className="home-brand"
              aria-label="Career Copilot home"
            >
              <BrandMark compact />
              <span>Career Copilot</span>
            </Link>
            <span className="home-footer-tagline">
              Private career preparation
            </span>
            <nav className="home-footer-nav" aria-label="Footer navigation">
              <Link href="/sign-in">Sign in</Link>
              <Link href="/sign-up">Get started</Link>
              <Link href="/teams">Team</Link>
              <Link href="/#practice">Video practice</Link>
            </nav>
          </div>
          <div className="home-footer-meta">
            <span>© 2026 Career Copilot</span>
            <span className="home-status">
              <i className="home-status-dot" aria-hidden /> Evidence-first ·
              scores from confirmed work only
            </span>
            <span>Built for candidates</span>
          </div>
        </div>
      </RuixenGradientFooter>
    </div>
  );
}

export function TeamsPage() {
  return (
    <MotionProvider>
      <TeamsInner />
    </MotionProvider>
  );
}
