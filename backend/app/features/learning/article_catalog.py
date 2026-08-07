"""
Reading resources (blogs / articles / docs) for learning paths.

Truthfulness rules (mirrors YouTube policy):
- Never invent specific article URLs or blog post IDs that may 404.
- Only emit allowlisted search/browse URLs on reputable educational hosts,
  or Google/DuckDuckGo queries restricted to those hosts.
- Every resource is tied to an ATS skill gap (requirement text).
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import quote_plus, urlparse

from app.features.learning.youtube_catalog import ALGORITHM_VERSION, normal_skill

# Hosts we may link to for reading material (search pages or official docs search).
_ARTICLE_HOSTS = {
    "www.google.com",
    "google.com",
    "duckduckgo.com",
    "www.duckduckgo.com",
    "developer.mozilla.org",
    "www.freecodecamp.org",
    "freecodecamp.org",
    "dev.to",
    "www.dev.to",
    "css-tricks.com",
    "www.css-tricks.com",
    "realpython.com",
    "www.realpython.com",
    "docs.python.org",
    "docs.docker.com",
    "kubernetes.io",
    "react.dev",
    "nodejs.org",
    "learn.microsoft.com",
    "docs.aws.amazon.com",
    "cloud.google.com",
    "www.w3schools.com",
    "w3schools.com",
    "digitalocean.com",
    "www.digitalocean.com",
}

# Educational sites used inside web-search queries (never invent article paths).
_EDU_SITE_FILTER = (
    "site:freecodecamp.org OR site:dev.to OR site:developer.mozilla.org OR "
    "site:css-tricks.com OR site:realpython.com OR site:digitalocean.com/community OR "
    "site:medium.com OR site:docs.python.org OR site:learn.microsoft.com"
)

# Optional official-docs search templates when the gap clearly matches.
_OFFICIAL_DOC_SEARCH: list[tuple[re.Pattern[str], str, str]] = [
    (re.compile(r"\b(docker|dockerfile|container)\b", re.I), "Docker Docs", "https://docs.docker.com/search/?q={q}"),
    (re.compile(r"\b(kubernetes|k8s|kubectl)\b", re.I), "Kubernetes Docs", "https://kubernetes.io/search/?q={q}"),
    (re.compile(r"\b(python|django|flask|fastapi)\b", re.I), "Python Docs", "https://docs.python.org/3/search.html?q={q}"),
    (re.compile(r"\b(react|jsx|hooks)\b", re.I), "React Docs", "https://react.dev/?q={q}"),
    (re.compile(r"\b(node\.?js|express)\b", re.I), "Node.js Docs", "https://nodejs.org/en/search?q={q}"),
    (re.compile(r"\b(aws|amazon web services|s3|ec2|lambda)\b", re.I), "AWS Docs", "https://docs.aws.amazon.com/search/doc-search.html?searchPath=documentation&searchQuery={q}"),
    (re.compile(r"\b(azure)\b", re.I), "Microsoft Learn", "https://learn.microsoft.com/en-us/search/?terms={q}"),
    (re.compile(r"\b(gcp|google cloud)\b", re.I), "Google Cloud Docs", "https://cloud.google.com/s/results?q={q}"),
]


def is_allowed_article_url(url: str) -> bool:
    text = (url or "").strip()
    if not text.startswith("https://"):
        return False
    try:
        parsed = urlparse(text)
    except Exception:
        return False
    host = (parsed.netloc or "").lower()
    if host not in _ARTICLE_HOSTS:
        return False
    # Reject bare hosts without a path/query that would be useless.
    path = parsed.path or ""
    query = parsed.query or ""
    if host in {"www.google.com", "google.com", "duckduckgo.com", "www.duckduckgo.com"}:
        return bool(query) and ("q=" in query or "query=" in query)
    return bool(path) or bool(query)


def _clean_query(query: str, gap: str) -> str:
    cleaned = re.sub(r"\s+", " ", (query or "").strip())
    if not cleaned:
        cleaned = f"{gap} tutorial guide"
    # Keep the gap wording in the query so search stays grounded.
    if normal_skill(gap) and normal_skill(gap) not in normal_skill(cleaned):
        cleaned = f"{gap} {cleaned}"
    # Encourage free reading material, not paid courses.
    lower = cleaned.lower()
    if "article" not in lower and "guide" not in lower and "docs" not in lower and "blog" not in lower:
        cleaned = f"{cleaned} guide OR article OR tutorial"
    return cleaned[:200]


def _looks_web_frontend(gap: str) -> bool:
    return bool(
        re.search(
            r"\b(html|css|javascript|typescript|react|vue|angular|dom|frontend|front-end|"
            r"web api|accessibility|a11y|http|rest|json)\b",
            gap,
            re.I,
        )
    )


def build_edu_web_search_url(query: str) -> str:
    q = f"{query} ({_EDU_SITE_FILTER})"
    return f"https://www.google.com/search?q={quote_plus(q)}"


def build_duckduckgo_edu_search_url(query: str) -> str:
    q = f"{query} ({_EDU_SITE_FILTER})"
    return f"https://duckduckgo.com/?q={quote_plus(q)}"


def build_mdn_search_url(query: str) -> str:
    return f"https://developer.mozilla.org/en-US/search?q={quote_plus(query)}"


def build_freecodecamp_news_search_url(query: str) -> str:
    # freeCodeCamp news has no stable public search API; use site-restricted Google.
    return f"https://www.google.com/search?q={quote_plus(query + ' site:freecodecamp.org/news')}"


def _official_docs_resource(gap: str, query: str) -> dict[str, Any] | None:
    for pattern, provider, template in _OFFICIAL_DOC_SEARCH:
        if pattern.search(gap) or pattern.search(query):
            url = template.format(q=quote_plus(query))
            if not is_allowed_article_url(url):
                continue
            return {
                "title": f"{provider}: {gap}",
                "resource_type": "docs_search",
                "provider": provider,
                "url": url,
                "reason_recommended": (
                    f"Official documentation search for ATS gap '{gap}'. "
                    "Open a free page that matches the requirement — no article URLs are invented."
                ),
                "metadata": {
                    "source": "official_docs_search",
                    "requirement": gap,
                    "search_query": query,
                    "algorithm_version": ALGORITHM_VERSION,
                    "grounding": "ats_evidence_only",
                    "url_policy": "allowlisted_search_only_no_invented_articles",
                },
            }
    return None


def build_article_search_resource(
    *,
    gap: str,
    search_query: str | None = None,
    preferred_title: str | None = None,
    engine: str = "google",
) -> dict[str, Any]:
    query = _clean_query(search_query or "", gap)
    if engine == "duckduckgo":
        url = build_duckduckgo_edu_search_url(query)
        provider = "DuckDuckGo · educational sites"
    else:
        url = build_edu_web_search_url(query)
        provider = "Google · educational sites"
    if not is_allowed_article_url(url):
        raise ValueError("invalid article search url")
    return {
        "title": preferred_title or f"Blogs & articles: {gap}",
        "resource_type": "article_search",
        "provider": provider,
        "url": url,
        "reason_recommended": (
            f"Free blogs and articles for ATS gap '{gap}' "
            "(freeCodeCamp, DEV, MDN, Real Python, and similar). "
            "Pick a reputable free guide — specific post URLs are never invented."
        ),
        "metadata": {
            "source": "educational_web_search",
            "requirement": gap,
            "search_query": query,
            "algorithm_version": ALGORITHM_VERSION,
            "grounding": "ats_evidence_only",
            "url_policy": "allowlisted_search_only_no_invented_articles",
            "search_engine": engine,
        },
    }


def build_reading_resources(
    *,
    gap: str,
    article_search_query: str | None = None,
    preferred_title: str | None = None,
) -> list[dict[str, Any]]:
    """
    Build 1–2 reading resources for a skill gap.

    Always includes a multi-site educational search (blogs/articles).
    Adds MDN / freeCodeCamp / official docs search when relevant.
    """
    query = _clean_query(article_search_query or f"{gap} tutorial guide", gap)
    resources: list[dict[str, Any]] = []

    try:
        resources.append(
            build_article_search_resource(
                gap=gap,
                search_query=query,
                preferred_title=preferred_title,
                engine="google",
            )
        )
    except ValueError:
        pass

    # Secondary reading path: docs, MDN, or freeCodeCamp news search.
    official = _official_docs_resource(gap, query)
    if official:
        resources.append(official)
    elif _looks_web_frontend(gap):
        mdn_url = build_mdn_search_url(query)
        if is_allowed_article_url(mdn_url):
            resources.append(
                {
                    "title": f"MDN Web Docs: {gap}",
                    "resource_type": "docs_search",
                    "provider": "MDN Web Docs",
                    "url": mdn_url,
                    "reason_recommended": (
                        f"MDN documentation search for web-related ATS gap '{gap}'. "
                        "Open free reference pages that match the requirement."
                    ),
                    "metadata": {
                        "source": "mdn_search",
                        "requirement": gap,
                        "search_query": query,
                        "algorithm_version": ALGORITHM_VERSION,
                        "grounding": "ats_evidence_only",
                        "url_policy": "allowlisted_search_only_no_invented_articles",
                    },
                }
            )
    else:
        fcc_url = build_freecodecamp_news_search_url(query)
        if is_allowed_article_url(fcc_url):
            resources.append(
                {
                    "title": f"freeCodeCamp articles: {gap}",
                    "resource_type": "article_search",
                    "provider": "freeCodeCamp",
                    "url": fcc_url,
                    "reason_recommended": (
                        f"freeCodeCamp news/articles search for ATS gap '{gap}'. "
                        "Choose a free tutorial article — no post URLs are invented."
                    ),
                    "metadata": {
                        "source": "freecodecamp_news_search",
                        "requirement": gap,
                        "search_query": query,
                        "algorithm_version": ALGORITHM_VERSION,
                        "grounding": "ats_evidence_only",
                        "url_policy": "allowlisted_search_only_no_invented_articles",
                    },
                }
            )

    # Deduplicate by URL.
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for item in resources:
        url = str(item.get("url") or "")
        if not url or url in seen:
            continue
        if not is_allowed_article_url(url):
            continue
        seen.add(url)
        unique.append(item)
    return unique[:2]
