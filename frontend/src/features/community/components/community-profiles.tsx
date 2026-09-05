import { useEffect, useState, type FormEvent } from "react";
import { Search, Users } from "lucide-react";
import { PageHeader, Button, Card } from "@/shared/ui/primitives";
import { Link } from "@/shared/ui/router-link";
import { resolveApiBase } from "@/shared/config";
import { AnimatedIcon } from "@/components/ui/animated-icon";
import { isDemoSession, demoApiRequest } from "@/features/auth/demo-session";
import { isAbortError } from "@/shared/api/client";

type PublicProfileResult = {
  username: string;
  full_name?: string | null;
  headline?: string | null;
  current_role?: string | null;
  career_level?: string | null;
  location?: string | null;
};

function normalizeSearchQuery(raw: string) {
  let value = raw.trim();
  if (value.startsWith("@")) value = value.slice(1).trim();
  return value.replace(/\s+/g, " ");
}

function searchPath(query: string) {
  const params = new URLSearchParams({ q: normalizeSearchQuery(query), limit: "20" });
  return `/public/profiles/search?${params.toString()}`;
}

async function fetchPublicProfiles(query: string, signal: AbortSignal): Promise<PublicProfileResult[]> {
  if (isDemoSession()) {
    const rows = await demoApiRequest<PublicProfileResult[]>(searchPath(query), { signal });
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    return Array.isArray(rows) ? rows : [];
  }
  const response = await fetch(`${resolveApiBase()}${searchPath(query)}`, { signal });
  if (!response.ok) throw new Error("Could not search public profiles.");
  const payload = await response.json();
  return Array.isArray(payload) ? payload : [];
}

export function CommunityProfiles() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicProfileResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const needle = normalizeSearchQuery(query);
  const searching = needle.length >= 2;

  useEffect(() => {
    if (!searching) {
      setResults([]);
      setBusy(false);
      return;
    }
    const controller = new AbortController();
    setBusy(true);
    const timer = window.setTimeout(() => {
      fetchPublicProfiles(needle, controller.signal)
        .then((rows) => {
          if (controller.signal.aborted) return;
          setError("");
          setResults(rows);
        })
        .catch((reason: Error) => {
          if (isAbortError(reason) || controller.signal.aborted) return;
          setResults([]);
          setError(reason.message || "Could not search public profiles.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setBusy(false);
        });
    }, 220);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [needle, searching]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (needle.length >= 2) return;
    setResults([]);
    setError("Enter at least 2 characters.");
  }

  return (
    <main className="feature-page community-page">
      <PageHeader
        title="Find people worth learning from"
        description="Search public profiles by name, username, profession, career level, goal, or location. Use real journeys as inspiration without exposing resumes."
      />
      <Card className="community-search-card">
        <div className="community-search-heading">
          <span className="community-search-mark">
            <AnimatedIcon icon={Users} size={18} aria-hidden />
          </span>
          <div>
            <h2>Explore the community</h2>
            <p className="muted">Try “AI engineer”, “fresher”, or a username. Matches appear as you type. Nothing is listed until you search.</p>
          </div>
        </div>
        <form className="community-search-form" role="search" onSubmit={onSubmit}>
          <input
            aria-label="Search community profiles"
            value={query}
            onChange={(event) => {
              setError("");
              setQuery(event.target.value);
            }}
            placeholder="Name, @username, AI engineer, fresher…"
          />
          <Button type="submit" disabled={busy}>
            <AnimatedIcon icon={Search} size={16} aria-hidden />
            {busy ? "Searching…" : "Search profiles"}
          </Button>
        </form>
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
        {results.length ? (
          <div className="community-results" aria-label="Community profile results" aria-busy={busy}>
            {results.map((person) => (
              <Link
                className="community-result"
                key={person.username}
                href={`/${encodeURIComponent(person.username)}`}
              >
                <span className="community-avatar">
                  {String(person.full_name || person.username).slice(0, 1).toUpperCase()}
                </span>
                <span className="community-result-copy">
                  <strong>{person.full_name || `@${person.username}`}</strong>
                  <small>
                    @{person.username}
                    {person.current_role ? ` · ${person.current_role}` : person.headline ? ` · ${person.headline}` : ""}
                  </small>
                  {person.location || person.career_level ? (
                    <small>{[person.career_level, person.location].filter(Boolean).join(" · ")}</small>
                  ) : null}
                </span>
              </Link>
            ))}
          </div>
        ) : busy ? (
          <p className="community-empty">Searching…</p>
        ) : error ? null : (
          <p className="community-empty">
            {searching
              ? "No public profiles matched that search."
              : "Search by a real username or career term to discover public profiles."}
          </p>
        )}
      </Card>
    </main>
  );
}
