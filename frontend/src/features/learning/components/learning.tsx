import { Link } from "@/shared/ui/router-link";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpenCheck,
  CheckCircle2,
  Circle,
  ExternalLink,
  LoaderCircle,
  PlayCircle,
  Trash2,
  Sparkles,
  Video,
} from "lucide-react";
import { apiRequest, isAbortError } from "@/shared/api/client";
import LoadingState from "@/components/ui/loading-state";
import { Badge, Button, Progress } from "@/shared/ui/primitives";
import { AnimatedIcon } from "@/components/ui/animated-icon";
import type {
  AtsAnalysis,
  LearningItem,
  Path,
  Resource,
  ResourceProgressResponse,
} from "@/features/learning/learning-types";
import {
  applyHeartbeat,
  extractYoutubeVideoId,
  formatClock,
  isArticleResource,
  isExactVideo,
  isVideoResource,
  itemWatchPercent,
  resourceWatchPercent,
} from "@/features/learning/watch-progress";
import { YoutubeLessonPlayer, type LessonHeartbeat } from "@/features/learning/youtube-player";
import "@/features/learning/learning.css";

function pathStepCount(path: Path): number {
  if (typeof path.item_count === "number" && Number.isFinite(path.item_count)) {
    return path.item_count;
  }
  return (path.items || []).length;
}

function resourceBadgeLabel(resource: Resource) {
  if (isExactVideo(resource)) return "Video lesson";
  if (isVideoResource(resource)) return "Video search";
  if ((resource.resource_type || "").toLowerCase() === "docs_search") return "Docs";
  if (isArticleResource(resource)) return "Article / blog";
  return "Resource";
}

function resourceActionLabel(resource: Resource) {
  if (isExactVideo(resource)) return "Watch in path";
  if (isVideoResource(resource)) return "Browse video lessons";
  if ((resource.resource_type || "").toLowerCase() === "docs_search") return "Browse documentation";
  if (isArticleResource(resource)) return "Browse articles";
  return "Open resource";
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function scoreBand(score: number | null | undefined): "high" | "mid" | "low" | "none" {
  if (score == null || !Number.isFinite(Number(score))) return "none";
  const value = Number(score);
  if (value >= 80) return "high";
  if (value >= 55) return "mid";
  return "low";
}

function gapCount(analysis: AtsAnalysis): number {
  const missing = analysis.summary?.missing_terms?.length ?? analysis.score_breakdown?.missing_terms?.length ?? analysis.summary?.missing ?? 0;
  const partial = analysis.score_breakdown?.partial_terms?.length ?? 0;
  return Number(missing) + Number(partial);
}

function analysisLabel(analysis: AtsAnalysis): string {
  const role =
    analysis.job_description?.role_title ||
    analysis.job_description?.title ||
    "Job description";
  const company = analysis.job_description?.company;
  return company ? `${role} · ${company}` : role;
}

function pathForAnalysis(paths: Path[], analysisId: string): Path | undefined {
  return paths.find(
    (path) => path.source_type === "ats_analysis" && String(path.source_id || "") === String(analysisId),
  );
}

function pickResumePoint(path: Path): { itemId: string; resourceId: string } {
  const items = path.items || [];
  const lastItem = String(path.watch_summary?.last_item_id || "");
  const lastResource = String(path.watch_summary?.last_resource_id || "");
  if (lastItem && items.some((item) => item.id === lastItem)) {
    return { itemId: lastItem, resourceId: lastResource };
  }
  const incomplete = items.find((item) => itemWatchPercent(item) < 90) || items[0];
  if (!incomplete) return { itemId: "", resourceId: "" };
  const resources = incomplete.learning_resources || [];
  const resource =
    resources.find((row) => isExactVideo(row) && resourceWatchPercent(row) < 90) ||
    resources.find(isExactVideo) ||
    resources[0];
  return { itemId: incomplete.id, resourceId: resource?.id || "" };
}

function applyResourceToPath(
  path: Path,
  resourceId: string,
  patch: Partial<Resource>,
  extras?: { progress_percentage?: number; item_status?: LearningItem["status"]; item_watch_percent?: number; watch_summary?: Path["watch_summary"] },
): Path {
  const items = (path.items || []).map((item) => {
    const owns = (item.learning_resources || []).some((resource) => resource.id === resourceId);
    const resources = (item.learning_resources || []).map((resource) =>
      resource.id === resourceId ? { ...resource, ...patch } : resource,
    );
    const nextItem = { ...item, learning_resources: resources };
    const watch =
      owns && extras?.item_watch_percent != null ? extras.item_watch_percent : itemWatchPercent(nextItem);
    return {
      ...nextItem,
      watch_percent: watch,
      status:
        owns && extras?.item_status
          ? extras.item_status
          : watch >= 90
            ? "completed"
            : watch > 0
              ? "in_progress"
              : item.status,
    };
  });
  const progress =
    extras?.progress_percentage ??
    (items.length ? Math.round(items.reduce((sum, item) => sum + itemWatchPercent(item), 0) / items.length) : 0);
  return {
    ...path,
    items,
    progress_percentage: progress,
    watch_summary: extras?.watch_summary || path.watch_summary,
    status: progress === 100 && items.length ? "completed" : "active",
  };
}

export function LearningHome() {
  const navigate = useNavigate();
  const [paths, setPaths] = useState<Path[]>([]);
  const [analyses, setAnalyses] = useState<AtsAnalysis[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest<Path[]>("/learning-paths"),
      apiRequest<AtsAnalysis[]>("/ats-analyses"),
    ])
      .then(([pathRows, analysisRows]) => {
        if (!active) return;
        const nextPaths = Array.isArray(pathRows) ? pathRows : [];
        const nextAnalyses = (Array.isArray(analysisRows) ? analysisRows : []).filter(
          (row) => (row.status || "").toLowerCase() === "completed",
        );
        setError("");
        setPaths(nextPaths);
        setAnalyses(nextAnalyses);
        setSelectedId((current) => {
          if (current && nextAnalyses.some((row) => row.id === current)) return current;
          return nextAnalyses[0]?.id || "";
        });
      })
      .catch((reason: Error) => {
        if (active) setError(reason.message || "Could not load learning paths.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const selected = analyses.find((row) => row.id === selectedId) || null;
  const existingForSelected = selected ? pathForAnalysis(paths, selected.id) : undefined;

  async function generate() {
    if (!selectedId) {
      setError("Choose a completed ATS analysis first. Paths are built only from those evidence gaps.");
      return;
    }
    if (existingForSelected) {
      navigate(`/learning/${existingForSelected.id}`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const created = await apiRequest<Path>("/learning-paths/generate", {
        method: "POST",
        body: JSON.stringify({ source_analysis_id: selectedId }),
      });
      setPaths((current) => [created, ...current.filter((row) => row.id !== created.id)]);
      navigate(`/learning/${created.id}`);
    } catch (reason) {
      setError((reason as Error).message || "Could not build a path from that ATS analysis.");
    } finally {
      setBusy(false);
    }
  }

  async function deletePath(path: Path) {
    setDeletingId(path.id);
    setError("");
    try {
      await apiRequest(`/learning-paths/${path.id}`, { method: "DELETE" });
      setPaths((current) => current.filter((row) => row.id !== path.id));
      setConfirmDeleteId(null);
    } catch (reason) {
      setError((reason as Error).message || "The learning path could not be deleted.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="lp-page">
      <header className="lp-masthead">
        <div>
          <h1 className="lp-title">Learning path</h1>
          <p className="lp-sub">
            Build a study plan from skill gaps in your completed ATS analysis. Watch progress is
            stored as you play each lesson. Skipped time is not counted.
          </p>
        </div>
        <div className="lp-masthead-actions">
          <Button onClick={() => void generate()} disabled={busy || !selectedId || Boolean(deletingId)}>
            {busy ? (
              <AnimatedIcon icon={LoaderCircle} className="spin" idle={false} size={17} aria-hidden />
            ) : (
              <AnimatedIcon icon={Sparkles} size={17} aria-hidden />
            )}
            {existingForSelected ? "Open path from this ATS" : "Generate from ATS gaps"}
          </Button>
        </div>
      </header>

      {error ? (
        <div className="lp-alert" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      {busy ? <LoadingState label="Building your learning path" variant="Drive" /> : null}

      {loading ? (
        <div className="lp-loading" aria-label="Loading learning paths">
          <div className="lp-skeleton" />
          <div className="lp-skeleton" />
        </div>
      ) : (
        <>
          <section className="lp-section" aria-labelledby="lp-ats-heading">
            <div className="lp-section-head">
              <h2 className="lp-section-title" id="lp-ats-heading">
                Choose a completed ATS analysis
              </h2>
              <p className="lp-summary-line">
                <strong>{analyses.length}</strong> completed runs
              </p>
            </div>
            {analyses.length === 0 ? (
              <div className="lp-empty">
                <h2>No completed ATS analysis yet</h2>
                <p>
                  Complete a resume-vs-JD ATS analysis first. Paths are built only from those
                  evidence gaps. Skills are never invented.
                </p>
                <Link className="button button-primary" href="/resume-analysis?tab=upload">
                  Open Resume Analysis
                </Link>
              </div>
            ) : (
              <div className="lp-ledger">
                {analyses.map((analysis) => {
                  const linked = pathForAnalysis(paths, analysis.id);
                  const selectedRun = analysis.id === selectedId;
                  return (
                    <button
                      type="button"
                      key={analysis.id}
                      className={`lp-run${selectedRun ? " is-selected" : ""}`}
                      onClick={() => setSelectedId(analysis.id)}
                      aria-pressed={selectedRun}
                    >
                      <span className="lp-scoretile" data-band={scoreBand(analysis.overall_score)}>
                        {analysis.overall_score == null ? "—" : Math.round(Number(analysis.overall_score))}
                        <small>ATS</small>
                      </span>
                      <span className="lp-run-main">
                        <span className="lp-run-pair">{analysisLabel(analysis)}</span>
                        <span className="lp-run-meta">
                          {(analysis.resume?.title || "Resume") +
                            " · " +
                            gapCount(analysis) +
                            " skill gaps"}
                        </span>
                        <span className="lp-run-time">{formatDate(analysis.completed_at || analysis.created_at)}</span>
                      </span>
                      <span className="lp-run-side">
                        {linked ? (
                          <Badge tone="success">Path {linked.progress_percentage}%</Badge>
                        ) : (
                          <Badge variant="secondary">No path yet</Badge>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="lp-section" aria-labelledby="lp-paths-heading">
            <div className="lp-section-head">
              <h2 className="lp-section-title" id="lp-paths-heading">
                Your paths
              </h2>
              <p className="lp-summary-line">
                <strong>{paths.length}</strong> saved
              </p>
            </div>
            {paths.length === 0 ? (
              <div className="lp-empty">
                <h2>No learning path yet</h2>
                <p>
                  Select a completed ATS analysis above, then generate a path. Each step maps a real
                  evidence gap to free video lessons and blogs/articles.
                </p>
              </div>
            ) : (
              <div className="lp-path-grid">
                {paths.map((path) => {
                  const steps = pathStepCount(path);
                  const watched = path.watch_summary?.watched_percent ?? path.progress_percentage;
                  return (
                    <article key={path.id} className="lp-path-card">
                      <div className="lp-path-card-head">
                        <div>
                          <span className="status-chip" data-tone={watched === 100 ? "success" : "info"}>
                            {(path.status || "active").replaceAll("_", " ")}
                          </span>
                          <h2>{path.title}</h2>
                        </div>
                        <Badge variant={watched === 100 ? "default" : "secondary"}>{watched}%</Badge>
                      </div>
                      <p>
                        {path.source_snapshot?.role_title
                          ? `From ATS · ${path.source_snapshot.role_title}`
                          : path.description ||
                            "Built from stored ATS evidence with free lesson resources for each gap."}
                      </p>
                      <Progress value={watched} label="Watch progress" />
                      <div className="lp-chip-row">
                        <Badge variant="secondary">Skill gaps</Badge>
                        {steps > 0 && <span className="muted">{steps} steps</span>}
                        {path.watch_summary?.last_resource_title ? (
                          <span className="muted">Last: {path.watch_summary.last_resource_title}</span>
                        ) : null}
                      </div>
                      {confirmDeleteId === path.id ? (
                        <div className="lp-confirm">
                          <p>Delete this path and its watch history from your account?</p>
                          <div className="lp-chip-row">
                            <Button
                              variant="destructive"
                              disabled={deletingId === path.id}
                              onClick={() => void deletePath(path)}
                            >
                              {deletingId === path.id ? "Deleting…" : "Delete permanently"}
                            </Button>
                            <Button variant="ghost" onClick={() => setConfirmDeleteId(null)}>
                              Keep path
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="lp-path-actions">
                          <Link className="button button-secondary" href={`/learning/${path.id}`}>
                            {watched > 0 ? "Continue watching" : "Open path & track progress"}
                          </Link>
                          <Button
                            variant="destructive"
                            disabled={deletingId === path.id || busy}
                            onClick={() => setConfirmDeleteId(path.id)}
                            aria-label={`Delete learning path ${path.title}`}
                          >
                            <AnimatedIcon icon={Trash2} size={17} aria-hidden />
                            Delete
                          </Button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export function LearningPath({ pathId }: { pathId: string }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [path, setPath] = useState<Path | null>(null);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [playerError, setPlayerError] = useState("");
  const persistTimer = useRef<number | null>(null);
  const pendingRef = useRef<{
    resourceId: string;
    position_seconds: number;
    duration_seconds: number | null;
    watched_ranges: number[][];
  } | null>(null);
  const pathRef = useRef<Path | null>(null);

  useEffect(() => {
    pathRef.current = path;
  }, [path]);

  const load = useCallback(() => {
    if (!pathId) {
      setPath(null);
      setError("Learning path not found.");
      return;
    }
    setError("");
    apiRequest<Path>(`/learning-paths/${pathId}`)
      .then((data) => {
        setError("");
        setPath(data);
      })
      .catch((e: Error) => {
        if (isAbortError(e)) return;
        setPath(null);
        setError(e.message || "The learning path could not be loaded.");
      });
  }, [pathId]);

  useEffect(load, [load]);

  const items = useMemo(() => path?.items || [], [path]);
  const resumePoint = useMemo(() => (path ? pickResumePoint(path) : { itemId: "", resourceId: "" }), [path]);
  const selectedItemId = searchParams.get("item") || resumePoint.itemId;
  const selectedResourceId = searchParams.get("resource") || resumePoint.resourceId;

  const selectedItem = useMemo(() => {
    if (!items.length) return null;
    return items.find((item) => item.id === selectedItemId) || items[0];
  }, [items, selectedItemId]);

  const selectedResource = useMemo(() => {
    const resources = selectedItem?.learning_resources || [];
    if (!resources.length) return null;
    return resources.find((row) => row.id === selectedResourceId) || resources.find(isExactVideo) || resources[0];
  }, [selectedItem, selectedResourceId]);

  useEffect(() => {
    if (!path) return;
    const nextItem = selectedItem?.id;
    const nextResource = selectedResource?.id;
    if (!nextItem) return;
    if (nextItem === selectedItemId && nextResource === selectedResourceId) return;
    const next = new URLSearchParams(searchParams);
    next.set("item", nextItem);
    if (nextResource) next.set("resource", nextResource);
    setSearchParams(next, { replace: true });
  }, [path, selectedItem, selectedResource, selectedItemId, selectedResourceId, searchParams, setSearchParams]);

  const flushWatch = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending) return;
    const hasProgress =
      pending.watched_ranges.length > 0 ||
      pending.position_seconds > 0 ||
      Boolean(pending.duration_seconds);
    if (!hasProgress) return;
    if (persistTimer.current != null) {
      window.clearTimeout(persistTimer.current);
      persistTimer.current = null;
    }
    const ranges = pending.watched_ranges;
    if (pendingRef.current?.resourceId === pending.resourceId) {
      pendingRef.current = { ...pendingRef.current, watched_ranges: [] };
    }
    try {
      const result = await apiRequest<ResourceProgressResponse>(
        `/learning-paths/${pathId}/resources/${pending.resourceId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            position_seconds: pending.position_seconds,
            duration_seconds: pending.duration_seconds,
            watched_ranges: ranges,
          }),
        },
      );
      setPath((current) =>
        current
          ? applyResourceToPath(current, pending.resourceId, result, {
              progress_percentage: result.progress_percentage,
              item_status: result.item_status,
              item_watch_percent: result.item_watch_percent,
              watch_summary: result.watch_summary,
            })
          : current,
      );
    } catch (reason) {
      const latest = pendingRef.current;
      if (!latest || latest.resourceId === pending.resourceId) {
        pendingRef.current = {
          resourceId: pending.resourceId,
          position_seconds: latest?.position_seconds ?? pending.position_seconds,
          duration_seconds: latest?.duration_seconds ?? pending.duration_seconds,
          watched_ranges: [...ranges, ...(latest?.watched_ranges || [])],
        };
      }
      setError((reason as Error).message || "Watch progress could not be saved.");
    }
  }, [pathId]);

  const flushWatchRef = useRef(flushWatch);
  useEffect(() => {
    flushWatchRef.current = flushWatch;
  }, [flushWatch]);

  useEffect(() => {
    return () => {
      void flushWatchRef.current();
    };
  }, [pathId, selectedResource?.id]);

  function handleHeartbeat(resourceId: string, payload: LessonHeartbeat) {
    const live = (pathRef.current?.items || [])
      .flatMap((item) => item.learning_resources || [])
      .find((row) => row.id === resourceId);
    if (!live) return;
    const next = applyHeartbeat(
      live.watched_ranges,
      payload.range,
      payload.currentTime,
      payload.duration || live.duration_seconds || null,
    );
    setPath((current) =>
      current
        ? applyResourceToPath(current, resourceId, {
            ...next,
            last_watched_at: new Date().toISOString(),
          })
        : current,
    );
    const previous = pendingRef.current?.resourceId === resourceId ? pendingRef.current : null;
    pendingRef.current = {
      resourceId,
      position_seconds: next.position_seconds,
      duration_seconds: next.duration_seconds,
      watched_ranges: [...(previous?.watched_ranges || []), ...(payload.range ? [payload.range] : [])],
    };
    if (persistTimer.current != null) window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => {
      persistTimer.current = null;
      void flushWatch();
    }, 2500);
    if (payload.ended) void flushWatch();
  }

  async function patchResource(resource: Resource, body: Record<string, unknown>) {
    setUpdatingId(resource.id);
    setError("");
    try {
      const result = await apiRequest<ResourceProgressResponse>(
        `/learning-paths/${pathId}/resources/${resource.id}`,
        { method: "PATCH", body: JSON.stringify(body) },
      );
      setPath((current) =>
        current
          ? applyResourceToPath(current, resource.id, result, {
              progress_percentage: result.progress_percentage,
              item_status: result.item_status,
              item_watch_percent: result.item_watch_percent,
              watch_summary: result.watch_summary,
            })
          : current,
      );
    } catch (reason) {
      setError((reason as Error).message || "Progress could not be updated.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function update(item: LearningItem, status: LearningItem["status"]) {
    setUpdatingId(item.id);
    setError("");
    try {
      const result = await apiRequest<{ progress_percentage?: number; status?: string }>(
        `/learning-paths/${pathId}/items/${item.id}`,
        { method: "PATCH", body: JSON.stringify({ status }) },
      );
      const nextStatus = (result.status as LearningItem["status"]) || status;
      const nextProgress =
        typeof result.progress_percentage === "number" ? result.progress_percentage : undefined;
      setPath((current) => {
        if (!current) return current;
        const nextItems = (current.items || []).map((row) =>
          row.id === item.id
            ? {
                ...row,
                status: nextStatus,
                learning_resources: (row.learning_resources || []).map((resource) =>
                  nextStatus === "completed"
                    ? { ...resource, watch_status: "completed" as const, watch_percent: 100 }
                    : resource,
                ),
              }
            : row,
        );
        const computed =
          nextProgress ??
          (nextItems.length
            ? Math.round(nextItems.reduce((sum, row) => sum + itemWatchPercent(row), 0) / nextItems.length)
            : 0);
        return {
          ...current,
          items: nextItems,
          progress_percentage: computed,
          item_count: nextItems.length,
          status: computed === 100 && nextItems.length ? "completed" : "active",
        };
      });
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUpdatingId(null);
    }
  }

  async function deletePath() {
    setDeleting(true);
    setError("");
    try {
      await apiRequest(`/learning-paths/${pathId}`, { method: "DELETE" });
      navigate("/learning");
    } catch (e) {
      setError((e as Error).message);
      setDeleting(false);
    }
  }

  function selectLesson(item: LearningItem, resource?: Resource) {
    const next = new URLSearchParams(searchParams);
    next.set("item", item.id);
    if (resource?.id) next.set("resource", resource.id);
    setSearchParams(next, { replace: true });
    setPlayerError("");
  }

  const videoId = selectedResource
    ? extractYoutubeVideoId(selectedResource.url, selectedResource.metadata?.video_id)
    : null;
  const completed = items.filter((item) => itemWatchPercent(item) >= 90 || item.status === "completed").length;
  const overall = path?.progress_percentage ?? 0;
  const watchPercent = selectedResource ? resourceWatchPercent(selectedResource) : 0;

  return (
    <div className="lp-page">
      <header className="lp-masthead">
        <div>
          <h1 className="lp-title">{path?.title || "Path details"}</h1>
          <p className="lp-sub">
            {path?.description ||
              "Each step is an ATS skill gap with free lesson resources. Open a lesson, practice, then mark complete."}
          </p>
        </div>
        <div className="lp-masthead-actions">
          <Link className="button button-secondary" href="/learning">
            All paths
          </Link>
          {path ? (
            <Button
              variant="destructive"
              disabled={deleting || Boolean(updatingId)}
              onClick={() => setConfirmDelete(true)}
            >
              <AnimatedIcon icon={Trash2} size={17} aria-hidden />
              {deleting ? "Deleting…" : "Delete path"}
            </Button>
          ) : null}
        </div>
      </header>

      {error && (
        <div className="lp-alert" role="alert">
          <p>{error}</p>
          <div className="lp-chip-row" style={{ marginTop: 12 }}>
            <Link className="button button-secondary" href="/learning">
              Back to learning paths
            </Link>
          </div>
        </div>
      )}

      {confirmDelete ? (
        <div className="lp-confirm">
          <p>Delete this path permanently? Steps, lessons, and watch history will be removed.</p>
          <div className="lp-chip-row">
            <Button variant="destructive" disabled={deleting} onClick={() => void deletePath()}>
              {deleting ? "Deleting…" : "Delete permanently"}
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep path
            </Button>
          </div>
        </div>
      ) : null}

      {!path && !error ? (
        <div className="lp-loading" aria-label="Loading learning path">
          <div className="lp-skeleton" />
          <div className="lp-skeleton" />
          <div className="lp-skeleton" />
        </div>
      ) : null}

      {path ? (
        <div className="lp-studio">
          <aside className="lp-curriculum">
            <div className="lp-progress-card">
              <p className="lp-summary-line">
                Progress · {completed}/{items.length || 0} steps complete
              </p>
              <Progress value={overall} label="Overall path progress" />
              <Badge variant={overall === 100 ? "default" : "secondary"}>{overall}%</Badge>
            </div>
            {path.source_snapshot ? (
              <div className="lp-source-card">
                <p className="lp-summary-line">From ATS analysis</p>
                <strong>{path.source_snapshot.role_title || path.source_snapshot.job_title || "Completed ATS run"}</strong>
                <p>
                  Score {path.source_snapshot.overall_score ?? "—"}
                  {path.source_snapshot.missing_count
                    ? ` · ${path.source_snapshot.missing_count} missing`
                    : ""}
                  {path.source_snapshot.resume_title ? ` · ${path.source_snapshot.resume_title}` : ""}
                </p>
              </div>
            ) : null}
            {items.length === 0 ? (
              <div className="lp-empty">
                <h2>No verified gaps found</h2>
                <p>
                  This ATS analysis did not produce a learning gap. Re-run ATS after confirming resume
                  and JD, or pick another analysis.
                </p>
              </div>
            ) : (
              <ol className="lp-step-list">
                {items.map((item) => {
                  const percent = itemWatchPercent(item);
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={`lp-step${item.id === selectedItem?.id ? " is-active" : ""}`}
                        onClick={() => selectLesson(item)}
                      >
                        <span className="lp-step-top">
                          <span className="lp-chip-row">
                            {percent >= 90 || item.status === "completed" ? (
                              <AnimatedIcon icon={CheckCircle2} size={17} aria-hidden />
                            ) : percent > 0 || item.status === "in_progress" ? (
                              <AnimatedIcon icon={PlayCircle} size={17} aria-hidden />
                            ) : (
                              <AnimatedIcon icon={Circle} size={17} aria-hidden />
                            )}
                            <span className="lp-step-title">{item.title}</span>
                          </span>
                          <span className="lp-step-watch">{percent}%</span>
                        </span>
                        <span className="lp-mini-bar" aria-hidden>
                          <span style={{ width: `${percent}%` }} />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </aside>

          {selectedItem ? (
            <section className="lp-lesson">
              <div className="lp-player-shell">
                {videoId && selectedResource ? (
                  <div className="lp-player-frame">
                    {playerError ? (
                      <div className="lp-player-fallback">
                        <p>{playerError}</p>
                        {selectedResource.url ? (
                          <a className="button button-primary" href={selectedResource.url} target="_blank" rel="noreferrer">
                            Open on YouTube
                          </a>
                        ) : null}
                      </div>
                    ) : (
                      <YoutubeLessonPlayer
                        videoId={videoId}
                        startSeconds={Number(selectedResource.position_seconds || 0)}
                        title={selectedResource.title}
                        onHeartbeat={(payload) => handleHeartbeat(selectedResource.id, payload)}
                        onUnavailable={setPlayerError}
                      />
                    )}
                  </div>
                ) : (
                  <div className="lp-player-frame">
                    <div className="lp-player-fallback">
                      <p>
                        {selectedResource
                          ? "This ATS gap has a lesson search instead of an exact video. Open it, then mark it watched."
                          : "Select a lesson to start tracking."}
                      </p>
                    </div>
                  </div>
                )}
                <div className="lp-watch-bar">
                  <div className="lp-watch-row">
                    <span>Watched time (unique)</span>
                    <strong>
                      {formatClock(selectedResource?.watched_seconds)}
                      {selectedResource?.duration_seconds
                        ? ` / ${formatClock(selectedResource.duration_seconds)}`
                        : ""}
                    </strong>
                  </div>
                  <div
                    className="lp-track"
                    role="progressbar"
                    aria-label="Watched unique time"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={watchPercent}
                  >
                    <span style={{ width: `${watchPercent}%` }} />
                  </div>
                  <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
                    Progress counts only the parts you actually play. Skipping ahead does not fill the bar.
                  </p>
                </div>
              </div>

              <div className="lp-lesson-copy">
                <div className="lp-chip-row">
                  <Badge
                    variant={
                      selectedItem.status === "completed"
                        ? "default"
                        : selectedItem.status === "in_progress"
                          ? "outline"
                          : "secondary"
                    }
                  >
                    {selectedItem.status.replace("_", " ")}
                  </Badge>
                  <span className="muted">{selectedItem.estimated_minutes || 0} minutes</span>
                  {selectedItem.difficulty ? <Badge variant="secondary">{selectedItem.difficulty}</Badge> : null}
                  <Badge variant="secondary">Skill gap</Badge>
                  {selectedItem.metadata?.requirement ? (
                    <Badge variant="secondary">{selectedItem.metadata.requirement}</Badge>
                  ) : null}
                </div>
                <h2>{selectedItem.title}</h2>
                <p>{selectedItem.objective}</p>
              </div>

              {(selectedItem.learning_resources || []).length > 0 && (
                <div className="lp-resources">
                  <strong style={{ fontSize: "var(--text-sm)" }}>
                    Recommended resources (videos + articles)
                  </strong>
                  {selectedItem.learning_resources?.map((resource) =>
                    resource.url ? (
                      <div
                        key={resource.id}
                        className={`lp-resource${resource.id === selectedResource?.id ? " is-active" : ""}`}
                      >
                        {resource.metadata?.thumbnail_url ? (
                          <img
                            src={resource.metadata.thumbnail_url}
                            alt=""
                            width={120}
                            height={68}
                            className="lp-thumb"
                          />
                        ) : null}
                        <div className="lp-resource-copy">
                          <div className="lp-chip-row">
                            <Badge variant={isExactVideo(resource) || isArticleResource(resource) ? "default" : "secondary"}>
                              {resourceBadgeLabel(resource)}
                            </Badge>
                            <span className="muted">{resourceWatchPercent(resource)}% watched</span>
                            {resource.provider ? (
                              <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                                {resource.provider}
                              </span>
                            ) : null}
                          </div>
                          <p style={{ fontWeight: 600 }}>{resource.title}</p>
                          {resource.reason_recommended ? (
                            <p className="muted">{resource.reason_recommended}</p>
                          ) : null}
                        </div>
                        <div className="lp-resource-actions">
                          {isExactVideo(resource) ? (
                            <Button
                              variant="secondary"
                              onClick={() => selectLesson(selectedItem, resource)}
                            >
                              <AnimatedIcon icon={Video} size={17} aria-hidden />
                              {resourceActionLabel(resource)}
                            </Button>
                          ) : (
                            <a
                              href={resource.url}
                              target="_blank"
                              rel="noreferrer"
                              className="button button-primary"
                              onClick={() => void patchResource(resource, { opened: true })}
                            >
                              {isVideoResource(resource) ? (
                                <AnimatedIcon icon={Video} size={17} aria-hidden />
                              ) : (
                                <AnimatedIcon icon={BookOpenCheck} size={17} aria-hidden />
                              )}
                              {resourceActionLabel(resource)}
                              <AnimatedIcon icon={ExternalLink} size={14} aria-hidden />
                            </a>
                          )}
                          {resource.watch_status === "completed" ? (
                            <Button
                              variant="ghost"
                              disabled={updatingId === resource.id}
                              onClick={() => void patchResource(resource, { status: "not_started" })}
                            >
                              Reset watch
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              disabled={updatingId === resource.id}
                              onClick={() => void patchResource(resource, { status: "completed" })}
                            >
                              {isExactVideo(resource) ? "Mark watched" : "Mark as read"}
                            </Button>
                          )}
                        </div>
                      </div>
                    ) : null,
                  )}
                </div>
              )}

              <div className="lp-chip-row">
                <Button
                  variant="secondary"
                  disabled={updatingId === selectedItem.id}
                  onClick={() =>
                    update(selectedItem, selectedItem.status === "completed" ? "pending" : "completed")
                  }
                >
                  {selectedItem.status === "completed" ? "Mark pending" : "Mark complete"}
                </Button>
                {selectedItem.status === "pending" && (
                  <Button
                    variant="ghost"
                    disabled={updatingId === selectedItem.id}
                    onClick={() => update(selectedItem, "in_progress")}
                  >
                    Start
                  </Button>
                )}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function TopicPage({ topicId }: { topicId: string }) {
  const safeId = String(topicId || "").slice(0, 80);
  return (
    <div className="lp-page">
      <header className="lp-masthead">
        <div>
          <h1 className="lp-title">Topic not available</h1>
          <p className="lp-sub">Topics open from their parent learning path. Use the path list to continue studying.</p>
        </div>
      </header>
      <div className="lp-empty">
        <h2>Open the full learning path instead</h2>
        <p>
          {safeId
            ? `No standalone topic page is stored for “${safeId}”. Return to Learning paths and open a path to track steps and lessons.`
            : "Return to Learning paths and open a path to track steps and lessons."}
        </p>
      </div>
      <div className="lp-chip-row">
        <Link className="button button-primary" href="/learning">
          Back to learning paths
        </Link>
      </div>
    </div>
  );
}
