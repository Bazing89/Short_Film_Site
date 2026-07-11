#!/usr/bin/env python3
"""
Queue video URLs → download one-by-one with yt-dlp → upload to Bunny Stream.

1. Add links to queue.txt (one URL per line)
2. Run:  python3 download_to_bunny.py
3. Finished URLs move to done.txt; failures go to failed.txt

Optional:
  python3 download_to_bunny.py "https://example.com/watch?v=..."
  python3 download_to_bunny.py --interactive   # type URLs, blank line to start
  python3 download_to_bunny.py --upload-existing  # upload files already in downloads/
"""

from __future__ import annotations

import argparse
import html as html_lib
import json
import os
import re
import subprocess
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

LogFn = Callable[[str], None]

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
DEV_VARS = ROOT / ".dev.vars"
QUEUE_FILE = HERE / "queue.txt"
QUEUE_META_FILE = HERE / "queue_meta.json"
DONE_FILE = HERE / "done.txt"
FAILED_FILE = HERE / "failed.txt"
DOWNLOAD_DIR = HERE / "downloads"
OUTBOUND_PUBLIC = ROOT / "public" / "outbound-films.json"
OUTBOUND_OUT = ROOT / "out" / "outbound-films.json"
OUTBOUND_KV_ID = os.environ.get(
    "OUTBOUND_KV_ID", "0c0ad6ce804246e9b95d954674860e36"
)
OUTBOUND_KV_KEY = "outbound-films"
LIBRARY_ID = os.environ.get("BUNNY_LIBRARY_ID", "700551")
COLLECTION_ID = os.environ.get(
    "BUNNY_COLLECTION_ID", "98f0b8d8-336d-4ab9-9c2c-513c29815305"
)
# How many videos to download/upload at once (override with DOWNLOAD_WORKERS=1..6)
DOWNLOAD_WORKERS = max(1, min(6, int(os.environ.get("DOWNLOAD_WORKERS", "3"))))
# Concurrent HLS/DASH fragments per video
YTDLP_FRAGMENTS = max(1, min(16, int(os.environ.get("YTDLP_FRAGMENTS", "8"))))

SEARCH_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

SEARCH_SOURCES = {
    "xvideos": {
        "label": "XVideos",
        "url": lambda q: f"https://www.xvideos.com/?k={urllib.parse.quote_plus(q)}",
    },
    "xnxx": {
        "label": "XNXX",
        "url": lambda q: f"https://www.xnxx.com/search/{urllib.parse.quote_plus(q)}",
    },
    "pornhub": {
        "label": "Pornhub",
        "url": lambda q: (
            "https://www.pornhub.com/video/search?search="
            + urllib.parse.quote_plus(q)
        ),
    },
    "fpo": {
        "label": "MyFPO",
        "url": lambda q: f"https://www.fpo.xxx/search/{urllib.parse.quote_plus(q)}/",
    },
}

# Full-catalog import (newest listings), not actor search
CATALOG_SOURCES = {
    "fpo": {"label": "MyFPO", "default_pages": 100},
    "playvids": {"label": "Playvids", "default_pages": 100},
}


def clean_video_title(raw: str) -> str:
    """Use filename as title: strip extension and trailing arbitrary numbers/IDs."""
    title = (raw or "").strip()
    title = title.replace("\\", "/").split("/")[-1]
    title = re.sub(r"\.(mp4|mov|mkv|webm|m4v|avi)$", "", title, flags=re.I)
    title = re.sub(r"\s*\[[^\]]*\]\s*$", "", title)
    title = re.sub(r"\s*\(\d+\)\s*$", "", title)
    title = re.sub(r"[\s._-]+\d{3,}\s*$", "", title)
    title = re.sub(r"\s+\d+\s*$", "", title)
    title = re.sub(r"[\s._-]+$", "", title)
    title = re.sub(r"\s{2,}", " ", title).strip()
    return title or (raw or "").strip() or "Untitled"


def title_with_actor(base_title: str, actor_name: str = "") -> str:
    base = clean_video_title(base_title)
    actor = (actor_name or "").strip()
    if not actor:
        return base
    if actor.lower() in base.lower():
        return base
    return f"{actor} — {base}"


def load_dev_vars() -> dict[str, str]:
    values: dict[str, str] = {}
    if not DEV_VARS.exists():
        return values
    for line in DEV_VARS.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def read_url_list(path: Path) -> list[str]:
    if not path.exists():
        return []
    urls: list[str] = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            urls.append(line)
    return urls


def write_url_list(path: Path, urls: list[str], header: str) -> None:
    body = "\n".join(urls)
    path.write_text(f"{header}\n{body}\n" if body else f"{header}\n")


def append_line(path: Path, line: str) -> None:
    with path.open("a", encoding="utf-8") as handle:
        handle.write(line.rstrip() + "\n")


def load_queue_meta() -> dict[str, dict]:
    if not QUEUE_META_FILE.exists():
        return {}
    try:
        data = json.loads(QUEUE_META_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def save_queue_meta(meta: dict[str, dict]) -> None:
    QUEUE_META_FILE.write_text(
        json.dumps(meta, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def prune_queue_meta(urls: list[str]) -> dict[str, dict]:
    meta = load_queue_meta()
    keep = {u: meta[u] for u in urls if u in meta}
    if keep != meta:
        save_queue_meta(keep)
    return keep


def _fetch_search_html(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": SEARCH_UA})
    with urllib.request.urlopen(req, timeout=30) as res:
        return res.read().decode("utf-8", "replace")


def _slug_title(path: str) -> str:
    slug = path.rstrip("/").split("/")[-1]
    slug = urllib.parse.unquote_plus(slug)
    slug = re.sub(r"[_+]+", " ", slug)
    return clean_video_title(slug) or "Untitled"


def _parse_xvideos(html: str, limit: int) -> list[dict]:
    pairs = re.findall(
        r'href="(/video\.[^"]+)"[^>]*title="([^"]+)"',
        html,
        flags=re.I,
    )
    if not pairs:
        pairs = [
            (path, _slug_title(path))
            for path in re.findall(r'href="(/video\.[^"]+)"', html, flags=re.I)
        ]
    # data-src thumbs keyed by nearby video href
    thumb_map: dict[str, str] = {}
    for path, thumb in re.findall(
        r'href="(/video\.[^"]+)"[^>]*>.{0,500}?data-src="(https?://[^"]+)"',
        html,
        flags=re.I | re.S,
    ):
        thumb_map.setdefault(path, thumb)
    for path, thumb in re.findall(
        r'data-src="(https?://[^"]+)"[^>]*.{0,500}?href="(/video\.[^"]+)"',
        html,
        flags=re.I | re.S,
    ):
        thumb_map.setdefault(path, thumb)

    out: list[dict] = []
    seen: set[str] = set()
    for path, title in pairs:
        url = "https://www.xvideos.com" + path
        if url in seen:
            continue
        seen.add(url)
        out.append(
            {
                "id": path,
                "title": html_lib.unescape(title).strip() or _slug_title(path),
                "url": url,
                "site": "xvideos",
                "poster": thumb_map.get(path, ""),
            }
        )
        if len(out) >= limit:
            break
    return out


def _parse_xnxx(html: str, limit: int) -> list[dict]:
    pairs = re.findall(
        r'href="(/video-[^"]+)"[^>]*title="([^"]+)"',
        html,
        flags=re.I,
    )
    if not pairs:
        pairs = [
            (path, _slug_title(path))
            for path in re.findall(r'href="(/video-[^"]+)"', html, flags=re.I)
        ]
    thumb_map: dict[str, str] = {}
    for path, thumb in re.findall(
        r'href="(/video-[^"]+)"[^>]*>.{0,500}?data-src="(https?://[^"]+)"',
        html,
        flags=re.I | re.S,
    ):
        thumb_map.setdefault(path, thumb)

    out: list[dict] = []
    seen: set[str] = set()
    for path, title in pairs:
        url = "https://www.xnxx.com" + path
        if url in seen:
            continue
        seen.add(url)
        out.append(
            {
                "id": path,
                "title": html_lib.unescape(title).strip() or _slug_title(path),
                "url": url,
                "site": "xnxx",
                "poster": thumb_map.get(path, ""),
            }
        )
        if len(out) >= limit:
            break
    return out


def _parse_pornhub(html: str, limit: int) -> list[dict]:
    pairs = re.findall(
        r'href="(/view_video\.php\?viewkey=[^"&]+)"[^>]*title="([^"]+)"',
        html,
        flags=re.I,
    )
    thumb_map: dict[str, str] = {}
    for path, thumb in re.findall(
        r'href="(/view_video\.php\?viewkey=[^"&]+)"[^>]*>.{0,800}?data-mediumthumb="(https?://[^"]+)"',
        html,
        flags=re.I | re.S,
    ):
        thumb_map.setdefault(path.split("&")[0], thumb)
    for path, thumb in re.findall(
        r'data-mediumthumb="(https?://[^"]+)"[^>]*.{0,800}?href="(/view_video\.php\?viewkey=[^"&]+)"',
        html,
        flags=re.I | re.S,
    ):
        thumb_map.setdefault(path.split("&")[0], thumb)

    out: list[dict] = []
    seen: set[str] = set()
    for path, title in pairs:
        path = path.split("&")[0]
        url = "https://www.pornhub.com" + path
        if url in seen:
            continue
        seen.add(url)
        cleaned = html_lib.unescape(title).strip()
        if cleaned.lower() in {"pornhub", "video"}:
            continue
        out.append(
            {
                "id": path,
                "title": cleaned or path,
                "url": url,
                "site": "pornhub",
                "poster": thumb_map.get(path, ""),
            }
        )
        if len(out) >= limit:
            break
    return out


def _parse_fpo(html: str, limit: int) -> list[dict]:
    pairs = re.findall(
        r'href="(https?://(?:www\.)?fpo\.xxx/video/\d+/[^"]+/)"[^>]*title="([^"]+)"',
        html,
        flags=re.I,
    )
    if not pairs:
        pairs = [
            (url, _slug_title(url))
            for url in re.findall(
                r'href="(https?://(?:www\.)?fpo\.xxx/video/\d+/[^"]+/)"',
                html,
                flags=re.I,
            )
        ]
    thumb_map: dict[str, str] = {}
    for url, thumb in re.findall(
        r'href="(https?://(?:www\.)?fpo\.xxx/video/\d+/[^"]+/)"[^>]*>.{0,600}?src="(https?://[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"',
        html,
        flags=re.I | re.S,
    ):
        thumb_map.setdefault(url.split("?")[0], thumb)

    out: list[dict] = []
    seen: set[str] = set()
    for url, title in pairs:
        url = url.split("?")[0]
        if url in seen:
            continue
        seen.add(url)
        out.append(
            {
                "id": url.rstrip("/").split("/")[-2]
                if url.rstrip("/").split("/")[-1]
                else url,
                "title": html_lib.unescape(title).strip() or _slug_title(url),
                "url": url,
                "site": "fpo",
                "poster": thumb_map.get(url, ""),
            }
        )
        if len(out) >= limit:
            break
    return out


def normalize_source_url(url: str) -> str:
    """Canonical form so http/https, www, and trailing-slash variants match."""
    raw = (url or "").strip()
    if not raw:
        return ""
    try:
        parsed = urllib.parse.urlsplit(raw)
    except ValueError:
        return raw.rstrip("/")
    scheme = (parsed.scheme or "https").lower()
    if scheme not in {"http", "https"}:
        return raw.rstrip("/")
    netloc = parsed.netloc.lower()
    if netloc.startswith("www."):
        netloc = netloc[4:]
    path = parsed.path or "/"
    path = re.sub(r"/{2,}", "/", path)
    if len(path) > 1 and path.endswith("/"):
        path = path[:-1]
    drop = {
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_term",
        "utm_content",
        "fbclid",
        "gclid",
    }
    query = [
        (k, v)
        for k, v in urllib.parse.parse_qsl(parsed.query, keep_blank_values=False)
        if k.lower() not in drop
    ]
    query_str = urllib.parse.urlencode(query)
    return urllib.parse.urlunsplit((scheme, netloc, path, query_str, ""))


def outbound_id_for_url(source_url: str) -> str:
    normalized = normalize_source_url(source_url) or source_url.strip()
    digest = __import__("hashlib").sha256(normalized.encode("utf-8")).hexdigest()
    return f"out_{digest[:12]}"


def load_outbound_films() -> list[dict]:
    path = OUTBOUND_PUBLIC if OUTBOUND_PUBLIC.exists() else OUTBOUND_OUT
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    return data if isinstance(data, list) else []


def save_outbound_films(records: list[dict]) -> None:
    payload = json.dumps(records, indent=2, ensure_ascii=False) + "\n"
    OUTBOUND_PUBLIC.parent.mkdir(parents=True, exist_ok=True)
    OUTBOUND_PUBLIC.write_text(payload, encoding="utf-8")
    if OUTBOUND_OUT.parent.exists():
        OUTBOUND_OUT.write_text(payload, encoding="utf-8")


def fetch_poster_from_page(page_url: str) -> str:
    try:
        html = _fetch_search_html(page_url)
    except Exception:  # noqa: BLE001
        return ""
    for pattern in (
        r'property="og:image"\s+content="([^"]+)"',
        r'content="([^"]+)"\s+property="og:image"',
        r'name="twitter:image"\s+content="([^"]+)"',
        r'content="([^"]+)"\s+name="twitter:image"',
    ):
        match = re.search(pattern, html, flags=re.I)
        if match:
            return html_lib.unescape(match.group(1).strip())
    return ""


def _admin_request_json(
    site: str,
    path: str,
    payload: dict | None = None,
    token: str | None = None,
    method: str = "POST",
) -> tuple[int, dict]:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {
        "Accept": "application/json",
        "User-Agent": (
            "ShortFilmSitePublisher/1.0 (+local-python-script; "
            "compatible; admin-sync)"
        ),
    }
    if payload is not None:
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(
        f"{site}{path}",
        data=body,
        headers=headers,
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            raw = res.read().decode("utf-8")
            data = json.loads(raw) if raw else {}
            return res.status, data if isinstance(data, dict) else {}
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        try:
            data = json.loads(detail) if detail else {}
        except json.JSONDecodeError:
            data = {"error": detail or str(err)}
        return err.code, data if isinstance(data, dict) else {"error": detail}


def fetch_live_outbound_films(log: LogFn = print) -> list[dict]:
    """Load the live KV catalog so duplicate checks include already-published links."""
    # Prefer wrangler (bypasses Cloudflare WAF / Error 1010 on Worker URLs)
    try:
        result = subprocess.run(
            [
                "npx",
                "--yes",
                "wrangler@4",
                "kv",
                "key",
                "get",
                OUTBOUND_KV_KEY,
                f"--namespace-id={OUTBOUND_KV_ID}",
                "--remote",
            ],
            cwd=ROOT,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=120,
            shell=os.name == "nt",
        )
        if result.returncode == 0 and (result.stdout or "").strip():
            data = json.loads(result.stdout)
            if isinstance(data, list):
                log(f"  Loaded {len(data)} existing live outbound link(s) for dedupe.")
                return data
    except Exception as exc:  # noqa: BLE001
        log(f"  Could not load live KV via wrangler ({exc})")

    # Fallback: Worker admin API (may be blocked by Cloudflare bot rules)
    env = load_dev_vars()
    site = (os.environ.get("SITE_URL") or env.get("SITE_URL") or "").strip().rstrip("/")
    password = (
        os.environ.get("ADMIN_PASSWORD") or env.get("ADMIN_PASSWORD") or ""
    ).strip()
    if not site or not password:
        return []
    try:
        status, login = _admin_request_json(
            site, "/api/admin/login", {"password": password}
        )
        if status >= 400 or not login.get("token"):
            return []
        status, data = _admin_request_json(
            site,
            "/api/admin/outbound",
            payload=None,
            token=str(login["token"]),
            method="GET",
        )
        if status >= 400:
            return []
        films = data.get("films")
        if isinstance(films, list):
            log(f"  Loaded {len(films)} existing live outbound link(s) for dedupe.")
            return films
    except Exception as exc:  # noqa: BLE001
        log(f"  Could not load live catalog for dedupe ({exc})")
    return []


def sync_outbound_to_live_site(films: list[dict], log: LogFn = print) -> dict:
    """Push catalog to Cloudflare KV so the site updates without rebuild.

    Uses `wrangler kv key put` (direct to KV API) so Cloudflare WAF / Error 1010
    on the Worker URL cannot block sync.
    """
    tmp_path = HERE / ".outbound-sync.json"
    try:
        tmp_path.write_text(
            json.dumps(films, ensure_ascii=False),
            encoding="utf-8",
        )
        log(f"  Syncing {len(films)} outbound link(s) to Cloudflare KV…")
        cmd = [
            "npx",
            "--yes",
            "wrangler@4",
            "kv",
            "key",
            "put",
            OUTBOUND_KV_KEY,
            f"--namespace-id={OUTBOUND_KV_ID}",
            f"--path={tmp_path}",
            "--remote",
        ]
        result = subprocess.run(
            cmd,
            cwd=ROOT,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=180,
            shell=os.name == "nt",
        )
        if result.returncode != 0:
            detail = (result.stderr or result.stdout or "wrangler kv put failed").strip()
            return {"ok": False, "error": detail[:500]}
        log(f"  Live KV updated ({len(films)} links).")
        return {"ok": True, "count": len(films), "method": "wrangler-kv"}
    except FileNotFoundError:
        return {
            "ok": False,
            "error": "npx/wrangler not found. Install Node.js and run: npx wrangler login",
        }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except OSError:
            pass


def publish_outbound_links(
    items: list[dict],
    actor_name: str = "",
    log: LogFn = print,
) -> dict:
    """Publish selected search results as outbound catalog entries (no download)."""
    existing = load_outbound_films()
    live = fetch_live_outbound_films(log=log)
    # Prefer live records when both exist (same id)
    by_id: dict[str, dict] = {}
    for r in existing + live:
        rid = str(r.get("id") or "").strip()
        if rid:
            by_id[rid] = r

    existing_urls = {
        normalize_source_url(str(r.get("sourceUrl") or ""))
        for r in by_id.values()
        if r.get("sourceUrl")
    }
    existing_urls.discard("")

    added = 0
    skipped = 0
    actor = (actor_name or "").strip()
    batch_seen: set[str] = set()

    for item in items:
        source_url = normalize_source_url(
            str(item.get("url") or item.get("sourceUrl") or "")
        )
        if not source_url:
            continue
        if source_url in batch_seen:
            skipped += 1
            continue
        batch_seen.add(source_url)

        film_id = outbound_id_for_url(source_url)
        title = clean_video_title(str(item.get("title") or source_url))
        if actor and actor.lower() not in title.lower():
            title = f"{actor} — {title}"

        if film_id in by_id or source_url in existing_urls:
            skipped += 1
            log(f"  Skip duplicate: {title[:70]}")
            continue

        poster = str(item.get("poster") or item.get("posterUrl") or "").strip()
        if not poster:
            log(f"  Fetching thumbnail for {title[:48]}…")
            poster = fetch_poster_from_page(source_url)

        record = {
            "id": film_id,
            "title": title,
            "sourceUrl": source_url,
            "posterUrl": poster or None,
            "actor": actor or None,
            "site": str(item.get("site") or "").strip() or None,
            "dateAdded": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        by_id[film_id] = {k: v for k, v in record.items() if v is not None}
        existing_urls.add(source_url)
        added += 1

    merged = list(by_id.values())
    save_outbound_films(merged)
    log(
        f"Published {added} new outbound link(s)"
        + (f", skipped {skipped} duplicate(s)" if skipped else "")
        + f". Catalog size: {len(merged)}"
    )

    sync = sync_outbound_to_live_site(merged, log=log)
    if sync.get("skipped"):
        log(f"  {sync.get('error')}")
        log("  Local JSON saved — live KV sync was skipped.")
    elif not sync.get("ok"):
        log(f"  Live sync failed: {sync.get('error')}")
        log("  Tip: run `npx wrangler login` then publish again.")
    return {
        "added": added,
        "skipped": skipped,
        "updated": 0,
        "count": len(merged),
        "films": merged,
        "synced": bool(sync.get("ok")),
        "sync": sync,
    }


def scrape_fpo_page(page: int) -> list[dict]:
    """Newest FPO listings. Page 1 = /new-1/, page N = /new-1/N/."""
    path = "https://www.fpo.xxx/new-1/" if page <= 1 else f"https://www.fpo.xxx/new-1/{page}/"
    try:
        html = _fetch_search_html(path)
    except Exception:  # noqa: BLE001
        return []
    return [
        {**item, "poster": item.get("poster") or ""}
        for item in _parse_fpo(html, limit=100)
    ]


def scrape_playvids_page(page: int) -> list[dict]:
    """Newest Playvids listings via ?page=N."""
    url = f"https://www.playvids.com/?page={max(1, page)}"
    try:
        html = _fetch_search_html(url)
    except Exception:  # noqa: BLE001
        return []
    pairs = re.findall(
        r'href="(/[A-Za-z0-9]{8,14}/[^"]+)"[^>]*>.*?alt="([^"]+)"',
        html,
        flags=re.I | re.S,
    )
    out: list[dict] = []
    seen: set[str] = set()
    skip_prefixes = (
        "/account/",
        "/categories/",
        "/channels/",
        "/pornstars/",
        "/tags/",
        "/search",
    )
    for path, title in pairs:
        path = path.split("?")[0]
        if any(path.startswith(p) for p in skip_prefixes):
            continue
        parts = path.strip("/").split("/")
        if len(parts) < 2 or len(parts[0]) < 6:
            continue
        full = "https://www.playvids.com" + path
        if full in seen:
            continue
        seen.add(full)
        cleaned = html_lib.unescape(title).strip() or _slug_title(path)
        if cleaned.lower() in {"playvids", "video"}:
            continue
        out.append(
            {
                "id": parts[0],
                "title": cleaned,
                "url": full,
                "site": "playvids",
                "poster": "",
            }
        )
    return out


def import_catalog_to_site(
    sites: list[str] | None = None,
    max_pages: int = 100,
    log: LogFn = print,
    stop_event: threading.Event | None = None,
    until_caught_up: bool = False,
) -> dict:
    """Crawl newest listings and publish as outbound links (deduped + KV sync).

    until_caught_up: stop a site early once a page adds 0 new videos (all duplicates).
    Use this for scheduled “sync new” runs so only fresh listings are pulled.
    """
    chosen = [s for s in (sites or list(CATALOG_SOURCES.keys())) if s in CATALOG_SOURCES]
    if not chosen:
        raise ValueError("No valid catalog sites selected")
    max_pages = max(1, min(1000, int(max_pages)))

    total_added = 0
    total_skipped = 0
    pages_done = 0

    scrapers = {
        "fpo": scrape_fpo_page,
        "playvids": scrape_playvids_page,
    }

    for site in chosen:
        if stop_event is not None and stop_event.is_set():
            log("Import stopped by user.")
            break
        label = CATALOG_SOURCES[site]["label"]
        mode = "until caught up" if until_caught_up else f"up to {max_pages} pages"
        log(f"=== Importing {label} ({mode}) ===")
        empty_streak = 0
        for page in range(1, max_pages + 1):
            if stop_event is not None and stop_event.is_set():
                log("Import stopped by user.")
                break
            log(f"  [{label}] page {page}/{max_pages}…")
            try:
                items = scrapers[site](page)
            except Exception as exc:  # noqa: BLE001
                log(f"  [{label}] page {page} failed: {exc}")
                empty_streak += 1
                if empty_streak >= 3:
                    break
                continue
            if not items:
                empty_streak += 1
                log(f"  [{label}] page {page}: no videos")
                if empty_streak >= 3:
                    log(f"  [{label}] stopping after empty pages")
                    break
                continue
            empty_streak = 0
            pages_done += 1
            result = publish_outbound_links(items, actor_name="", log=log)
            added = int(result.get("added") or 0)
            skipped = int(result.get("skipped") or 0)
            total_added += added
            total_skipped += skipped
            if until_caught_up and added == 0 and skipped > 0:
                log(
                    f"  [{label}] caught up — page {page} had no new links "
                    f"({skipped} already on site). Stopping this site."
                )
                break

    log(
        f"Import finished. Added {total_added}, skipped {total_skipped} duplicate(s), "
        f"pages crawled {pages_done}."
    )
    return {
        "added": total_added,
        "skipped": total_skipped,
        "pages": pages_done,
        "sites": chosen,
        "count": len(load_outbound_films()),
    }


_PARSERS = {
    "xvideos": _parse_xvideos,
    "xnxx": _parse_xnxx,
    "pornhub": _parse_pornhub,
    "fpo": _parse_fpo,
}


def search_actor_videos(
    actor_name: str,
    sources: list[str] | None = None,
    limit_per_source: int = 24,
) -> list[dict]:
    """Search supported sites for videos matching an actor name."""
    actor = (actor_name or "").strip()
    if not actor:
        raise ValueError("Actor name is required")

    chosen = sources or list(SEARCH_SOURCES.keys())
    results: list[dict] = []
    seen_urls: set[str] = set()

    for key in chosen:
        source = SEARCH_SOURCES.get(key)
        parser = _PARSERS.get(key)
        if not source or not parser:
            continue
        search_url = source["url"](actor)
        try:
            page = _fetch_search_html(search_url)
            found = parser(page, limit_per_source)
        except Exception as exc:  # noqa: BLE001
            results.append(
                {
                    "id": f"error:{key}",
                    "title": f"Search failed on {source['label']}: {exc}",
                    "url": "",
                    "site": key,
                    "error": True,
                }
            )
            continue

        for item in found:
            if item["url"] in seen_urls:
                continue
            seen_urls.add(item["url"])
            item["actor"] = actor
            results.append(item)

    return [r for r in results if not r.get("error")] + [
        r for r in results if r.get("error")
    ]


def bunny_request(
    method: str,
    path: str,
    api_key: str,
    data: bytes | None = None,
    content_type: str | None = None,
) -> dict:
    url = f"https://video.bunnycdn.com{path}"
    headers = {
        "AccessKey": api_key,
        "Accept": "application/json",
    }
    if content_type:
        headers["Content-Type"] = content_type
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as res:
            body = res.read().decode("utf-8")
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Bunny API {err.code}: {detail}") from err


def ytdlp_cmd() -> list[str]:
    """Prefer `python -m yt_dlp` so Windows works when Scripts/ is not on PATH."""
    return [sys.executable, "-m", "yt_dlp"]


def download_with_ytdlp(source_url: str, log: LogFn = print) -> Path:
    DOWNLOAD_DIR.mkdir(exist_ok=True)
    out_template = str(DOWNLOAD_DIR / "%(title)s [%(id)s].%(ext)s")
    before = {p.resolve() for p in DOWNLOAD_DIR.glob("*") if p.is_file()}

    # Prefer a single progressive file (much faster) over video+audio merge.
    cmd = [
        *ytdlp_cmd(),
        "-f",
        "b[ext=mp4]/b/bv*+ba/b",
        "--merge-output-format",
        "mp4",
        "-N",
        str(YTDLP_FRAGMENTS),
        "--buffer-size",
        "64K",
        "--http-chunk-size",
        "10M",
        "--retries",
        "5",
        "--fragment-retries",
        "5",
        "--no-mtime",
        "-o",
        out_template,
        "--no-overwrites",
        "--print",
        "after_move:filepath",
        "--print",
        "filepath",
        "--no-progress",
        source_url,
    ]
    log(f"  yt-dlp downloading… ({YTDLP_FRAGMENTS} fragments)")
    result = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    if result.returncode != 0:
        err = (result.stderr or "").strip() or "yt-dlp failed"
        if "No module named yt_dlp" in err:
            raise RuntimeError(
                "yt-dlp is not installed. Run: python3 -m pip install -U yt-dlp"
            )
        raise RuntimeError(err)

    printed = [
        line.strip()
        for line in (result.stdout or "").splitlines()
        if line.strip() and not line.startswith("[")
    ]
    for candidate in reversed(printed):
        path = Path(candidate)
        if path.is_file():
            return path

    after = {p.resolve() for p in DOWNLOAD_DIR.glob("*") if p.is_file()}
    new_files = sorted(after - before, key=lambda p: p.stat().st_mtime, reverse=True)
    # Ignore leftover .part files from interrupted runs
    finished = [p for p in new_files if p.suffix.lower() != ".part"]
    mp4s = [p for p in finished if p.suffix.lower() == ".mp4"]
    if mp4s:
        return mp4s[0]
    if finished:
        return finished[0]
    raise RuntimeError("Download finished but no output file was found")


def upload_file_binary(file_path: Path, video_id: str, api_key: str) -> None:
    """Stream raw bytes to Bunny (curl --data-binary). Avoids loading the whole file into RAM
    and avoids urllib's default form Content-Type that breaks large uploads.
    """
    url = f"https://video.bunnycdn.com/library/{LIBRARY_ID}/videos/{video_id}"
    cmd = [
        "curl",
        "-sS",
        "-X",
        "PUT",
        url,
        "-H",
        f"AccessKey: {api_key}",
        "-H",
        "Accept: application/json",
        "-H",
        "Content-Type: application/octet-stream",
        "--data-binary",
        f"@{file_path}",
        "--fail-with-body",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "curl upload failed").strip()
        raise RuntimeError(detail)
    body = (result.stdout or "").strip()
    if body:
        try:
            payload = json.loads(body)
            if payload.get("success") is False:
                raise RuntimeError(body)
        except json.JSONDecodeError:
            pass


def upload_to_bunny(
    file_path: Path,
    api_key: str,
    log: LogFn = print,
    actor_name: str = "",
    title_hint: str = "",
) -> dict:
    base = title_hint or file_path.stem
    title = title_with_actor(base, actor_name)
    log(f"  Creating Bunny video: {title}")
    log(f"  Collection: {COLLECTION_ID}")
    created = bunny_request(
        "POST",
        f"/library/{LIBRARY_ID}/videos",
        api_key,
        data=json.dumps(
            {
                "title": title,
                "collectionId": COLLECTION_ID,
            }
        ).encode("utf-8"),
        content_type="application/json",
    )
    video_id = created.get("guid")
    if not video_id:
        raise RuntimeError(f"No video guid returned: {created}")

    size_mb = file_path.stat().st_size / (1024 * 1024)
    log(f"  Uploading {file_path.name} ({size_mb:.1f} MB, streaming)…")
    upload_file_binary(file_path, video_id, api_key)

    embed = f"https://player.mediadelivery.net/embed/{LIBRARY_ID}/{video_id}"
    return {
        "title": title,
        "videoId": video_id,
        "embedUrl": embed,
        "file": str(file_path),
    }


def mark_success(
    url_or_label: str, result: dict, file_path: Path, log: LogFn = print
) -> None:
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    append_line(
        DONE_FILE,
        f"{stamp}\t{result['videoId']}\t{result['embedUrl']}\t{url_or_label}",
    )
    try:
        file_path.unlink(missing_ok=True)
        log(f"  Deleted local file: {file_path.name}")
    except OSError as cleanup_err:
        log(f"  Warning: could not delete local file ({cleanup_err})")
    log("  OK")
    log(f"  video id:  {result['videoId']}")
    log(f"  embed url: {result['embedUrl']}\n")


def upload_existing_downloads(api_key: str) -> int:
    DOWNLOAD_DIR.mkdir(exist_ok=True)
    files = sorted(
        [
            p
            for p in DOWNLOAD_DIR.iterdir()
            if p.is_file() and p.suffix.lower() in {".mp4", ".mov", ".mkv", ".webm"}
        ]
    )
    if not files:
        print("No local videos found in python-script/downloads/")
        return 1

    print(f"Bunny library: {LIBRARY_ID}")
    print(f"Collection: {COLLECTION_ID}")
    print(f"Uploading {len(files)} existing file(s)\n")
    failed = 0
    for i, file_path in enumerate(files, 1):
        print(f"=== [{i}/{len(files)}] {file_path.name}")
        try:
            result = upload_to_bunny(file_path, api_key)
            mark_success(f"local:{file_path.name}", result, file_path)
        except Exception as exc:  # noqa: BLE001
            failed += 1
            append_line(FAILED_FILE, f"local:{file_path.name}\t{exc}")
            print(f"  Kept local file after failure: {file_path.name}")
            print(f"  FAILED: {exc}\n")

    if failed:
        print(f"Finished with {failed} failure(s). See failed.txt")
        return 1
    print("All uploads finished.")
    return 0


def interactive_urls() -> list[str]:
    print("Paste URLs (one per line). Empty line starts the queue.\n")
    urls: list[str] = []
    while True:
        try:
            line = input("> ").strip()
        except EOFError:
            break
        if not line:
            break
        if line.startswith("#"):
            continue
        urls.append(line)
    return urls


def process_queue(
    urls: list[str],
    api_key: str,
    from_queue_file: bool,
    log: LogFn = print,
    stop_event: threading.Event | None = None,
    url_meta: dict[str, dict] | None = None,
    workers: int | None = None,
) -> int:
    if not urls:
        log("Queue is empty. Add URLs to python-script/queue.txt and run again.")
        return 1

    remaining = list(urls)
    meta = dict(url_meta or load_queue_meta())
    workers = max(1, min(6, workers if workers is not None else DOWNLOAD_WORKERS))
    state_lock = threading.Lock()
    failed = 0
    total = len(urls)
    completed = 0

    log(f"Bunny library: {LIBRARY_ID}")
    log(f"Collection: {COLLECTION_ID}")
    log(f"Queued: {total} video(s) · parallel workers: {workers}\n")

    def persist_queue() -> None:
        if not from_queue_file:
            return
        with state_lock:
            write_url_list(
                QUEUE_FILE,
                list(remaining),
                "# One URL per line. Processed URLs are removed and logged in done.txt",
            )
            save_queue_meta({u: meta[u] for u in remaining if u in meta})

    def process_one(index: int, url: str) -> None:
        nonlocal failed, completed
        if stop_event is not None and stop_event.is_set():
            return

        item_meta = meta.get(url) or {}
        actor = str(item_meta.get("actor") or "").strip()
        title_hint = str(item_meta.get("title") or "").strip()
        label = f"{actor} | {url}" if actor else url
        log(f"=== [{index}/{total}] {label}")
        file_path: Path | None = None
        try:
            file_path = download_with_ytdlp(url, log=log)
            if stop_event is not None and stop_event.is_set():
                log("  Stopped before upload — keeping local file and queue item.")
                return
            result = upload_to_bunny(
                file_path,
                api_key,
                log=log,
                actor_name=actor,
                title_hint=title_hint,
            )
            mark_success(url, result, file_path, log=log)
            with state_lock:
                if url in remaining:
                    remaining.remove(url)
                meta.pop(url, None)
                completed += 1
        except Exception as exc:  # noqa: BLE001
            with state_lock:
                failed += 1
                if url in remaining:
                    remaining.remove(url)
                meta.pop(url, None)
                completed += 1
            append_line(FAILED_FILE, f"{url}\t{exc}")
            if file_path and file_path.exists():
                log(f"  Kept local file after failure: {file_path.name}")
            log(f"  FAILED: {exc}\n")
        persist_queue()

    # Submit in order; worker pool runs several at once.
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = []
        for i, url in enumerate(urls, 1):
            if stop_event is not None and stop_event.is_set():
                break
            futures.append(pool.submit(process_one, i, url))
        for fut in as_completed(futures):
            if stop_event is not None and stop_event.is_set():
                for pending in futures:
                    pending.cancel()
                break
            try:
                fut.result()
            except Exception as exc:  # noqa: BLE001
                log(f"  Worker error: {exc}")

    if stop_event is not None and stop_event.is_set():
        log("Stopped by user. Remaining URLs kept in queue.")
        persist_queue()
        return 1

    if failed:
        log(f"Finished with {failed} failure(s). See failed.txt")
        return 1
    log("All uploads finished.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Download queued videos with yt-dlp and upload to Bunny Stream"
    )
    parser.add_argument(
        "urls",
        nargs="*",
        help="Optional URLs (otherwise uses queue.txt)",
    )
    parser.add_argument(
        "-i",
        "--interactive",
        action="store_true",
        help="Type/paste URLs interactively, then process",
    )
    parser.add_argument(
        "--upload-existing",
        action="store_true",
        help="Upload videos already in python-script/downloads/ (skip yt-dlp)",
    )
    parser.add_argument(
        "--sync-new",
        action="store_true",
        help=(
            "Hands-off catalog sync: pull newest FPO + Playvids pages and publish "
            "only new outbound links (stops when a page is all duplicates)"
        ),
    )
    parser.add_argument(
        "--pages",
        type=int,
        default=5,
        help="With --sync-new: max newest pages per site (default 5)",
    )
    parser.add_argument(
        "--sites",
        default="fpo,playvids",
        help="With --sync-new: comma-separated sites (default fpo,playvids)",
    )
    args = parser.parse_args()

    if args.sync_new:
        sites = [s.strip() for s in str(args.sites).split(",") if s.strip()]
        result = import_catalog_to_site(
            sites=sites,
            max_pages=max(1, int(args.pages)),
            until_caught_up=True,
            log=print,
        )
        print(
            f"Sync done: +{result.get('added', 0)} new, "
            f"{result.get('skipped', 0)} skipped, "
            f"{result.get('count', 0)} total on site."
        )
        return 0

    env = load_dev_vars()
    api_key = os.environ.get("BUNNY_API_KEY") or env.get("BUNNY_API_KEY", "")
    if not api_key or api_key == "paste_your_bunny_stream_library_api_key_here":
        print("Set BUNNY_API_KEY in the project .dev.vars file first.")
        return 1

    if args.upload_existing:
        return upload_existing_downloads(api_key)

    from_queue_file = False
    if args.interactive:
        urls = interactive_urls()
    elif args.urls:
        urls = []
        for arg in args.urls:
            path = Path(arg)
            if path.is_file():
                urls.extend(read_url_list(path))
            else:
                urls.append(arg)
    else:
        if not QUEUE_FILE.exists():
            write_url_list(
                QUEUE_FILE,
                [],
                "# One URL per line. Processed URLs are removed and logged in done.txt",
            )
        urls = read_url_list(QUEUE_FILE)
        from_queue_file = True

    return process_queue(urls, api_key, from_queue_file=from_queue_file)


if __name__ == "__main__":
    raise SystemExit(main())
