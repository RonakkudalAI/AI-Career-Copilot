"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpenCheck, BriefcaseBusiness, FileSearch, Gauge, Menu, Mic2, Settings, X } from "lucide-react";
import { routes } from "@/lib/routes";
import { createClient } from "@/lib/supabase/client";
import { apiRequest } from "@/lib/api/client";
import { ThemeToggle } from "@/components/theme-toggle";
import { ProfileCompletionToast } from "@/components/profile-completion-toast";
import {
  PROFILE_UPDATED_EVENT,
  extractMissing,
  resolveCompletion,
  type ProfileMissingItem,
  type ProfileUpdatedDetail,
} from "@/lib/profile-completion";

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

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [profileMenu, setProfileMenu] = useState(false);
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  // Live score from last profile mutation (server payload) until bootstrap catches up.
  const [liveCompletion, setLiveCompletion] = useState<{
    completion: number;
    missing: ProfileMissingItem[];
  } | null>(null);
  const fetchGen = useRef(0);

  const loadBootstrap = useCallback(() => {
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

  async function logout() {
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
  const avatarUrl = bootstrap?.profile?.avatar_url || null;
  const fromBootstrap = completionFromBootstrap(bootstrap);
  const completion = liveCompletion?.completion ?? fromBootstrap.completion;
  const missing: ProfileMissingItem[] = liveCompletion?.missing ?? fromBootstrap.missing;

  return (
    <div className="workspace">
      <aside className={`sidebar ${open ? "open" : ""}`} aria-label="Workspace navigation">
        <div className="row">
          <Link className="brand" href="/">
            <Image src="/brand/logo-mark.svg" width={38} height={38} alt="" />
            Career Copilot
          </Link>
          {open && (
            <button className="icon-button" onClick={() => setOpen(false)} aria-label="Close navigation">
              <X />
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
                <Icon size={19} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="workspace-main">
        <header className="app-header">
          <button className="icon-button mobile-sidebar-button" onClick={() => setOpen(true)} aria-label="Open navigation">
            <Menu />
          </button>
          <strong className="app-header-title">Career Copilot</strong>
          <div className="app-header-actions">
            <ThemeToggle />
            <div className="profile-menu-wrap">
              <button
                className="avatar"
                onClick={() => setProfileMenu(!profileMenu)}
                aria-label="Open profile menu"
                aria-expanded={profileMenu}
                aria-haspopup="menu"
              >
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" className="avatar-image" />
                ) : (
                  initials
                )}
              </button>
              {profileMenu && (
                <div className="panel stack profile-menu" role="menu">
                  <Link href="/settings/profile">View profile</Link>
                  <Link href="/settings/account">Account settings</Link>
                  <button className="button button-secondary" onClick={logout}>
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
