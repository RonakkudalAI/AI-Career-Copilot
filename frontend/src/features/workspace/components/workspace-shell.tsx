import { useLocation, useNavigate } from "react-router-dom";
import { Link } from "@/shared/ui/router-link";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import {
  BookOpenCheck,
  BriefcaseBusiness,
  ChevronUp,
  FileSearch,
  Gauge,
  LogOut,
  Menu,
  Mic2,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  UserRound,
  X,
} from "lucide-react";
import { routes } from "@/shared/routes";
import { apiRequest } from "@/shared/api/client";
import { createClient } from "@/features/auth/api/client";
import { ProfileCompletionToast } from "@/features/profile/components/profile-completion-toast";
import {
  PROFILE_UPDATED_EVENT,
  extractMissing,
  resolveCompletion,
  type ProfileMissingItem,
  type ProfileUpdatedDetail,
} from "@/features/profile/model/profile-completion";
import { isDemoSession } from "@/features/auth/demo-session";
import { DEMO_COOKIE_NAME } from "@/shared/config";

/** Primary nav only — Settings lives in the profile account menu. */
const navigation = [
  { href: routes.dashboard, label: "Dashboard", icon: Gauge },
  { href: routes.resume, label: "Resume Analysis", icon: FileSearch },
  { href: routes.interview, label: "Mock Interview", icon: Mic2 },
  { href: routes.learning, label: "Learning Path", icon: BookOpenCheck },
  { href: routes.jobs, label: "Recommended Jobs", icon: BriefcaseBusiness },
];

type Bootstrap = {
  profile: {
    full_name?: string;
    avatar_url?: string | null;
    avatar_path?: string | null;
    profile_completion?: number;
    profile_completion_details?: { missing?: ProfileMissingItem[]; total?: number };
  } | null;
  active_resume: { id: string } | null;
  workspace?: {
    profile_completion?: number;
    profile_missing?: ProfileMissingItem[];
    profile_completion_details?: { missing?: ProfileMissingItem[]; total?: number };
  };
};

function completionFromBootstrap(data: Bootstrap | null): {
  completion: number;
  missing: ProfileMissingItem[];
} {
  if (!data) return { completion: 0, missing: [] };
  const details =
    data.workspace?.profile_completion_details || data.profile?.profile_completion_details || null;
  const missing = extractMissing(details, data.workspace?.profile_missing);
  const completion = resolveCompletion(
    data.workspace?.profile_completion ?? data.profile?.profile_completion,
    details,
    missing,
  );
  return { completion, missing };
}

function readDemoMode() {
  return isDemoSession();
}

function subscribeDemoMode() {
  return () => undefined;
}

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const demoMode = useSyncExternalStore(subscribeDemoMode, readDemoMode, () => false);
  const [liveCompletion, setLiveCompletion] = useState<{
    completion: number;
    missing: ProfileMissingItem[];
  } | null>(null);
  const fetchGen = useRef(0);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const profileMenuId = useId();

  const loadBootstrap = useCallback(() => {
    // Always call bootstrap — demo mode is served by demoApiRequest in-memory,
    // real mode hits Firestore. Skipping here left the shell empty forever.
    const gen = ++fetchGen.current;
    apiRequest<Bootstrap>("/me/bootstrap")
      .then((data) => {
        if (gen !== fetchGen.current) return;
        setBootstrap(data);
        setLiveCompletion(null);
      })
      .catch((err: Error) => {
        if (gen !== fetchGen.current) return;
        setBootstrap(null);
        console.warn("[workspace] bootstrap failed:", err?.message || err);
      });
  }, []);

  useEffect(() => {
    loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    function onProfileUpdated(event: Event) {
      const detail = (event as CustomEvent<ProfileUpdatedDetail>).detail;
      if (
        detail &&
        (detail.profile_completion != null ||
          detail.profile_missing ||
          detail.profile_completion_details)
      ) {
        const details = detail.profile_completion_details;
        const missing = extractMissing(details, detail.profile_missing);
        const completion = resolveCompletion(detail.profile_completion, details, missing);
        setLiveCompletion({ completion, missing });
      }
      loadBootstrap();
    }
    window.addEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);
    return () => window.removeEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);
  }, [loadBootstrap]);

  const prevPathRef = useRef(pathname);
  useEffect(() => {
    const prev = prevPathRef.current;
    prevPathRef.current = pathname;
    if (prev?.startsWith("/settings") && !pathname?.startsWith("/settings")) {
      loadBootstrap();
    }
  }, [pathname, loadBootstrap]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setProfileMenuOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

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
  const avatarUrl = profileAvatarUrl && profileAvatarUrl !== failedAvatarUrl ? profileAvatarUrl : null;
  const fromBootstrap = completionFromBootstrap(bootstrap);
  const completion = liveCompletion?.completion ?? fromBootstrap.completion;
  const missing: ProfileMissingItem[] = liveCompletion?.missing ?? fromBootstrap.missing;
  const showCompletionPercent = completion < 100;
  const activeNav =
    navigation.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))?.label ||
    (pathname.startsWith("/settings") ? "Settings" : "Workspace");

  function closeMenus() {
    setProfileMenuOpen(false);
    setOpen(false);
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
    <div className={`workspace ${collapsed ? "sidebar-collapsed" : ""}`}>
      {open ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => {
            setOpen(false);
            setProfileMenuOpen(false);
          }}
        />
      ) : null}

      <aside className={`sidebar ${open ? "open" : ""}`} aria-label="Workspace navigation">
        <div className="sidebar-top">
          <div className="row sidebar-header">
            <Link className="brand" href="/" onClick={() => setOpen(false)} aria-label="Career Copilot home">
              <span className="sidebar-brand-full">Career Copilot</span>
              <span className="sidebar-brand-short" aria-hidden="true">
                CC
              </span>
            </Link>
            <button
              type="button"
              className="icon-button sidebar-collapse-button"
              onClick={() => setCollapsed((current) => !current)}
              aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
              aria-expanded={!collapsed}
            >
              {collapsed ? <PanelLeftOpen size={18} aria-hidden /> : <PanelLeftClose size={18} aria-hidden />}
            </button>
            {open ? (
              <button type="button" className="icon-button" onClick={() => setOpen(false)} aria-label="Close navigation">
                <X size={18} aria-hidden />
              </button>
            ) : null}
          </div>

          <nav className="sidebar-nav">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`sidebar-link ${active ? "active" : ""}`}
                  aria-current={active ? "page" : undefined}
                  title={item.label}
                >
                  <span className="sidebar-link-icon" aria-hidden>
                    <Icon size={18} />
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
                  <span className="sidebar-profile-avatar sidebar-account-menu-avatar" aria-hidden>
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
                        <p className="sidebar-account-menu-sub">{completion}% complete</p>
                        <div
                          className="sidebar-account-menu-progress"
                          role="progressbar"
                          aria-valuenow={completion}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label="Profile completion"
                        >
                          <span style={{ width: `${Math.max(0, Math.min(100, completion))}%` }} />
                        </div>
                      </>
                    ) : (
                      <p className="sidebar-account-menu-sub">Profile complete</p>
                    )}
                  </div>
                </div>

                <div className="sidebar-account-menu-actions" role="none">
                  <Link
                    href="/settings/profile"
                    className="sidebar-account-menu-item"
                    role="menuitem"
                    onClick={closeMenus}
                  >
                    <UserRound size={16} aria-hidden />
                    View profile
                  </Link>
                  <Link
                    href="/settings/account"
                    className="sidebar-account-menu-item"
                    role="menuitem"
                    onClick={closeMenus}
                  >
                    <Settings size={16} aria-hidden />
                    Settings
                  </Link>
                  <button
                    type="button"
                    className="sidebar-account-menu-item is-danger"
                    role="menuitem"
                    disabled={loggingOut}
                    onClick={() => void logout()}
                  >
                    <LogOut size={16} aria-hidden />
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
                  <span className="sidebar-profile-sub">{completion}% complete</span>
                ) : (
                  <span className="sidebar-profile-sub">Account</span>
                )}
              </span>
              <ChevronUp
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
            <button
              type="button"
              className="icon-button mobile-sidebar-button"
              onClick={() => setOpen(true)}
              aria-label="Open navigation"
              aria-expanded={open}
            >
              <Menu size={18} aria-hidden />
            </button>
            <div className="app-header-titles">
              <strong className="app-header-title">{activeNav}</strong>
              <span className="app-header-kicker">Career workspace</span>
            </div>
          </div>

          <div className="app-header-actions">
            {demoMode ? <span className="demo-banner">Demo · no account data</span> : null}

          </div>
        </header>

        <main id="main-content" className="workspace-content">
          {children}
        </main>
        <ProfileCompletionToast completion={completion} missing={missing} />
      </div>
    </div>
  );
}
