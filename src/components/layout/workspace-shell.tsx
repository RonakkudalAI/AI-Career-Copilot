"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, BookOpenCheck, BriefcaseBusiness, FileSearch, Gauge, Menu, Mic2, Settings, X } from "lucide-react";
import { routes } from "@/lib/routes";
import { createClient } from "@/lib/supabase/client";
import { apiRequest } from "@/lib/api/client";

const navigation = [{ href: routes.dashboard, label: "Dashboard", icon: Gauge },{ href: routes.resume, label: "Resume Analysis", icon: FileSearch },{ href: routes.interview, label: "Mock Interview", icon: Mic2 },{ href: routes.learning, label: "Learning Path", icon: BookOpenCheck },{ href: routes.jobs, label: "Recommended Jobs", icon: BriefcaseBusiness },{ href: routes.settings, label: "Settings", icon: Settings }];
type Bootstrap = {
  profile: { full_name?: string; avatar_url?: string | null; avatar_path?: string | null } | null;
  active_resume: { title: string } | null;
  unread_notification_count: number;
};

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [profileMenu, setProfileMenu] = useState(false);
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  useEffect(() => {
    apiRequest<Bootstrap>("/me/bootstrap").then(setBootstrap).catch(() => setBootstrap(null));
  }, [pathname]);
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
        <div className="sidebar-bottom">
          <div className="resume-context">
            <span className="mono">Active resume</span>
            <strong>{bootstrap?.active_resume?.title || "No active resume"}</strong>
            <p>{bootstrap?.active_resume ? "Used for confirmed workflows" : "Upload and confirm a resume"}</p>
          </div>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="app-header">
          <button className="icon-button mobile-sidebar-button" onClick={() => setOpen(true)} aria-label="Open navigation">
            <Menu />
          </button>
          <strong className="app-header-title">Career Copilot</strong>
          <div className="app-header-actions">
            <span className="badge badge-success">Connected workspace</span>
            <button className="icon-button" aria-label={`${bootstrap?.unread_notification_count || 0} unread notifications`}>
              <Bell />
            </button>
            <div style={{ position: "relative" }}>
              <button className="avatar" onClick={() => setProfileMenu(!profileMenu)} aria-expanded={profileMenu}>
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" className="avatar-image" />
                ) : (
                  initials
                )}
              </button>
              {profileMenu && (
                <div className="panel stack" style={{ position: "absolute", right: 0, top: 52, width: 220, zIndex: 80 }}>
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
      </div>
    </div>
  );
}
