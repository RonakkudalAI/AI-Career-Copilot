"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  BookOpenCheck,
  CheckCircle2,
  Circle,
  ExternalLink,
  LoaderCircle,
  PlayCircle,
  Trash2,
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
  items?: LearningItem[];
  algorithm_version?: string;
  grounding?: { policy?: string; source?: string };
};

function isYoutubeResource(resource: Resource) {
  const type = (resource.resource_type || "").toLowerCase();
  const url = resource.url || "";
  return type.includes("youtube") || /youtube\.com|youtu\.be/i.test(url);
}

function isExactYoutubeVideo(resource: Resource) {
  const type = (resource.resource_type || "").toLowerCase();
  const url = resource.url || "";
  return type === "youtube_video" || /youtube\.com\/watch\?v=|youtu\.be\//i.test(url);
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
        if (active) setPaths(data);
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
        `Delete “${label}” permanently? Steps and recommended videos for this path will be removed from your account.`,
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
    <>
      <PageHeader
        eyebrow="Learning"
        title="Learning paths"
        description="Generate a study plan only from gaps in your completed ATS analysis. Each step recommends exact YouTube videos from the YouTube API — not invented links."
        action={
          <Button onClick={generate} disabled={busy || Boolean(deletingId)}>
            {busy ? (
              <LoaderCircle className="spin" size={17} aria-hidden />
            ) : (
              <Video size={17} aria-hidden />
            )}
            {busy ? "Finding videos…" : "Generate YouTube path from ATS"}
          </Button>
        }
      />
      {error && (
        <Card>
          <p role="alert" className="field-error">
            {error}
          </p>
        </Card>
      )}
      {paths.length === 0 && !error ? (
        <EmptyState
          title="No learning path yet"
          description="Complete a resume-vs-JD ATS analysis first. The learning crew only uses those evidence gaps — it does not invent skills."
        />
      ) : (
        <div className="grid-2">
          {paths.map((path) => (
            <Card key={path.id}>
              <div className="row">
                <div>
                  <span className="eyebrow">{path.status}</span>
                  <h2>{path.title}</h2>
                </div>
                <Badge tone={path.progress_percentage === 100 ? "success" : "info"}>
                  {path.progress_percentage}%
                </Badge>
              </div>
              <p>
                {path.description ||
                  "Built from stored ATS evidence with free YouTube learning steps."}
              </p>
              <Progress value={path.progress_percentage} label="Path progress" />
              <div className="cluster" style={{ marginTop: 12 }}>
                <Badge tone="ai">YouTube steps</Badge>
                {(path.items || []).length > 0 && (
                  <span className="muted">{path.items?.length} items</span>
                )}
              </div>
              <div className="cluster" style={{ marginTop: 12 }}>
                <Link className="button button-secondary" href={`/learning/${path.id}`}>
                  Open path & track progress
                </Link>
                <Button
                  variant="danger"
                  disabled={deletingId === path.id || busy}
                  onClick={() => void deletePath(path)}
                  aria-label={`Delete learning path ${path.title}`}
                >
                  <Trash2 size={17} aria-hidden />
                  {deletingId === path.id ? "Deleting…" : "Delete"}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

export function LearningPath({ pathId }: { pathId: string }) {
  const router = useRouter();
  const [path, setPath] = useState<Path | null>(null);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    apiRequest<Path>(`/learning-paths/${pathId}`)
      .then(setPath)
      .catch((e: Error) => setError(e.message));
  }, [pathId]);

  useEffect(load, [load]);

  async function deletePath() {
    const label = path?.title || "this learning path";
    if (
      !window.confirm(
        `Delete “${label}” permanently? Steps and recommended videos for this path will be removed from your account.`,
      )
    ) {
      return;
    }
    setDeleting(true);
    setError("");
    try {
      await apiRequest(`/learning-paths/${pathId}`, { method: "DELETE" });
      router.push("/learning");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setDeleting(false);
    }
  }

  async function update(item: LearningItem, status: LearningItem["status"]) {
    setUpdatingId(item.id);
    setError("");
    try {
      const result = await apiRequest<{ progress_percentage?: number }>(
        `/learning-paths/${pathId}/items/${item.id}`,
        { method: "PATCH", body: JSON.stringify({ status }) }
      );
      // Refresh path so overall progress stays accurate
      load();
      if (typeof result.progress_percentage === "number") {
        setPath((current) =>
          current ? { ...current, progress_percentage: result.progress_percentage as number } : current
        );
      }
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
          "Each step is an ATS skill gap with exact YouTube video recommendations. Open a video, learn, then mark complete."
        }
        action={
          path ? (
            <Button variant="danger" disabled={deleting || Boolean(updatingId)} onClick={() => void deletePath()}>
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
            <Badge tone={path.progress_percentage === 100 ? "success" : "info"}>
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
                      tone={
                        item.status === "completed"
                          ? "success"
                          : item.status === "in_progress"
                            ? "warning"
                            : "info"
                      }
                    >
                      {item.status.replace("_", " ")}
                    </Badge>
                  </div>
                  <p>{item.objective}</p>
                  <div className="cluster">
                    <span className="muted">{item.estimated_minutes || 0} minutes</span>
                    {item.difficulty && <Badge tone="info">{item.difficulty}</Badge>}
                    <Badge tone="ai">What to learn</Badge>
                  </div>

                  {(item.learning_resources || []).length > 0 && (
                    <div className="stack" style={{ gap: 12, marginTop: 8 }}>
                      <strong style={{ fontSize: "var(--text-sm)" }}>Recommended YouTube videos</strong>
                      {item.learning_resources?.map((resource) =>
                        resource.url ? (
                          <div
                            key={resource.id}
                            className="panel-blue"
                            style={{
                              padding: 12,
                              display: "grid",
                              gridTemplateColumns: resource.metadata?.thumbnail_url ? "120px 1fr" : "1fr",
                              gap: 12,
                              alignItems: "center",
                            }}
                          >
                            {resource.metadata?.thumbnail_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={resource.metadata.thumbnail_url}
                                alt=""
                                width={120}
                                height={68}
                                style={{ borderRadius: 8, objectFit: "cover", width: "100%", height: "auto" }}
                              />
                            ) : null}
                            <div className="stack" style={{ gap: 6 }}>
                              <div className="cluster">
                                <Badge tone={isExactYoutubeVideo(resource) ? "success" : "info"}>
                                  {isExactYoutubeVideo(resource) ? "Exact video" : "Search results"}
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
                                {isYoutubeResource(resource) ? (
                                  <Video size={17} aria-hidden />
                                ) : (
                                  <BookOpenCheck size={17} aria-hidden />
                                )}
                                {isExactYoutubeVideo(resource) ? "Watch on YouTube" : "Open YouTube search"}
                                <ExternalLink size={14} aria-hidden />
                              </a>
                            </div>
                          </div>
                        ) : null
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
                        variant="quiet"
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
  return (
    <>
      <PageHeader
        eyebrow="Learning topic"
        title="Topic details"
        description="Open topics from their learning path."
      />
      <EmptyState
        title="Topic not found"
        description={`The requested topic (${topicId}) is not a stored learning item.`}
      />
    </>
  );
}
