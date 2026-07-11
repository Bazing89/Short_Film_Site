#!/usr/bin/env python3
"""
Local browser UI for the yt-dlp → Bunny queue.

  python3 python-script/ui.py
  # opens http://127.0.0.1:8765
"""

from __future__ import annotations

import json
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

import download_to_bunny as bunny

HOST = "127.0.0.1"
PORT = 8765
QUEUE_HEADER = (
    "# One URL per line. Processed URLs are removed and logged in done.txt"
)

_state_lock = threading.Lock()
_logs: list[str] = []
_running = False
_searching = False
_stop_event = threading.Event()
_worker: threading.Thread | None = None
_search_worker: threading.Thread | None = None
_last_exit: int | None = None
_search_results: list[dict] = []
_search_actor = ""
_search_error = ""


def _parse_urls(text: str) -> list[str]:
    urls: list[str] = []
    seen: set[str] = set()
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line not in seen:
            seen.add(line)
            urls.append(line)
    return urls


def _ensure_queue_file() -> None:
    if not bunny.QUEUE_FILE.exists():
        bunny.write_url_list(bunny.QUEUE_FILE, [], QUEUE_HEADER)


def _load_queue() -> list[str]:
    _ensure_queue_file()
    return bunny.read_url_list(bunny.QUEUE_FILE)


def _save_queue(urls: list[str]) -> None:
    bunny.write_url_list(bunny.QUEUE_FILE, urls, QUEUE_HEADER)
    bunny.prune_queue_meta(urls)


def _append_log(message: str) -> None:
    with _state_lock:
        for line in message.splitlines() or [""]:
            _logs.append(line)
        if len(_logs) > 2000:
            del _logs[:-1500]


def _queue_display() -> list[dict]:
    urls = _load_queue()
    meta = bunny.load_queue_meta()
    items = []
    for url in urls:
        info = meta.get(url) or {}
        items.append(
            {
                "url": url,
                "actor": info.get("actor") or "",
                "title": info.get("title") or "",
            }
        )
    return items


def _snapshot() -> dict:
    with _state_lock:
        outbound = bunny.load_outbound_films()
        return {
            "running": _running,
            "searching": _searching,
            "lastExit": _last_exit,
            "queue": _queue_display(),
            "doneCount": len(bunny.read_url_list(bunny.DONE_FILE)),
            "failedCount": len(bunny.read_url_list(bunny.FAILED_FILE)),
            "outboundCount": len(outbound),
            "logs": list(_logs[-400:]),
            "libraryId": bunny.LIBRARY_ID,
            "collectionId": bunny.COLLECTION_ID,
            "hasApiKey": bool(
                (bunny.load_dev_vars().get("BUNNY_API_KEY") or "").strip()
            ),
            "searchActor": _search_actor,
            "searchResults": list(_search_results),
            "searchError": _search_error,
            "sources": [
                {"id": key, "label": val["label"]}
                for key, val in bunny.SEARCH_SOURCES.items()
            ],
        }


def _run_queue() -> None:
    global _running, _last_exit, _worker
    env = bunny.load_dev_vars()
    api_key = env.get("BUNNY_API_KEY", "").strip()
    if not api_key:
        _append_log("Set BUNNY_API_KEY in the project .dev.vars file first.")
        with _state_lock:
            _running = False
            _last_exit = 1
            _worker = None
        return

    urls = _load_queue()
    meta = bunny.load_queue_meta()
    _stop_event.clear()
    try:
        code = bunny.process_queue(
            urls,
            api_key,
            from_queue_file=True,
            log=_append_log,
            stop_event=_stop_event,
            url_meta=meta,
        )
    except Exception as exc:  # noqa: BLE001
        _append_log(f"Worker crashed: {exc}")
        code = 1
    with _state_lock:
        _running = False
        _last_exit = code
        _worker = None


def _start_worker() -> tuple[bool, str]:
    global _running, _worker, _last_exit
    with _state_lock:
        if _running:
            return False, "Already running"
        if _searching:
            return False, "Wait for search to finish"
        urls = _load_queue()
        if not urls:
            return False, "Queue is empty — search or paste links first"
        _logs.clear()
        _last_exit = None
        _running = True
        _worker = threading.Thread(target=_run_queue, daemon=True)
        _worker.start()
    return True, "Started"


def _run_search(actor: str, sources: list[str], limit: int) -> None:
    global _searching, _search_results, _search_error, _search_actor, _search_worker
    try:
        results = bunny.search_actor_videos(
            actor, sources=sources or None, limit_per_source=limit
        )
        with _state_lock:
            _search_results = results
            _search_error = "" if results else "No videos found for that name."
            _search_actor = actor
    except Exception as exc:  # noqa: BLE001
        with _state_lock:
            _search_results = []
            _search_error = str(exc)
            _search_actor = actor
    finally:
        with _state_lock:
            _searching = False
            _search_worker = None


def _start_search(actor: str, sources: list[str], limit: int) -> tuple[bool, str]:
    global _searching, _search_worker, _search_error, _search_results, _search_actor
    actor = (actor or "").strip()
    if not actor:
        return False, "Enter an actor name"
    if limit < 1 or limit > 60:
        return False, "Limit must be between 1 and 60"
    with _state_lock:
        if _searching:
            return False, "Search already running"
        if _running:
            return False, "Cannot search while downloads are running"
        _searching = True
        _search_error = ""
        _search_results = []
        _search_actor = actor
        _search_worker = threading.Thread(
            target=_run_search, args=(actor, sources, limit), daemon=True
        )
        _search_worker.start()
    return True, "Searching"


def _queue_search_selection(urls: list[str]) -> tuple[int, str]:
    with _state_lock:
        if _running:
            return 0, "Cannot edit queue while running"
        by_url = {r["url"]: r for r in _search_results if r.get("url")}
        actor = _search_actor
        current = _load_queue()
        meta = bunny.load_queue_meta()
        seen = set(current)
        added = 0
        for url in urls:
            item = by_url.get(url)
            if not item:
                continue
            if url not in seen:
                current.append(url)
                seen.add(url)
                added += 1
            meta[url] = {
                "actor": actor or item.get("actor") or "",
                "title": item.get("title") or "",
                "site": item.get("site") or "",
            }
        _save_queue(current)
        bunny.save_queue_meta(meta)
    return added, actor


def _publish_links(urls: list[str]) -> dict:
    with _state_lock:
        if _running:
            return {"ok": False, "error": "Cannot publish while downloads are running"}
        by_url = {r["url"]: r for r in _search_results if r.get("url")}
        actor = _search_actor
        items = []
        for url in urls:
            item = by_url.get(url)
            if item:
                items.append(item)
        if not items:
            return {"ok": False, "error": "No matching search results selected"}

    def log(msg: str) -> None:
        _append_log(msg)

    result = bunny.publish_outbound_links(items, actor_name=actor, log=log)
    return {"ok": True, **result, "actor": actor}


PAGE = r"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Bunny Queue</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <style>
    :root {
      --ink: #14201c;
      --muted: #4a5c55;
      --line: rgba(20, 32, 28, 0.14);
      --panel: rgba(255, 252, 247, 0.78);
      --accent: #0f5c4c;
      --accent-ink: #f2fbf7;
      --ok: #1f6b4a;
      --bad: #9b2c2c;
      --shadow: 0 18px 50px rgba(20, 32, 28, 0.12);
      --radius: 18px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--ink);
      font-family: "Instrument Sans", system-ui, sans-serif;
      background:
        radial-gradient(1200px 700px at 12% -10%, rgba(15, 92, 76, 0.16), transparent 55%),
        radial-gradient(900px 600px at 100% 0%, rgba(36, 72, 98, 0.12), transparent 50%),
        linear-gradient(160deg, #d5e3dc 0%, #e8f0ea 45%, #e6ebe8 100%);
      min-height: 100vh;
    }
    body::before {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      opacity: 0.35;
      background-image:
        linear-gradient(rgba(20, 32, 28, 0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(20, 32, 28, 0.03) 1px, transparent 1px);
      background-size: 48px 48px;
      mask-image: linear-gradient(to bottom, black, transparent 90%);
    }
    .wrap {
      position: relative;
      width: min(1180px, calc(100% - 2rem));
      margin: 0 auto;
      padding: 2.25rem 0 3rem;
      animation: rise 0.55s ease both;
    }
    @keyframes rise {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: none; }
    }
    header { display: grid; gap: 0.55rem; margin-bottom: 1.5rem; }
    .brand {
      font-size: clamp(2.4rem, 5vw, 3.4rem);
      font-weight: 700;
      letter-spacing: -0.045em;
      line-height: 0.95;
    }
    .lede {
      max-width: 42rem;
      color: var(--muted);
      font-size: 1.05rem;
      line-height: 1.45;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 0.55rem 1rem;
      font-family: "IBM Plex Mono", ui-monospace, monospace;
      font-size: 0.78rem;
      color: var(--muted);
    }
    .meta span { display: inline-flex; align-items: center; gap: 0.35rem; }
    .dot {
      width: 0.55rem; height: 0.55rem; border-radius: 50%; background: var(--muted);
    }
    .dot.on { background: var(--ok); box-shadow: 0 0 0 4px rgba(31, 107, 74, 0.15); }
    .dot.off { background: var(--bad); box-shadow: 0 0 0 4px rgba(155, 44, 44, 0.12); }
    .dot.busy {
      background: var(--accent);
      animation: pulse 1.2s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(0.85); opacity: 0.7; }
    }
    .layout {
      display: grid;
      grid-template-columns: 1.2fr 0.8fr;
      gap: 1.1rem;
    }
    @media (max-width: 960px) { .layout { grid-template-columns: 1fr; } }
    .panel {
      background: var(--panel);
      backdrop-filter: blur(10px);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: 1.15rem 1.2rem 1.25rem;
    }
    .panel h2 {
      margin: 0 0 0.75rem;
      font-size: 0.92rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.65rem;
      align-items: center;
    }
    input[type="text"], input[type="number"], textarea {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 0.85rem 1rem;
      font: inherit;
      color: var(--ink);
      background: rgba(255, 255, 255, 0.72);
      outline: none;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }
    input[type="text"]:focus, input[type="number"]:focus, textarea:focus {
      border-color: rgba(15, 92, 76, 0.5);
      box-shadow: 0 0 0 4px rgba(15, 92, 76, 0.12);
    }
    input[type="number"] { width: 5.5rem; }
    .actor-input { flex: 1; min-width: 220px; }
    textarea {
      min-height: 120px;
      resize: vertical;
      font-family: "IBM Plex Mono", ui-monospace, monospace;
      font-size: 0.86rem;
      line-height: 1.45;
    }
    .sources {
      display: flex;
      flex-wrap: wrap;
      gap: 0.55rem 1rem;
      margin: 0.85rem 0 0.2rem;
      color: var(--muted);
      font-size: 0.92rem;
    }
    .sources label {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      cursor: pointer;
    }
    .hint { margin: 0.55rem 0 0; color: var(--muted); font-size: 0.88rem; }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.55rem;
      margin-top: 1rem;
    }
    button {
      appearance: none;
      border: 0;
      border-radius: 999px;
      padding: 0.72rem 1.15rem;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.15s ease, opacity 0.15s ease;
    }
    button:hover:not(:disabled) { transform: translateY(-1px); }
    button:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }
    .btn-primary { background: var(--accent); color: var(--accent-ink); }
    .btn-secondary { background: rgba(20, 32, 28, 0.08); color: var(--ink); }
    .btn-danger { background: rgba(155, 44, 44, 0.12); color: var(--bad); }
    .stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.6rem;
      margin-bottom: 0.9rem;
    }
    .stat {
      padding: 0.75rem 0.8rem;
      border-radius: 14px;
      background: rgba(20, 32, 28, 0.04);
    }
    .stat strong {
      display: block;
      font-size: 1.45rem;
      letter-spacing: -0.03em;
      line-height: 1;
      margin-bottom: 0.25rem;
    }
    .stat span {
      font-size: 0.78rem;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .results, .queue-list, .log {
      max-height: 340px;
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.55);
    }
    .results, .queue-list {
      list-style: none;
      margin: 0;
      padding: 0.35rem;
    }
    .results li, .queue-list li {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.65rem;
      align-items: start;
      padding: 0.65rem 0.7rem;
      border-radius: 10px;
    }
    .queue-list li { grid-template-columns: 1fr auto; }
    .results li:hover, .queue-list li:hover { background: rgba(20, 32, 28, 0.04); }
    .result-body { min-width: 0; }
    .result-title {
      font-weight: 600;
      font-size: 0.95rem;
      line-height: 1.3;
      margin-bottom: 0.2rem;
    }
    .result-meta, .queue-meta {
      font-family: "IBM Plex Mono", ui-monospace, monospace;
      font-size: 0.72rem;
      color: var(--muted);
      word-break: break-all;
    }
    .site-tag {
      display: inline-block;
      margin-right: 0.35rem;
      padding: 0.1rem 0.45rem;
      border-radius: 999px;
      background: rgba(15, 92, 76, 0.1);
      color: var(--accent);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .empty { padding: 1.2rem; color: var(--muted); font-size: 0.92rem; }
    .log {
      padding: 0.85rem 0.95rem;
      font-family: "IBM Plex Mono", ui-monospace, monospace;
      font-size: 0.78rem;
      line-height: 1.5;
      white-space: pre-wrap;
      min-height: 160px;
      color: #24332e;
    }
    .queue-list button {
      padding: 0.25rem 0.55rem;
      font-size: 0.72rem;
    }
    details.paste {
      margin-top: 1rem;
      border-top: 1px solid var(--line);
      padding-top: 0.85rem;
    }
    details.paste summary {
      cursor: pointer;
      font-weight: 600;
      color: var(--muted);
      margin-bottom: 0.65rem;
    }
    .toast {
      position: fixed;
      right: 1rem;
      bottom: 1rem;
      background: var(--ink);
      color: #eef5f1;
      padding: 0.75rem 1rem;
      border-radius: 12px;
      font-size: 0.9rem;
      opacity: 0;
      transform: translateY(8px);
      transition: opacity 0.2s ease, transform 0.2s ease;
      pointer-events: none;
      z-index: 20;
    }
    .toast.show { opacity: 1; transform: none; }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <div class="brand">Bunny Queue</div>
      <p class="lede">Search by actor, then either publish fast outbound links (thumbnail + ad redirect) or download into Bunny for hosted playback.</p>
      <div class="meta">
        <span><i class="dot" id="keyDot"></i> <span id="keyLabel">API key</span></span>
        <span>Library <strong id="libraryId">—</strong></span>
        <span>Collection <strong id="collectionId">—</strong></span>
      </div>
    </header>

    <div class="layout">
      <section class="panel">
        <h2>Find by actor</h2>
        <div class="row">
          <input class="actor-input" id="actor" type="text" placeholder="Actor name" />
          <input id="limit" type="number" min="1" max="60" value="24" title="Results per site" />
          <button class="btn-primary" id="searchBtn" type="button">Search</button>
        </div>
        <div class="sources" id="sources"></div>
        <p class="hint">Searches selected sites. <strong>Publish as links</strong> = show on site with thumbnail + ad redirect (fast). <strong>Queue selected</strong> + Start = download into Bunny.</p>

        <div class="actions" style="margin-top: 0.85rem;">
          <button class="btn-secondary" id="selectAllBtn" type="button">Select all</button>
          <button class="btn-secondary" id="selectNoneBtn" type="button">Select none</button>
          <button class="btn-primary" id="publishLinksBtn" type="button">Publish as links</button>
          <button class="btn-secondary" id="queueSelectedBtn" type="button">Queue for Bunny download</button>
        </div>
        <ul class="results" id="results" style="margin-top: 0.85rem;">
          <li class="empty">Search results will show up here.</li>
        </ul>

        <details class="paste">
          <summary>Or paste URLs manually</summary>
          <textarea id="paste" placeholder="One URL per line"></textarea>
          <div class="actions">
            <button class="btn-secondary" id="addBtn" type="button">Add to queue</button>
            <button class="btn-secondary" id="replaceBtn" type="button">Replace queue</button>
          </div>
        </details>
      </section>

      <section class="panel">
        <h2>Queue</h2>
        <div class="stats">
          <div class="stat"><strong id="queuedCount">0</strong><span>Queued</span></div>
          <div class="stat"><strong id="outboundCount">0</strong><span>Links</span></div>
          <div class="stat"><strong id="doneCount">0</strong><span>Bunny done</span></div>
        </div>
        <ul class="queue-list" id="queueList"></ul>
        <div class="actions">
          <button class="btn-primary" id="startBtn" type="button">Start downloads</button>
          <button class="btn-danger" id="stopBtn" type="button" disabled>Stop after current</button>
          <button class="btn-secondary" id="clearQueueBtn" type="button">Clear queue</button>
        </div>
      </section>
    </div>

    <section class="panel" style="margin-top: 1.1rem;">
      <h2>Activity</h2>
      <div class="log" id="log">Waiting…</div>
    </section>
  </div>
  <div class="toast" id="toast"></div>

  <script>
    const $ = (id) => document.getElementById(id);
    let toastTimer = null;
    let sourcesReady = false;
    let prev = {
      resultsKey: "",
      queueKey: "",
      logKey: "",
      statusKey: "",
    };
    let refreshInFlight = false;

    function toast(msg) {
      const el = $("toast");
      el.textContent = msg;
      el.classList.add("show");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
    }

    async function api(path, options) {
      const res = await fetch(path, {
        headers: { "Content-Type": "application/json" },
        ...options,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      return data;
    }

    function escapeHtml(s) {
      return String(s || "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
      }[c]));
    }

    function ensureSources(sources) {
      if (sourcesReady || !sources) return;
      $("sources").innerHTML = sources.map((s) => `
        <label><input type="checkbox" name="source" value="${escapeHtml(s.id)}" checked /> ${escapeHtml(s.label)}</label>
      `).join("");
      sourcesReady = true;
    }

    function selectedSources() {
      return [...document.querySelectorAll('input[name="source"]:checked')].map((el) => el.value);
    }

    function resultsKey(state) {
      return JSON.stringify({
        searching: !!state.searching,
        error: state.searchError || "",
        items: (state.searchResults || []).map((r) => [r.url, r.title, r.site]),
      });
    }

    function queueKey(state) {
      return JSON.stringify(state.queue || []);
    }

    function renderResults(state) {
      const key = resultsKey(state);
      if (key === prev.resultsKey) return;
      prev.resultsKey = key;

      const list = $("results");
      const checked = new Set(
        [...document.querySelectorAll(".result-check:checked")].map((el) => el.dataset.url)
      );

      if (state.searching) {
        list.innerHTML = '<li class="empty">Searching…</li>';
        return;
      }
      if (state.searchError && !(state.searchResults || []).length) {
        list.innerHTML = `<li class="empty">${escapeHtml(state.searchError)}</li>`;
        return;
      }
      const items = (state.searchResults || []).filter((r) => r.url);
      if (!items.length) {
        list.innerHTML = '<li class="empty">Search results will show up here.</li>';
        return;
      }
      const keepChecks = checked.size > 0;
      list.innerHTML = items.map((r) => {
        const isChecked = keepChecks ? checked.has(r.url) : true;
        return `
        <li>
          <input type="checkbox" class="result-check" data-url="${escapeHtml(r.url)}" ${isChecked ? "checked" : ""} />
          <div class="result-body">
            <div class="result-title">${escapeHtml(r.title)}</div>
            <div class="result-meta"><span class="site-tag">${escapeHtml(r.site)}</span>${escapeHtml(r.url)}</div>
          </div>
        </li>`;
      }).join("");
    }

    function renderQueue(state) {
      const key = queueKey(state);
      if (key === prev.queueKey) return;
      prev.queueKey = key;

      const qlist = $("queueList");
      if (!state.queue.length) {
        qlist.innerHTML = '<li class="empty">Queue is empty.</li>';
        return;
      }
      qlist.innerHTML = state.queue.map((item, i) => `
        <li>
          <div>
            <div class="result-title">${escapeHtml(item.title || item.url)}</div>
            <div class="queue-meta">${item.actor ? `<span class="site-tag">${escapeHtml(item.actor)}</span>` : ""}${escapeHtml(item.url)}</div>
          </div>
          <button class="btn-secondary" data-remove="${i}" type="button">Remove</button>
        </li>
      `).join("");
      qlist.querySelectorAll("[data-remove]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          await api("/api/remove", {
            method: "POST",
            body: JSON.stringify({ index: Number(btn.getAttribute("data-remove")) }),
          });
          prev.queueKey = "";
          await refresh();
        });
      });
    }

    function renderLog(state) {
      const text = state.logs.length ? state.logs.join("\n") : "Waiting…";
      if (text === prev.logKey) return;
      const log = $("log");
      const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
      log.textContent = text;
      prev.logKey = text;
      if (nearBottom) log.scrollTop = log.scrollHeight;
    }

    function renderStatus(state) {
      const statusKey = [
        state.hasApiKey, state.running, state.searching,
        state.queue.length, state.doneCount, state.failedCount, state.outboundCount,
        state.libraryId, state.collectionId,
        (state.searchResults || []).length,
      ].join("|");
      if (statusKey === prev.statusKey) return;
      prev.statusKey = statusKey;

      ensureSources(state.sources);
      $("libraryId").textContent = state.libraryId || "—";
      $("collectionId").textContent = (state.collectionId || "—").slice(0, 8) + "…";
      $("queuedCount").textContent = state.queue.length;
      $("outboundCount").textContent = state.outboundCount || 0;
      $("doneCount").textContent = state.doneCount;

      const keyDot = $("keyDot");
      const keyLabel = $("keyLabel");
      if (state.running) {
        keyDot.className = "dot busy";
        keyLabel.textContent = "Downloading…";
      } else if (state.searching) {
        keyDot.className = "dot busy";
        keyLabel.textContent = "Searching…";
      } else {
        keyDot.className = "dot " + (state.hasApiKey ? "on" : "off");
        keyLabel.textContent = state.hasApiKey ? "API key ready" : "API key missing";
      }

      const hasResults = (state.searchResults || []).some((r) => r.url);
      $("searchBtn").disabled = state.running || state.searching;
      $("queueSelectedBtn").disabled = state.running || state.searching || !hasResults;
      $("publishLinksBtn").disabled = state.running || state.searching || !hasResults;
      $("startBtn").disabled = state.running || state.searching || !state.queue.length || !state.hasApiKey;
      $("stopBtn").disabled = !state.running;
      $("clearQueueBtn").disabled = state.running;
      $("addBtn").disabled = state.running;
      $("replaceBtn").disabled = state.running;
    }

    function render(state) {
      renderStatus(state);
      renderResults(state);
      renderQueue(state);
      renderLog(state);
    }

    async function refresh() {
      if (refreshInFlight) return;
      refreshInFlight = true;
      try {
        const state = await api("/api/status");
        render(state);
      } finally {
        refreshInFlight = false;
      }
    }

    $("searchBtn").addEventListener("click", async () => {
      try {
        prev.resultsKey = "";
        await api("/api/search", {
          method: "POST",
          body: JSON.stringify({
            actor: $("actor").value,
            sources: selectedSources(),
            limit: Number($("limit").value || 24),
          }),
        });
        toast("Searching…");
        await refresh();
      } catch (err) {
        toast(err.message || "Search failed");
      }
    });

    $("actor").addEventListener("keydown", (e) => {
      if (e.key === "Enter") $("searchBtn").click();
    });

    $("selectAllBtn").addEventListener("click", () => {
      document.querySelectorAll(".result-check").forEach((el) => { el.checked = true; });
    });
    $("selectNoneBtn").addEventListener("click", () => {
      document.querySelectorAll(".result-check").forEach((el) => { el.checked = false; });
    });

    $("queueSelectedBtn").addEventListener("click", async () => {
      const urls = [...document.querySelectorAll(".result-check:checked")].map((el) => el.dataset.url);
      if (!urls.length) {
        toast("Select at least one video");
        return;
      }
      const data = await api("/api/queue-selected", {
        method: "POST",
        body: JSON.stringify({ urls }),
      });
      prev.queueKey = "";
      toast(`Queued ${data.added} for Bunny download`);
      await refresh();
    });

    $("publishLinksBtn").addEventListener("click", async () => {
      const urls = [...document.querySelectorAll(".result-check:checked")].map((el) => el.dataset.url);
      if (!urls.length) {
        toast("Select at least one video");
        return;
      }
      $("publishLinksBtn").disabled = true;
      toast("Publishing links…");
      try {
        const data = await api("/api/publish-links", {
          method: "POST",
          body: JSON.stringify({ urls }),
        });
        prev.statusKey = "";
        toast(`Published ${data.added || 0} link(s) to site catalog`);
        await refresh();
      } catch (err) {
        toast(err.message || "Publish failed");
      }
    });

    async function addLinks(mode) {
      const text = $("paste").value;
      if (!text.trim()) {
        toast("Paste at least one URL");
        return;
      }
      const data = await api("/api/queue", {
        method: "POST",
        body: JSON.stringify({ text, mode, actor: $("actor").value }),
      });
      $("paste").value = "";
      prev.queueKey = "";
      toast(`Queued ${data.added} link${data.added === 1 ? "" : "s"}`);
      await refresh();
    }

    $("addBtn").addEventListener("click", () => addLinks("append"));
    $("replaceBtn").addEventListener("click", () => addLinks("replace"));
    $("clearQueueBtn").addEventListener("click", async () => {
      await api("/api/queue", { method: "POST", body: JSON.stringify({ text: "", mode: "replace" }) });
      prev.queueKey = "";
      toast("Queue cleared");
      await refresh();
    });
    $("startBtn").addEventListener("click", async () => {
      await api("/api/start", { method: "POST", body: "{}" });
      prev.logKey = "";
      toast("Started");
      await refresh();
    });
    $("stopBtn").addEventListener("click", async () => {
      await api("/api/stop", { method: "POST", body: "{}" });
      toast("Will stop after current item");
      await refresh();
    });

    refresh();
    setInterval(refresh, 1500);
  </script>
</body>
</html>
"""


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        if self.path.startswith("/api/"):
            return
        super().log_message(fmt, *args)

    def _send(
        self, code: int, payload: dict | str, content_type: str = "application/json"
    ) -> None:
        if isinstance(payload, dict):
            body = json.dumps(payload).encode("utf-8")
        else:
            body = payload.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            return {}

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path in {"/", "/index.html"}:
            self._send(200, PAGE, "text/html")
            return
        if path == "/api/status":
            self._send(200, _snapshot())
            return
        self._send(404, {"error": "Not found"})

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        data = self._read_json()

        if path == "/api/search":
            ok, message = _start_search(
                str(data.get("actor") or ""),
                list(data.get("sources") or []),
                int(data.get("limit") or 24),
            )
            self._send(
                200 if ok else 400,
                {"ok": ok, "message": message, **({"error": message} if not ok else {})},
            )
            return

        if path == "/api/queue-selected":
            urls = [u for u in (data.get("urls") or []) if isinstance(u, str)]
            added, actor = _queue_search_selection(urls)
            self._send(200, {"ok": True, "added": added, "actor": actor})
            return

        if path == "/api/publish-links":
            urls = [u for u in (data.get("urls") or []) if isinstance(u, str)]
            result = _publish_links(urls)
            code = 200 if result.get("ok") else 400
            self._send(code, result if result.get("ok") else {"error": result.get("error", "Failed"), **result})
            return

        if path == "/api/queue":
            with _state_lock:
                if _running:
                    self._send(409, {"error": "Cannot edit queue while running"})
                    return
                incoming = _parse_urls(str(data.get("text") or ""))
                mode = data.get("mode") or "append"
                actor = str(data.get("actor") or "").strip()
                current = _load_queue()
                meta = bunny.load_queue_meta()
                if mode == "replace":
                    merged = incoming
                    added = len(incoming)
                    meta = {}
                else:
                    seen = set(current)
                    added_urls = [u for u in incoming if u not in seen]
                    merged = current + added_urls
                    added = len(added_urls)
                if actor:
                    for url in incoming:
                        entry = dict(meta.get(url) or {})
                        entry["actor"] = actor
                        meta[url] = entry
                _save_queue(merged)
                bunny.save_queue_meta({u: meta[u] for u in merged if u in meta})
            self._send(200, {"ok": True, "added": added, "queue": merged})
            return

        if path == "/api/remove":
            with _state_lock:
                if _running:
                    self._send(409, {"error": "Cannot edit queue while running"})
                    return
                urls = _load_queue()
                try:
                    index = int(data.get("index"))
                except (TypeError, ValueError):
                    self._send(400, {"error": "Invalid index"})
                    return
                if 0 <= index < len(urls):
                    urls.pop(index)
                    _save_queue(urls)
            self._send(200, {"ok": True})
            return

        if path == "/api/start":
            ok, message = _start_worker()
            self._send(
                200 if ok else 400,
                {"ok": ok, "message": message, **({"error": message} if not ok else {})},
            )
            return

        if path == "/api/stop":
            _stop_event.set()
            _append_log("Stop requested — finishing current item, then pausing.")
            self._send(200, {"ok": True})
            return

        self._send(404, {"error": "Not found"})


def main() -> int:
    _ensure_queue_file()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    url = f"http://{HOST}:{PORT}"
    print(f"Bunny Queue UI → {url}")
    print("Press Ctrl+C to stop.\n")
    try:
        webbrowser.open(url)
    except Exception:  # noqa: BLE001
        pass
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
