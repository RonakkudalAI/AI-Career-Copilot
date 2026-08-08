import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";
import { apiRequest } from "@/shared/api/client";
import {
  PROFILE_UPDATED_EVENT,
  extractMissing,
  resolveCompletion,
  type ProfileMissingItem,
} from "@/features/profile/model/profile-completion";

/** Full `/me/bootstrap` payload used by shell + dashboard (and future pages). */
export type WorkspaceBootstrap = {
  profile: {
    full_name?: string;
    avatar_url?: string | null;
    avatar_path?: string | null;
    profile_completion?: number;
    profile_completion_details?: { missing?: ProfileMissingItem[]; total?: number };
  } | null;
  active_resume: { id: string } | null;
  counts?: Record<string, number>;
  active_job_description?: { title: string; role_title?: string | null } | null;
  latest_ats_analysis?: { id: string; overall_score: number | null; status: string } | null;
  latest_actions?: {
    last_resume_upload?: {
      resume_id?: string | null;
      title?: string | null;
      filename?: string | null;
      created_at?: string | null;
    } | null;
    last_interview?: {
      id?: string | null;
      label?: string | null;
      status?: string | null;
      at?: string | null;
    } | null;
    last_job_applied?: {
      job_id?: string | null;
      label?: string | null;
      title?: string | null;
      company?: string | null;
      status?: string | null;
      is_application?: boolean;
      at?: string | null;
    } | null;
  } | null;
  interview_progress?: {
    sessions_total?: number;
    sessions_completed?: number;
    sessions_with_scores?: number;
    latest_overall?: number | null;
    previous_overall?: number | null;
    delta?: number | null;
    best_overall?: number | null;
    average_overall?: number | null;
    trend?: string;
    history?: unknown[];
    dimensions?: Record<string, unknown>;
  } | null;
  capabilities?: Record<string, boolean>;
  recent_activity?: Array<{
    id: string;
    event_type: string;
    summary: string;
    created_at: string;
  }>;
  workspace?: {
    profile_completion?: number;
    profile_missing?: ProfileMissingItem[];
    profile_completion_details?: { missing?: ProfileMissingItem[]; total?: number };
    has_active_resume?: boolean;
    has_confirmed_resume?: boolean;
    failed_ats_count?: number;
    ready_for_ats?: boolean;
  };
};

type BootstrapContextValue = {
  data: WorkspaceBootstrap | null;
  error: string;
  loading: boolean;
  refresh: () => void;
};

const WorkspaceBootstrapContext = createContext<BootstrapContextValue | null>(null);

export function WorkspaceBootstrapProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [data, setData] = useState<WorkspaceBootstrap | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const fetchGen = useRef(0);

  const refresh = useCallback(() => {
    const gen = ++fetchGen.current;
    setLoading(true);
    setError("");
    apiRequest<WorkspaceBootstrap>("/me/bootstrap")
      .then((payload) => {
        if (gen !== fetchGen.current) return;
        setData(payload);
        setError("");
      })
      .catch((err: Error) => {
        if (gen !== fetchGen.current) return;
        // Keep last-good snapshot so a flaky refresh does not blank the shell/dashboard.
        setError(err?.message || "Could not load workspace bootstrap.");
        console.warn("[workspace] bootstrap failed:", err?.message || err);
      })
      .finally(() => {
        if (gen === fetchGen.current) setLoading(false);
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    function onProfileUpdated() {
      refresh();
    }
    window.addEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);
    return () => window.removeEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);
  }, [refresh]);

  // Leaving settings often mutates profile — soft refresh once.
  const prevPathRef = useRef(pathname);
  useEffect(() => {
    const prev = prevPathRef.current;
    prevPathRef.current = pathname;
    if (prev?.startsWith("/settings") && !pathname?.startsWith("/settings")) {
      refresh();
    }
  }, [pathname, refresh]);

  const value = useMemo(
    () => ({ data, error, loading, refresh }),
    [data, error, loading, refresh],
  );

  return (
    <WorkspaceBootstrapContext.Provider value={value}>{children}</WorkspaceBootstrapContext.Provider>
  );
}

export function useWorkspaceBootstrap(): BootstrapContextValue {
  const ctx = useContext(WorkspaceBootstrapContext);
  if (!ctx) {
    throw new Error("useWorkspaceBootstrap must be used within WorkspaceBootstrapProvider");
  }
  return ctx;
}

/** Optional access for components that may render outside the workspace tree. */
export function useWorkspaceBootstrapOptional(): BootstrapContextValue | null {
  return useContext(WorkspaceBootstrapContext);
}

export function completionFromBootstrap(data: WorkspaceBootstrap | null): {
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
