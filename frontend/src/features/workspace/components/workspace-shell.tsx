import { useLocation } from "react-router-dom";
import { Link } from "@/shared/ui/router-link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  BookOpenCheck,
  BriefcaseBusiness,
  FileSearch,
  Gauge,
  Menu,
  Mic2,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  X,
} from "lucide-react";
import { routes } from "@/shared/routes";
import { apiRequest } from "@/shared/api/client";
import { ProfileCompletionToast } from "@/features/profile/components/profile-completion-toast";
import {
  PROFILE_UPDATED_EVENT,
  extractMissing,
  resolveCompletion,
  type ProfileMissingItem,
  type ProfileUpdatedDetail,
} from "@/features/profile/model/profile-completion";
import { isDemoSession } from "@/features/auth/demo-session";

const navigation = [
  { href: routes.dashboard, label: "Dashboard", icon: Gauge },
  { href: routes.resume, label: "Resume Analysis", icon: FileSearch },
  { href: routes.interview, label: "Mock Interview", icon: Mic2 },
  { href: routes.learning, label: "Learning Path", icon: BookOpenCheck },
  { href: routes.jobs, label: "Recommended Jobs", icon: BriefcaseBusiness },
  { href: routes.settings, label: "Settings", icon: Settings },
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
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const demoMode = useSyncExternalStore(subscribeDemoMode, readDemoMode, () => false);
  const [liveCompletion, setLiveCompletion] = useState<{
    completion: number;
    missing: ProfileMissingItem[];
  } | null>(null);
  const fetchGen = useRef(0);

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
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

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
  const activeNav =
    navigation.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))?.label ||
    (pathname.startsWith("/settings") ? "Settings" : "Workspace");

  return (
    <div className={`workspace ${collapsed ? "sidebar-collapsed" : ""}`}>
      {open ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
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
          <Link
            href="/settings/profile"
            className="sidebar-profile-card"
            onClick={() => setOpen(false)}
            title="Open profile"
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
              <span className="sidebar-profile-sub">{completion}% complete</span>
            </span>
          </Link>
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
