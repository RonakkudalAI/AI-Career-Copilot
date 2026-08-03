"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BookOpenCheck, BriefcaseBusiness, FileSearch, Gauge, Menu, Mic2, PanelLeftClose, PanelLeftOpen, Settings, X } from "lucide-react";
import { routes } from "@/shared/routes";
import { createClient } from "@/features/auth/api/client";
import { apiRequest } from "@/shared/api/client";
import { ProfileCompletionToast } from "@/features/profile/components/profile-completion-toast";
import {
  PROFILE_UPDATED_EVENT,
  extractMissing,
  resolveCompletion,
  type ProfileMissingItem,
  type ProfileUpdatedDetail,
} from "@/features/profile/model/profile-completion";

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
  return typeof document !== "undefined" && document.cookie.split("; ").includes("career_copilot_demo=1");
}

function subscribeDemoMode() {
  return () => undefined;
}

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [profileMenu, setProfileMenu] = useState(false);
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const demoMode = useSyncExternalStore(subscribeDemoMode, readDemoMode, () => false);
  // Live score from last profile mutation (server payload) until bootstrap catches up.
  const [liveCompletion, setLiveCompletion] = useState<{
    completion: number;
    missing: ProfileMissingItem[];
  } | null>(null);
  const fetchGen = useRef(0);

  const loadBootstrap = useCallback(() => {
    if (document.cookie.split("; ").includes("career_copilot_demo=1")) return;
    const gen = ++fetchGen.current;
    apiRequest<Bootstrap>("/me/bootstrap")
      .then((data) => {
        if (gen !== fetchGen.current) return; // ignore stale responses
        setBootstrap(data);
        setLiveCompletion(null);
      })
      .catch(() => {
        if (gen !== fetchGen.current) return;
        setBootstrap(null);
      });
  }, []);

  // Initial load once per shell mount.
  useEffect(() => {
    loadBootstrap();
  }, [loadBootstrap]);

  // Keep toast/completion in sync after profile mutations.
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
      // Re-fetch bootstrap so percentage matches authoritative server recalculation.
      loadBootstrap();
    }
    window.addEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);
    return () => window.removeEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);
  }, [loadBootstrap]);

  // When leaving Settings, refresh once so UI matches latest server score.
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

  // Close profile menu on outside click or Escape.
  useEffect(() => {
    if (!profileMenu) return;
    function onPointerDown(event: MouseEvent | PointerEvent) {
      const target = event.target as Node | null;
      const wrap = document.querySelector(".profile-menu-wrap");
      if (wrap && target && !wrap.contains(target)) {
        setProfileMenu(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setProfileMenu(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [profileMenu]);

  // Close mobile sidebar on Escape.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  async function logout() {
    if (demoMode) {
      document.cookie = "career_copilot_demo=; Max-Age=0; Path=/; SameSite=Lax";
      router.replace("/");
      router.refresh();
      return;
    }
    await createClient()?.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  const initials = (bootstrap?.profile?.full_name || "User")
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
        <div className="row sidebar-header">
          <Link className="brand" href="/" onClick={() => setOpen(false)} aria-label="Career Copilot home">
            <span className="sidebar-brand-full">Career Copilot</span>
            <span className="sidebar-brand-short" aria-hidden="true">CC</span>
          </Link>
          <button
            type="button"
            className="icon-button sidebar-collapse-button"
            onClick={() => setCollapsed((current) => !current)}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            aria-expanded={!collapsed}
          >
            {collapsed ? <PanelLeftOpen size={19} aria-hidden /> : <PanelLeftClose size={19} aria-hidden />}
          </button>
          {open && (
            <button type="button" className="icon-button" onClick={() => setOpen(false)} aria-label="Close navigation">
              <X size={20} aria-hidden />
            </button>
          )}
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
              >
                <Icon size={19} aria-hidden />
                <span className="sidebar-link-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="workspace-main">
        <header className="app-header">
          <button
            type="button"
            className="icon-button mobile-sidebar-button"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
            aria-expanded={open}
          >
            <Menu size={20} aria-hidden />
          </button>
          <strong className="app-header-title">Career Copilot</strong>
          <div className="app-header-actions">
            {demoMode && <span className="demo-banner">Demo preview · no account data</span>}
            <div className="profile-menu-wrap">
              <button
                type="button"
                className="avatar"
                onClick={() => setProfileMenu((current) => !current)}
                aria-label="Open profile menu"
                aria-expanded={profileMenu}
                aria-haspopup="menu"
              >
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt=""
                    className="avatar-image"
                    onError={() => setFailedAvatarUrl(avatarUrl)}
                  />
                ) : (
                  initials
                )}
              </button>
              {profileMenu && (
                <div className="panel stack profile-menu" role="menu">
                  <Link role="menuitem" href="/settings/profile" onClick={() => setProfileMenu(false)}>
                    View profile
                  </Link>
                  <Link role="menuitem" href="/settings/account" onClick={() => setProfileMenu(false)}>
                    Account settings
                  </Link>
                  <button type="button" className="button button-secondary" role="menuitem" onClick={logout}>
                    Logout
                  </button>
                </div>
              )}
            </div>
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
