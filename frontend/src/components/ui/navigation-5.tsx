import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type MouseEvent,
} from "react";
import { useLocation } from "react-router-dom";
import { Link } from "@/shared/ui/router-link";
import { BrandMark } from "@/components/ui/brand-mark";
import { AnimatedIcon } from "@/components/ui/animated-icon";
import { ThemeToggle } from "@/shared/ui/theme-toggle";
import { prefetchRoute } from "@/shared/route-prefetch";
import { cn } from "@/shared/utils";
import { useMotionValueEvent, useScroll } from "motion/react";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  FileText,
  Menu,
  Video,
  X,
} from "lucide-react";

const navLinkClass =
  "nav5-link rounded-full px-3 py-2 text-sm font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--surface)_55%,transparent)]";

export function Navigation5({ className }: { className?: string }) {
  const { pathname } = useLocation();
  const atHome = pathname === "/";
  const sectionHref = (id: string) => (atHome ? `#${id}` : `/#${id}`);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [solutionsOpen, setSolutionsOpen] = useState(false);
  const [mobileSolutionsOpen, setMobileSolutionsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const solutionsRef = useRef<HTMLDivElement>(null);

  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (value) => {
    setScrolled(value > 16);
  });

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const closeMobileMenu = useCallback(() => {
    setMobileOpen(false);
    window.setTimeout(() => menuButtonRef.current?.focus(), 0);
  }, []);

  const closeAndFollowAnchor = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      const sectionId = event.currentTarget.hash.replace(/^#/, "");
      setMobileOpen(false);
      setSolutionsOpen(false);
      window.setTimeout(() => {
        const target = sectionId ? document.getElementById(sectionId) : null;
        target?.focus({ preventScroll: true });
      }, 0);
    },
    [],
  );

  // Close desktop dropdown on outside click or escape
  useEffect(() => {
    if (!solutionsOpen) return;
    const handleClickOutside = (e: globalThis.MouseEvent) => {
      if (
        solutionsRef.current &&
        !solutionsRef.current.contains(e.target as Node)
      ) {
        setSolutionsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSolutionsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [solutionsOpen]);

  // Trap focus and handle escape for mobile drawer
  useEffect(() => {
    if (!mobileOpen) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const getFocusable = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );

    const initialFocus = window.setTimeout(
      () => getFocusable()[0]?.focus(),
      10,
    );
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMobileMenu();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = getFocusable();
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(initialFocus);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeMobileMenu, mobileOpen]);

  return (
    <nav
      className={cn(
        "home-nav nav5-wrapper sticky top-4 z-50 w-full px-4 sm:px-6 transition-all",
        className,
      )}
      aria-label="Primary"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-center">
        {/* Floating Navbar Pill */}
        <div
          className={cn(
            "nav5-pill flex h-16 w-full items-center justify-between gap-2 rounded-full border px-3 sm:px-4",
            scrolled && "nav5-pill-scrolled",
          )}
          style={{
            backgroundColor: "color-mix(in srgb, var(--surface) 48%, transparent)",
            borderColor: "color-mix(in srgb, var(--border) 58%, transparent)",
            backdropFilter: "blur(22px) saturate(180%)",
            WebkitBackdropFilter: "blur(22px) saturate(180%)",
          }}
        >
          {/* Logo Section */}
          <Link
            href="/"
            className="nav5-brand flex items-center gap-2.5 pr-3 pl-2 transition-transform hover:scale-[1.02]"
            aria-label="Career Copilot home"
          >
            <BrandMark />
            <span className="text-base font-bold tracking-tight text-[var(--text)] sm:text-lg">
              Career Copilot
            </span>
          </Link>

          {/* Desktop Navigation Links */}
          <div className="hidden xl:flex xl:items-center xl:gap-0.5">
            <a href={sectionHref("practice")} className={navLinkClass}>
              Practice
            </a>

            <a href={sectionHref("system")} className={navLinkClass}>
              How it works
            </a>

            {/* Solutions Dropdown Menu */}
            <div
              ref={solutionsRef}
              className="relative"
              onMouseEnter={() => setSolutionsOpen(true)}
              onMouseLeave={() => setSolutionsOpen(false)}
            >
              <button
                type="button"
                className={cn(
                  "flex items-center gap-1 rounded-full px-3.5 py-2 text-sm font-medium text-[var(--text-muted)] transition-all hover:bg-[var(--surface-muted)] hover:text-[var(--text)]",
                  solutionsOpen &&
                    "bg-[var(--surface-muted)] text-[var(--text)]",
                )}
                aria-expanded={solutionsOpen}
                onClick={() => setSolutionsOpen((v) => !v)}
              >
                <span>Platform</span>
                <ChevronDown
                  className={cn(
                    "size-3.5 transition-transform duration-200",
                    solutionsOpen && "rotate-180",
                  )}
                  aria-hidden
                />
              </button>

              {/* Mega Menu Dropdown Island */}
              {solutionsOpen && (
                <div
                  className="nav5-dropdown absolute top-full left-1/2 -translate-x-1/2 pt-3 w-[740px] transition-all"
                  role="menu"
                  aria-label="Platform solutions"
                >
                  <div className="nav5-menu overflow-hidden rounded-3xl border p-6">
                    <div className="grid grid-cols-3 gap-6 divide-x divide-[var(--divider)]">
                      {/* Column 1: Resume & ATS */}
                      <div className="flex flex-col gap-3 pr-4">
                        <div className="mb-1 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--surface-muted)] text-[var(--primary-strong)]">
                          <FileText className="size-4.5" />
                        </div>
                        <h4 className="text-sm font-semibold text-[var(--text)]">
                          ATS & Evidence
                        </h4>
                        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                          Extract verified skills, score resume fit against real
                          job descriptions, and close gaps.
                        </p>
                        <div className="mt-1 flex flex-col gap-1">
                          <Link
                            href="/resume-analysis?tab=upload"
                            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--primary-strong)] transition-colors"
                            onClick={() => setSolutionsOpen(false)}
                          >
                            Analyze Resume
                          </Link>
                          <Link
                            href="/resume-analysis"
                            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--primary-strong)] transition-colors"
                            onClick={() => setSolutionsOpen(false)}
                          >
                            Score Breakdown
                          </Link>
                        </div>
                      </div>

                      {/* Column 2: Mock Interview & Learning */}
                      <div className="flex flex-col gap-3 px-4">
                        <div className="mb-1 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--surface-muted)] text-[var(--primary-strong)]">
                          <Video className="size-4.5" />
                        </div>
                        <h4 className="text-sm font-semibold text-[var(--text)]">
                          Interview & Skills
                        </h4>
                        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                          Real-time AI video interviews with voice, turn-taking,
                          and tailored gap curriculum.
                        </p>
                        <div className="mt-1 flex flex-col gap-1">
                          <Link
                            href="/mock-interview/preparation"
                            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--primary-strong)] transition-colors"
                            onClick={() => setSolutionsOpen(false)}
                          >
                            Video Practice Room
                          </Link>
                          <Link
                            href="/learning"
                            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--primary-strong)] transition-colors"
                            onClick={() => setSolutionsOpen(false)}
                          >
                            Learning Path
                          </Link>
                        </div>
                      </div>

                      {/* Column 3: Featured Card */}
                      <div className="flex flex-col pl-4">
                        <span className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                          Featured
                        </span>
                        <Link
                          href="/mock-interview/preparation"
                          className="group relative flex flex-1 flex-col justify-between overflow-hidden rounded-2xl border border-[var(--border)] p-4 transition-all hover:border-[var(--primary-strong)] hover:shadow-md"
                          style={{
                            backgroundColor: "var(--surface-muted)",
                          }}
                          onClick={() => setSolutionsOpen(false)}
                        >
                          <div>
                            <span className="badge badge-info mb-2 text-[10px] uppercase tracking-wider">
                              Live AI Studio
                            </span>
                            <h5 className="text-xs font-bold text-[var(--text)]">
                              Camera & Mic Readiness
                            </h5>
                            <p className="mt-1 text-[11px] text-[var(--text-muted)] leading-normal">
                              Test lighting, speech pace, and receive instant
                              feedback.
                            </p>
                          </div>
                          <div className="mt-3 flex items-center text-xs font-semibold text-[var(--primary-strong)]">
                            <span>Try session</span>
                            <AnimatedIcon
                              icon={ArrowUpRight}
                              size={13}
                              className="ml-1"
                              aria-hidden
                            />
                          </div>
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Link href="/community" className={navLinkClass}>
              Community
            </Link>
            <Link href="/teams" className={navLinkClass}>
              Team
            </Link>
          </div>

          {/* Action / Auth Section */}
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex sm:items-center sm:gap-1.5">
              <ThemeToggle compact />
              <Link
                href="/sign-in"
                className="rounded-full px-3.5 py-2 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--surface-muted)]"
                onMouseEnter={() => prefetchRoute("/sign-in")}
                onFocus={() => prefetchRoute("/sign-in")}
              >
                Sign in
              </Link>
            </div>

            <span
              onMouseEnter={() => prefetchRoute("/sign-up")}
              onFocus={() => prefetchRoute("/sign-up")}
            >
              <Link
                href="/sign-up"
                className="button button-primary hidden sm:inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold shadow-sm"
              >
                <span>Get started</span>
                <AnimatedIcon icon={ArrowRight} size={15} aria-hidden />
              </Link>
            </span>

            {/* Mobile Menu Trigger Button */}
            <div className="xl:hidden">
              <button
                ref={menuButtonRef}
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--text)] hover:bg-[var(--surface-muted)] transition-colors"
                aria-label="Open navigation"
                aria-expanded={mobileOpen}
                onClick={() => setMobileOpen(true)}
              >
                <AnimatedIcon icon={Menu} size={20} aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Drawer / Sheet */}
      {mobileOpen && (
        <div
          ref={dialogRef}
          className="fixed inset-0 z-50 flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
        >
          {/* Backdrop Scrim */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
            onClick={closeMobileMenu}
            aria-hidden="true"
          />

          {/* Drawer Content */}
          <div className="nav5-drawer relative z-10 flex h-full w-full max-w-sm flex-col border-l p-6 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-[var(--divider)]">
              <div className="flex items-center gap-2">
                <BrandMark />
                <span className="text-base font-bold text-[var(--text)]">
                  Career Copilot
                </span>
              </div>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)] transition-colors"
                aria-label="Close menu"
                onClick={closeMobileMenu}
              >
                <AnimatedIcon icon={X} size={18} idle={false} aria-hidden />
              </button>
            </div>

            {/* Navigation Links */}
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto py-6">
              <a
                href={sectionHref("practice")}
                className="rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface-muted)] transition-colors"
                onClick={closeAndFollowAnchor}
              >
                Practice
              </a>

              <a
                href={sectionHref("system")}
                className="rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface-muted)] transition-colors"
                onClick={closeAndFollowAnchor}
              >
                How it works
              </a>

              {/* Mobile Collapsible Platform section */}
              <div>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface-muted)] transition-colors"
                  onClick={() => setMobileSolutionsOpen((v) => !v)}
                  aria-expanded={mobileSolutionsOpen}
                >
                  <span>Platform Modules</span>
                  <ChevronDown
                    className={cn(
                      "size-4 text-[var(--text-muted)] transition-transform duration-200",
                      mobileSolutionsOpen && "rotate-180",
                    )}
                  />
                </button>
                {mobileSolutionsOpen && (
                  <div className="mt-1 ml-3 flex flex-col gap-1 border-l-2 border-[var(--divider)] pl-3">
                    <Link
                      href="/resume-analysis?tab=upload"
                      className="rounded-lg px-2.5 py-2 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--primary-strong)]"
                      onClick={closeMobileMenu}
                    >
                      Resume Analysis
                    </Link>
                    <Link
                      href="/mock-interview/preparation"
                      className="rounded-lg px-2.5 py-2 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--primary-strong)]"
                      onClick={closeMobileMenu}
                    >
                      Mock Interview Studio
                    </Link>
                    <Link
                      href="/learning"
                      className="rounded-lg px-2.5 py-2 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--primary-strong)]"
                      onClick={closeMobileMenu}
                    >
                      Learning Path
                    </Link>
                    <Link
                      href="/jobs"
                      className="rounded-lg px-2.5 py-2 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--primary-strong)]"
                      onClick={closeMobileMenu}
                    >
                      Recommended Jobs
                    </Link>
                  </div>
                )}
              </div>

              <Link
                href="/community"
                className="rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface-muted)] transition-colors"
                onClick={closeMobileMenu}
              >
                Community
              </Link>
              <Link
                href="/teams"
                className="rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface-muted)] transition-colors"
                onClick={closeMobileMenu}
              >
                Team
              </Link>

              <div className="my-2 border-t border-[var(--divider)] pt-2">
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-xs font-medium text-[var(--text-muted)]">
                    Theme
                  </span>
                  <ThemeToggle />
                </div>
              </div>

              <Link
                href="/sign-in"
                className="rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface-muted)] transition-colors"
                onClick={closeMobileMenu}
              >
                Sign in
              </Link>
            </div>

            {/* Bottom CTA */}
            <div className="pt-4 border-t border-[var(--divider)]">
              <Link
                href="/sign-up"
                className="button button-primary flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold shadow-sm"
                onClick={closeMobileMenu}
              >
                <span>Get started</span>
                <AnimatedIcon icon={ArrowRight} size={16} aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

export default Navigation5;
