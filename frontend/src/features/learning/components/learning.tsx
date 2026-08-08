import { Link } from "@/shared/ui/router-link";
import { useNavigate } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
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
import { apiRequest } from "@/shared/api/client";
import { Badge, Button, Card, EmptyState, PageHeader, Progress } from "@/shared/ui/primitives";

type Resource = {
  id: string;
  title: string;
  resource_type?: string | null;
  provider?: string | null;
  url?: string | null;
  reason_recommended?: string | null;
  metadata?: {
    video_id?: string;
    channel_title?: string;
    thumbnail_url?: string;
    search_query?: string;
    video_id_policy?: string;
    source?: string;
  } | null;
};

type LearningItem = {
  id: string;
  title: string;
  objective?: string | null;
  status: "pending" | "in_progress" | "completed";
  estimated_minutes?: number | null;
  difficulty?: string | null;
  learning_resources?: Resource[];
};

type Path = {
  id: string;
  title: string;
  description?: string | null;
  progress_percentage: number;
  status: string;
  item_count?: number;
  items?: LearningItem[];
  algorithm_version?: string;
  grounding?: { policy?: string; source?: string };
};

function pathStepCount(path: Path): number {
  if (typeof path.item_count === "number" && Number.isFinite(path.item_count)) {
    return path.item_count;
  }
  return (path.items || []).length;
}

function isVideoResource(resource: Resource) {
  const type = (resource.resource_type || "").toLowerCase();
  const url = resource.url || "";
  return (
    type.includes("youtube") ||
    type.includes("video") ||
    /youtube\.com|youtu\.be|vimeo\.com/i.test(url)
  );
}

function isExactVideo(resource: Resource) {
  const type = (resource.resource_type || "").toLowerCase();
  const url = resource.url || "";
  return type === "youtube_video" || type === "video" || /youtube\.com\/watch\?v=|youtu\.be\//i.test(url);
}

function isArticleResource(resource: Resource) {
  const type = (resource.resource_type || "").toLowerCase();
  const url = resource.url || "";
  if (isVideoResource(resource)) return false;
  return (
    type.includes("article") ||
    type.includes("blog") ||
    type.includes("docs") ||
    type.includes("reading") ||
    /developer\.mozilla\.org|freecodecamp\.org|dev\.to|css-tricks\.com|realpython\.com|docs\.|learn\.microsoft|medium\.com|digitalocean\.com/i.test(
      url,
    ) ||
    // Educational Google/DuckDuckGo article searches
    (/google\.com\/search|duckduckgo\.com/i.test(url) &&
      /site:|article|guide|tutorial|docs/i.test(url))
  );
}

function resourceBadgeLabel(resource: Resource) {
  if (isExactVideo(resource)) return "Video lesson";
  if (isVideoResource(resource)) return "Video search";
  if ((resource.resource_type || "").toLowerCase() === "docs_search") return "Docs";
  if (isArticleResource(resource)) return "Article / blog";
  return "Resource";
}

function resourceActionLabel(resource: Resource) {
  if (isExactVideo(resource)) return "Watch lesson";
  if (isVideoResource(resource)) return "Browse video lessons";
  if ((resource.resource_type || "").toLowerCase() === "docs_search") return "Browse documentation";
  if (isArticleResource(resource)) return "Browse articles";
  return "Open resource";
}

export function LearningHome() {
  const [paths, setPaths] = useState<Path[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiRequest<Path[]>("/learning-paths")
      .then((data) => {
        if (active) {
          setError("");
          setPaths(Array.isArray(data) ? data : []);
        }
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);

  async function generate() {
    setBusy(true);
    setError("");
    try {
      const created = await apiRequest<Path>("/learning-paths/generate", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setPaths((current) => [created, ...current]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function deletePath(path: Path) {
    const label = path.title || "this learning path";
    if (
      !window.confirm(
        `Delete “${label}” permanently? Steps and lesson resources for this path will be removed from your account.`,
      )
    ) {
      return;
    }
    setDeletingId(path.id);
    setError("");
    try {
      await apiRequest(`/learning-paths/${path.id}`, { method: "DELETE" });
      setPaths((current) => current.filter((row) => row.id !== path.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="feature-page">
      <PageHeader
        eyebrow="Learning"
        title="Learning paths"
        description="Build a study plan from skill gaps in your completed ATS analysis. Each step maps a real evidence gap to free video lessons and blogs/articles — no invented skills."
        action={
          <Button onClick={generate} disabled={busy || Boolean(deletingId)}>
            {busy ? (
              <LoaderCircle className="spin" size={17} aria-hidden />
            ) : (
              <Sparkles size={17} aria-hidden />
            )}
            {busy ? "Building path…" : "Generate from ATS gaps"}
          </Button>
        }
      />
      {error && (
        <div className="feature-alert" role="alert">
          <p className="field-error">{error}</p>
        </div>
      )}
      {paths.length === 0 && !error ? (
        <EmptyState
          title="No learning path yet"
          description="Complete a resume-vs-JD ATS analysis first. Paths are built only from those evidence gaps — skills are never invented."
          href="/resume-analysis?tab=upload"
          action="Open Resume Analysis"
        />
      ) : (
        <div className="grid-2">
          {paths.map((path) => {
            const steps = pathStepCount(path);
            return (
              <Card key={path.id} className="path-card">
                <div className="entity-card-head">
                  <div>
                    <span
                      className="status-chip"
                      data-tone={path.progress_percentage === 100 ? "success" : "info"}
                    >
                      {(path.status || "active").replaceAll("_", " ")}
                    </span>
                    <h2 style={{ marginTop: 10 }}>{path.title}</h2>
                  </div>
                  <Badge variant={path.progress_percentage === 100 ? "default" : "secondary"}>
                    {path.progress_percentage}%
                  </Badge>
                </div>
                <p>
                  {path.description ||
                    "Built from stored ATS evidence with free lesson resources for each gap."}
                </p>
                <Progress value={path.progress_percentage} label="Path progress" />
                <div className="cluster">
                  <Badge variant="secondary">Skill gaps</Badge>
                  {steps > 0 && <span className="muted">{steps} steps</span>}
                </div>
                <div className="entity-card-actions">
                  <Link className="button button-secondary" href={`/learning/${path.id}`}>
                    Open path & track progress
                  </Link>
                  <Button
                    variant="destructive"
                    disabled={deletingId === path.id || busy}
                    onClick={() => void deletePath(path)}
                    aria-label={`Delete learning path ${path.title}`}
                  >
                    <Trash2 size={17} aria-hidden />
                    {deletingId === path.id ? "Deleting…" : "Delete"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function LearningPath({ pathId }: { pathId: string }) {
  const navigate = useNavigate();
  const [path, setPath] = useState<Path | null>(null);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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
        setPath(null);
        setError(e.message || "The learning path could not be loaded.");
      });
  }, [pathId]);

  useEffect(load, [load]);

  async function deletePath() {
    const label = path?.title || "this learning path";
    if (
      !window.confirm(
        `Delete “${label}” permanently? Steps and lesson resources for this path will be removed from your account.`,
      )
    ) {
      return;
    }
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
      // Optimistic local update so the step badge flips immediately.
      setPath((current) => {
        if (!current) return current;
        const items = (current.items || []).map((row) =>
          row.id === item.id ? { ...row, status: nextStatus } : row,
        );
        const done = items.filter((row) => row.status === "completed").length;
        const computed =
          nextProgress ?? (items.length ? Math.round((done / items.length) * 100) : 0);
        return {
          ...current,
          items,
          progress_percentage: computed,
          item_count: items.length,
          status: computed === 100 && items.length ? "completed" : "active",
        };
      });
      // Refresh from server so path-level fields stay authoritative.
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUpdatingId(null);
    }
  }

  const completed = (path?.items || []).filter((i) => i.status === "completed").length;
  const total = (path?.items || []).length;

  return (
    <>
      <PageHeader
        eyebrow="Learning path"
        title={path?.title || "Path details"}
        description={
          path?.description ||
          "Each step is an ATS skill gap with free lesson resources. Open a lesson, practice, then mark complete."
        }
        action={
          path ? (
            <Button
              variant="destructive"
              disabled={deleting || Boolean(updatingId)}
              onClick={() => void deletePath()}
            >
              <Trash2 size={17} aria-hidden />
              {deleting ? "Deleting…" : "Delete path"}
            </Button>
          ) : undefined
        }
      />
      {error && (
        <Card>
          <p role="alert" className="field-error">
            {error}
          </p>
          <div className="cluster" style={{ marginTop: 12 }}>
            <Link className="button button-secondary" href="/learning">
              Back to learning paths
            </Link>
          </div>
        </Card>
      )}
      {!path && !error ? (
        <Card className="skeleton" aria-label="Loading learning path">
          <span />
          <span />
          <span />
        </Card>
      ) : null}
      {path && (
        <Card className="stack">
          <div className="row" style={{ alignItems: "flex-end" }}>
            <div>
              <p className="muted" style={{ margin: 0 }}>
                Progress · {completed}/{total || 0} steps complete
              </p>
              <Progress value={path.progress_percentage} label="Overall path progress" />
            </div>
            <Badge variant={path.progress_percentage === 100 ? "default" : "secondary"}>
              {path.progress_percentage}%
            </Badge>
          </div>

          {(path.items || []).length === 0 ? (
            <EmptyState
              title="No verified gaps found"
              description="This ATS analysis did not produce a learning gap. Re-run ATS after confirming resume and JD, or pick another analysis."
            />
          ) : (
            <div className="stack">
              {path.items?.map((item) => (
                <article className="suggestion" key={item.id}>
                  <div className="row">
                    <div className="cluster">
                      <span aria-hidden>
                        {item.status === "completed" ? (
                          <CheckCircle2 size={19} />
                        ) : item.status === "in_progress" ? (
                          <PlayCircle size={19} />
                        ) : (
                          <Circle size={19} />
                        )}
                      </span>
                      <strong>{item.title}</strong>
                    </div>
                    <Badge
                      variant={
                        item.status === "completed"
                          ? "default"
                          : item.status === "in_progress"
                            ? "outline"
                            : "secondary"
                      }
                    >
                      {item.status.replace("_", " ")}
                    </Badge>
                  </div>
                  <p>{item.objective}</p>
                  <div className="cluster">
                    <span className="muted">{item.estimated_minutes || 0} minutes</span>
                    {item.difficulty && <Badge variant="secondary">{item.difficulty}</Badge>}
                    <Badge variant="secondary">Skill gap</Badge>
                  </div>

                  {(item.learning_resources || []).length > 0 && (
                    <div className="stack" style={{ gap: 12, marginTop: 8 }}>
                      <strong style={{ fontSize: "var(--text-sm)" }}>
                        Recommended resources (videos + articles)
                      </strong>
                      {item.learning_resources?.map((resource) =>
                        resource.url ? (
                          <div
                            key={resource.id}
                            className="panel-blue"
                            style={{
                              padding: 12,
                              display: "grid",
                              gridTemplateColumns: resource.metadata?.thumbnail_url
                                ? "120px 1fr"
                                : "1fr",
                              gap: 12,
                              alignItems: "center",
                            }}
                          >
                            {resource.metadata?.thumbnail_url ? (
                              <img
                                src={resource.metadata.thumbnail_url}
                                alt=""
                                width={120}
                                height={68}
                                style={{
                                  borderRadius: 8,
                                  objectFit: "cover",
                                  width: "100%",
                                  height: "auto",
                                }}
                              />
                            ) : null}
                            <div className="stack" style={{ gap: 6 }}>
                              <div className="cluster">
                                <Badge
                                  variant={
                                    isExactVideo(resource) || isArticleResource(resource)
                                      ? "default"
                                      : "secondary"
                                  }
                                >
                                  {resourceBadgeLabel(resource)}
                                </Badge>
                                {resource.provider ? (
                                  <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                                    {resource.provider}
                                  </span>
                                ) : null}
                              </div>
                              <p style={{ margin: 0, fontWeight: 600 }}>{resource.title}</p>
                              {resource.reason_recommended ? (
                                <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
                                  {resource.reason_recommended}
                                </p>
                              ) : null}
                              <a
                                href={resource.url}
                                target="_blank"
                                rel="noreferrer"
                                className="button button-primary"
                                style={{ justifyContent: "flex-start", width: "fit-content" }}
                              >
                                {isVideoResource(resource) ? (
                                  <Video size={17} aria-hidden />
                                ) : (
                                  <BookOpenCheck size={17} aria-hidden />
                                )}
                                {resourceActionLabel(resource)}
                                <ExternalLink size={14} aria-hidden />
                              </a>
                            </div>
                          </div>
                        ) : null,
                      )}
                    </div>
                  )}

                  <div className="cluster">
                    <Button
                      variant="secondary"
                      disabled={updatingId === item.id}
                      onClick={() =>
                        update(item, item.status === "completed" ? "pending" : "completed")
                      }
                    >
                      {item.status === "completed" ? "Mark pending" : "Mark complete"}
                    </Button>
                    {item.status === "pending" && (
                      <Button
                        variant="ghost"
                        disabled={updatingId === item.id}
                        onClick={() => update(item, "in_progress")}
                      >
                        Start
                      </Button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </Card>
      )}
    </>
  );
}

export function TopicPage({ topicId }: { topicId: string }) {
  const safeId = String(topicId || "").slice(0, 80);
  return (
    <>
      <PageHeader
        eyebrow="Learning"
        title="Topic not available"
        description="Topics open from their parent learning path. Use the path list to continue studying."
      />
      <EmptyState
        title="Open the full learning path instead"
        description={
          safeId
            ? `No standalone topic page is stored for “${safeId}”. Return to Learning paths and open a path to track steps and lessons.`
            : "Return to Learning paths and open a path to track steps and lessons."
        }
      />
      <div className="cluster" style={{ marginTop: 16 }}>
        <Link className="button button-primary" href="/learning">
          Back to learning paths
        </Link>
      </div>
    </>
  );
}
