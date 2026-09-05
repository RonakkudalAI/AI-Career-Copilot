import { useLocation, useNavigate } from "react-router-dom";
import { Link } from "@/shared/ui/router-link";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ChevronUp, LogOut, Settings, UserRound } from "lucide-react";
import { CareerIcon, type CareerIconName } from "@/components/ui/career-icons";
import { AnimatedIcon } from "@/components/ui/animated-icon";
import { ThemeToggle } from "@/shared/ui/theme-toggle";
import { BrandMark } from "@/components/ui/brand-mark";
import { routes } from "@/shared/routes";
import { createClient } from "@/features/auth/api/client";
import { ProfileCompletionToast } from "@/features/profile/components/profile-completion-toast";
import {
  PROFILE_UPDATED_EVENT,
  applyLiveCompletionDetail,
  type ProfileMissingItem,
  type ProfileUpdatedDetail,
} from "@/features/profile/model/profile-completion";
import { isDemoSession } from "@/features/auth/demo-session";
import { DEMO_COOKIE_NAME } from "@/shared/config";
import { prefetchRoute, prefetchWorkspace } from "@/shared/route-prefetch";
import {
  completionFromBootstrap,
  useWorkspaceBootstrap,
} from "@/features/workspace/bootstrap-context";

/** Primary nav only — Settings lives in the profile account menu. */
const navigation = [
  {
    href: routes.dashboard,
    label: "Dashboard",
    shortLabel: "Home",
    icon: "dashboard" as CareerIconName,
  },
  {
    href: routes.resume,
    label: "Resume Analysis",
    shortLabel: "Resume",
    icon: "resume" as CareerIconName,
  },
  {
    href: routes.interview,
    label: "Mock Interview",
    shortLabel: "Interview",
    icon: "interview" as CareerIconName,
  },
  {
    href: routes.learning,
    label: "Learning Path",
    shortLabel: "Learn",
    icon: "learning" as CareerIconName,
  },
  {
    href: routes.jobs,
    label: "Recommended Jobs",
    shortLabel: "Jobs",
    icon: "opportunities" as CareerIconName,
  },
  {
    href: routes.community,
    label: "Community",
    shortLabel: "People",
    icon: "profile" as CareerIconName,
  },
];

function readDemoMode() {
  return isDemoSession();
}

function subscribeDemoMode() {
  return () => undefined;
}

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { data: bootstrap } = useWorkspaceBootstrap();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const demoMode = useSyncExternalStore(
    subscribeDemoMode,
    readDemoMode,
    () => false,
  );
  const [liveCompletion, setLiveCompletion] = useState<{
    completion: number;
    missing: ProfileMissingItem[];
  } | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const profileMenuId = useId();

  // Optimistic completion from profile events (provider also refreshes bootstrap).
  useEffect(() => {
    function onProfileUpdated(event: Event) {
      const detail = (event as CustomEvent<ProfileUpdatedDetail>).detail;
      const live = applyLiveCompletionDetail(detail);
      if (live) setLiveCompletion(live);
    }
    window.addEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);
    return () =>
      window.removeEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);
  }, []);

  // Clear optimistic overlay when shared bootstrap catches up.
  useEffect(() => {
    if (bootstrap) setLiveCompletion(null);
  }, [bootstrap]);

  useEffect(() => {
    prefetchWorkspace();
  }, []);

  useEffect(() => {
    if (!profileMenuOpen) return;

    function onPointerDown(event: PointerEvent) {
      const root = profileMenuRef.current;
      if (!root) return;
      const target = event.target;
      if (target instanceof Node && !root.contains(target)) {
        setProfileMenuOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setProfileMenuOpen(false);
    }

    // Defer so the opening click does not immediately count as an outside click.
    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", onPointerDown);
    }, 0);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [profileMenuOpen]);

  // Close account menu only when the route actually changes (not on mount).
  const prevMenuPathRef = useRef(pathname);
  useEffect(() => {
    if (prevMenuPathRef.current !== pathname) {
      prevMenuPathRef.current = pathname;
      setProfileMenuOpen(false);
    }
  }, [pathname]);

  const fullName = bootstrap?.profile?.full_name || "Your account";
  const firstName = fullName.split(" ")[0] || "You";
  const initials = fullName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const profileAvatarUrl = bootstrap?.profile?.avatar_url || null;
  const avatarUrl =
    profileAvatarUrl && profileAvatarUrl !== failedAvatarUrl
      ? profileAvatarUrl
      : null;
  const fromBootstrap = completionFromBootstrap(bootstrap);
  const completion = liveCompletion?.completion ?? fromBootstrap.completion;
  const missing: ProfileMissingItem[] =
    liveCompletion?.missing ?? fromBootstrap.missing;
  const showCompletionPercent = completion < 100;
  const activeNav =
    navigation.find(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    )?.label || (pathname.startsWith("/settings") ? "Settings" : "Workspace");

  function closeMenus() {
    setProfileMenuOpen(false);
  }

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await createClient()?.auth.signOut();
      // Ensure demo mode does not trap the next visit after logout.
      document.cookie = `${DEMO_COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax`;
      closeMenus();
      navigate("/");
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="workspace">
      <aside className="sidebar" aria-label="Workspace navigation">
        <div className="sidebar-top">
          <div className="row sidebar-header">
            <Link
              className="brand"
              href={routes.dashboard}
              onMouseEnter={() => prefetchRoute(routes.dashboard)}
              onFocus={() => prefetchRoute(routes.dashboard)}
              aria-label="Career Copilot dashboard"
            >
              <BrandMark compact />
              <span className="sidebar-brand-full">Career Copilot</span>
            </Link>
          </div>

          <nav className="sidebar-nav">
            {navigation.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onMouseEnter={() => prefetchRoute(item.href)}
                  onFocus={() => prefetchRoute(item.href)}
                  className={`sidebar-link ${active ? "active" : ""}`}
                  aria-current={active ? "page" : undefined}
                  title={item.label}
                >
                  <span className="sidebar-link-icon" aria-hidden>
                    <CareerIcon name={item.icon} size={18} />
                  </span>
                  <span className="sidebar-link-label">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-profile-menu-wrap" ref={profileMenuRef}>
            {/* Menu sits above the trigger in normal flow so it is never clipped by absolute positioning. */}
            {profileMenuOpen ? (
              <div
                id={profileMenuId}
                className="sidebar-account-menu"
                role="menu"
                aria-label="Account options"
              >
                <div className="sidebar-account-menu-head">
                  <span
                    className="sidebar-profile-avatar sidebar-account-menu-avatar"
                    aria-hidden
                  >
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt=""
                        className="avatar-image"
                        onError={() => setFailedAvatarUrl(avatarUrl)}
                      />
                    ) : (
                      initials
                    )}
                  </span>
                  <div className="sidebar-account-menu-identity">
                    <p className="sidebar-account-menu-name">{fullName}</p>
                    {showCompletionPercent ? (
                      <>
                        <p className="sidebar-account-menu-sub">
                          {completion}% complete
                        </p>
                        <div
                          className="sidebar-account-menu-progress"
                          role="progressbar"
                          aria-valuenow={completion}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label="Profile completion"
                        >
                          <span
                            style={{
                              width: `${Math.max(0, Math.min(100, completion))}%`,
                            }}
                          />
                        </div>
                      </>
                    ) : (
                      <p className="sidebar-account-menu-sub">
                        Profile complete
                      </p>
                    )}
                  </div>
                </div>

                <div className="sidebar-account-menu-actions" role="none">
                  <div
                    className="sidebar-account-menu-item theme-menu-item"
                    role="none"
                  >
                    <ThemeToggle />
                  </div>
                  <Link
                    href="/settings/profile"
                    className="sidebar-account-menu-item"
                    role="menuitem"
                    onClick={closeMenus}
                    onMouseEnter={() => prefetchRoute("/settings/profile")}
                    onFocus={() => prefetchRoute("/settings/profile")}
                  >
                    <AnimatedIcon icon={UserRound} size={16} aria-hidden />
                    View profile
                  </Link>
                  <Link
                    href="/settings/account"
                    className="sidebar-account-menu-item"
                    role="menuitem"
                    onClick={closeMenus}
                    onMouseEnter={() => prefetchRoute("/settings/account")}
                    onFocus={() => prefetchRoute("/settings/account")}
                  >
                    <AnimatedIcon icon={Settings} size={16} aria-hidden />
                    Settings
                  </Link>
                  <button
                    type="button"
                    className="sidebar-account-menu-item is-danger"
                    role="menuitem"
                    disabled={loggingOut}
                    onClick={() => void logout()}
                  >
                    <AnimatedIcon icon={LogOut} size={16} aria-hidden />
                    {loggingOut ? "Signing out…" : "Logout"}
                  </button>
                </div>
              </div>
            ) : null}

            <button
              type="button"
              className={`sidebar-profile-card ${profileMenuOpen ? "is-open" : ""}`}
              onClick={(event) => {
                event.stopPropagation();
                setProfileMenuOpen((current) => !current);
              }}
              aria-haspopup="menu"
              aria-expanded={profileMenuOpen}
              aria-controls={profileMenuOpen ? profileMenuId : undefined}
              title="Account menu"
            >
              <span className="sidebar-profile-avatar" aria-hidden>
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    className="avatar-image"
                    onError={() => setFailedAvatarUrl(avatarUrl)}
                  />
                ) : (
                  initials
                )}
              </span>
              <span className="sidebar-profile-meta">
                <span className="sidebar-profile-name">{firstName}</span>
                {showCompletionPercent ? (
                  <span className="sidebar-profile-sub">
                    {completion}% complete
                  </span>
                ) : (
                  <span className="sidebar-profile-sub">Account</span>
                )}
              </span>
              <AnimatedIcon
                icon={ChevronUp}
                className={`sidebar-profile-caret ${profileMenuOpen ? "is-open" : ""}`}
                size={16}
                aria-hidden
              />
            </button>
          </div>
        </div>
      </aside>

      <div className="workspace-main">
        <header className="app-header">
          <div className="app-header-left">
            <div className="app-header-titles">
              <strong className="app-header-title">{activeNav}</strong>
              <span className="app-header-kicker">Career workspace</span>
            </div>
          </div>

          <div className="app-header-actions">
            {demoMode ? (
              <span className="demo-banner">Demo · no account data</span>
            ) : null}
          </div>
        </header>

        <main id="main-content" className="workspace-content">
          {children}
        </main>
        <ProfileCompletionToast completion={completion} missing={missing} />
      </div>

      <nav className="mobile-bottom-nav" aria-label="Primary">
        {navigation.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              onMouseEnter={() => prefetchRoute(item.href)}
              onFocus={() => prefetchRoute(item.href)}
              className={active ? "active" : ""}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
            >
              <span className="mobile-bottom-nav-icon" aria-hidden>
                <CareerIcon name={item.icon} size={20} />
              </span>
              <span className="mobile-bottom-nav-label">{item.shortLabel}</span>
            </Link>
          );
        })}
        <Link
          href="/settings/profile"
          onMouseEnter={() => prefetchRoute("/settings/profile")}
          onFocus={() => prefetchRoute("/settings/profile")}
          className={pathname.startsWith("/settings") ? "active" : ""}
          aria-current={pathname.startsWith("/settings") ? "page" : undefined}
        >
          <span className="mobile-bottom-nav-icon" aria-hidden>
            <AnimatedIcon icon={Settings} size={20} />
          </span>
          <span className="mobile-bottom-nav-label">Profile</span>
        </Link>
      </nav>
    </div>
  );
}
