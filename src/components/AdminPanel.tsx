"use client";

import { useCallback, useEffect, useState } from "react";

type SearchResult = {
  id?: string;
  title: string;
  url: string;
  site: string;
  poster?: string;
  actor?: string;
  error?: boolean;
};

type OutboundFilm = {
  id: string;
  title: string;
  sourceUrl: string;
  posterUrl?: string;
  actor?: string;
  site?: string;
  dateAdded?: string;
};

type SyncLastRun = {
  ok: boolean;
  added: number;
  skipped: number;
  pages: number;
  sites: string[];
  count: number;
  error?: string;
  log?: string[];
  finishedAt: string;
  trigger: string;
};

const SESSION_KEY = "admin_token";

const SEARCH_SOURCES = [
  { key: "xvideos", label: "XVideos" },
  { key: "xnxx", label: "XNXX" },
  { key: "pornhub", label: "Pornhub" },
  { key: "fpo", label: "MyFPO" },
  { key: "eporner", label: "Eporner" },
  { key: "playvids", label: "Playvids" },
] as const;

const CATALOG_SOURCES = [
  { key: "fpo", label: "MyFPO" },
  { key: "playvids", label: "Playvids" },
] as const;

const DEFAULT_MODELS_URL = "https://porndoe.com/pornstars";

async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ ok: boolean; status: number; data: T }> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem(SESSION_KEY) : null;
  const headers = new Headers(options.headers);
  headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);

  const res = await fetch(path, { ...options, headers, credentials: "include" });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}

export function AdminPanel() {
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const [logLines, setLogLines] = useState<string[]>(["Waiting…"]);
  const appendLog = useCallback((lines: string | string[]) => {
    const batch = Array.isArray(lines) ? lines : [lines];
    setLogLines((prev) => {
      const next = [...prev.filter((l) => l !== "Waiting…"), ...batch];
      return next.slice(-200);
    });
  }, []);

  // Catalog sync
  const [catalogSites, setCatalogSites] = useState<string[]>(["fpo", "playvids"]);
  const [importPages, setImportPages] = useState(5);
  const [syncRunning, setSyncRunning] = useState(false);
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [lastRun, setLastRun] = useState<SyncLastRun | null>(null);
  const [catalogCount, setCatalogCount] = useState(0);
  const [outboundKv, setOutboundKv] = useState(false);

  // Models
  const [modelsUrl, setModelsUrl] = useState(DEFAULT_MODELS_URL);
  const [modelsPages, setModelsPages] = useState(10);
  const [modelsHtml, setModelsHtml] = useState("");
  const [modelsCount, setModelsCount] = useState(0);
  const [modelsRunning, setModelsRunning] = useState(false);

  // Search
  const [actor, setActor] = useState("");
  const [searchLimit, setSearchLimit] = useState(24);
  const [searchSources, setSearchSources] = useState<string[]>(
    SEARCH_SOURCES.map((s) => s.key)
  );
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [publishing, setPublishing] = useState(false);

  // Paste links
  const [pasteText, setPasteText] = useState("");
  const [pastePublishing, setPastePublishing] = useState(false);

  // Recent outbound
  const [outbound, setOutbound] = useState<OutboundFilm[]>([]);

  const refreshSession = useCallback(async () => {
    const { ok, data } = await api<{ authenticated?: boolean }>(
      "/api/admin/session"
    );
    setAuthed(ok && !!data.authenticated);
    setChecking(false);
  }, []);

  const refreshSync = useCallback(async () => {
    const { ok, data } = await api<{
      enabled?: boolean;
      lastRun?: SyncLastRun;
      catalogCount?: number;
      kv?: boolean;
    }>("/api/admin/sync");
    if (!ok) return;
    setSyncEnabled(data.enabled !== false);
    setLastRun(data.lastRun ?? null);
    if (typeof data.catalogCount === "number") setCatalogCount(data.catalogCount);
    if (typeof data.kv === "boolean") setOutboundKv(data.kv);
  }, []);

  const refreshOutbound = useCallback(async () => {
    const { ok, data } = await api<{
      films?: OutboundFilm[];
      kv?: boolean;
    }>("/api/admin/outbound");
    if (!ok) return;
    const films = data.films ?? [];
    setOutbound(films.slice(0, 40));
    setCatalogCount(films.length);
    setOutboundKv(!!data.kv);
  }, []);

  const refreshModels = useCallback(async () => {
    const { ok, data } = await api<{ count?: number }>("/api/admin/models");
    if (!ok) return;
    setModelsCount(data.count ?? 0);
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    if (!authed) return;
    void refreshSync();
    void refreshOutbound();
    void refreshModels();
  }, [authed, refreshSync, refreshOutbound, refreshModels]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");
    const { ok, data } = await api<{ error?: string; token?: string }>(
      "/api/admin/login",
      { method: "POST", body: JSON.stringify({ password }) }
    );
    if (!ok) {
      setLoginError(data.error || "Login failed");
      return;
    }
    if (data.token) localStorage.setItem(SESSION_KEY, data.token);
    setPassword("");
    setAuthed(true);
  }

  async function handleLogout() {
    await api("/api/admin/logout", { method: "POST" });
    localStorage.removeItem(SESSION_KEY);
    setAuthed(false);
  }

  function toggleCatalogSite(key: string) {
    setCatalogSites((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  function toggleSearchSource(key: string) {
    setSearchSources((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  async function runSync(untilCaughtUp: boolean) {
    if (catalogSites.length === 0) {
      appendLog("Select at least one catalog site");
      return;
    }
    setSyncRunning(true);
    appendLog(
      untilCaughtUp
        ? "Starting Sync new…"
        : `Starting Import all (up to ${importPages} pages)…`
    );
    const { ok, data } = await api<{
      ok?: boolean;
      added?: number;
      skipped?: number;
      pages?: number;
      count?: number;
      error?: string;
      log?: string[];
      finishedAt?: string;
      trigger?: string;
      sites?: string[];
    }>("/api/admin/sync", {
      method: "POST",
      body: JSON.stringify({
        sites: catalogSites,
        maxPages: Math.min(20, Math.max(1, importPages)),
        untilCaughtUp,
      }),
    });
    setSyncRunning(false);
    if (data.log?.length) appendLog(data.log);
    if (!ok || data.ok === false) {
      appendLog(data.error || "Sync failed");
      return;
    }
    setLastRun({
      ok: true,
      added: data.added ?? 0,
      skipped: data.skipped ?? 0,
      pages: data.pages ?? 0,
      sites: data.sites ?? catalogSites,
      count: data.count ?? catalogCount,
      log: data.log,
      finishedAt: data.finishedAt || new Date().toISOString(),
      trigger: data.trigger || "admin",
    });
    setCatalogCount(data.count ?? catalogCount);
    void refreshOutbound();
  }

  async function stopSync() {
    await api("/api/admin/sync", {
      method: "POST",
      body: JSON.stringify({ action: "stop" }),
    });
    appendLog("Stop requested for catalog import");
  }

  async function toggleAutoSync() {
    const next = !syncEnabled;
    setSyncEnabled(next);
    const { ok, data } = await api<{ enabled?: boolean; error?: string }>(
      "/api/admin/sync",
      {
        method: "POST",
        body: JSON.stringify({ action: "set-enabled", enabled: next }),
      }
    );
    if (!ok) {
      setSyncEnabled(!next);
      appendLog(data.error || "Could not update auto-scrape");
      return;
    }
    appendLog(`Auto-scrape ${data.enabled !== false ? "On" : "Off"}`);
  }

  async function importModels() {
    setModelsRunning(true);
    appendLog(`Importing models from ${modelsUrl}…`);
    const { ok, data } = await api<{
      added?: number;
      skipped?: number;
      updated?: number;
      scraped?: number;
      total?: number;
      error?: string;
      log?: string[];
      synced?: boolean;
    }>("/api/admin/models", {
      method: "POST",
      body: JSON.stringify({
        url: modelsUrl,
        maxPages: Math.min(20, Math.max(1, modelsPages)),
      }),
    });
    setModelsRunning(false);
    if (data.log?.length) appendLog(data.log);
    if (!ok) {
      appendLog(data.error || "Model import failed");
      return;
    }
            appendLog(
      `Models: +${data.added ?? 0} new, ${data.updated ?? 0} photos updated, ${data.skipped ?? 0} unchanged, total ${data.total ?? 0}`
    );
    setModelsCount(data.total ?? modelsCount);
  }

  async function importModelsHtml() {
    setModelsRunning(true);
    appendLog("Importing models from pasted HTML…");
    const { ok, data } = await api<{
      added?: number;
      skipped?: number;
      updated?: number;
      total?: number;
      error?: string;
      log?: string[];
    }>("/api/admin/models", {
      method: "POST",
      body: JSON.stringify({
        action: "import-html",
        html: modelsHtml,
        url: modelsUrl,
      }),
    });
    setModelsRunning(false);
    if (data.log?.length) appendLog(data.log);
    if (!ok) {
      appendLog(data.error || "HTML import failed");
      return;
    }
    appendLog(
      `Models from HTML: +${data.added ?? 0} new, ${data.updated ?? 0} photos updated, ${data.skipped ?? 0} unchanged, total ${data.total ?? 0}`
    );
    setModelsCount(data.total ?? modelsCount);
    setModelsHtml("");
  }

  async function stopModels() {
    await api("/api/admin/models/stop", { method: "POST" });
    appendLog("Stop requested for model import");
  }

  async function clearAllModels() {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Remove ALL models from the site?")
    ) {
      return;
    }
    appendLog("Clearing all models…");
    const { ok, data } = await api<{
      total?: number;
      error?: string;
      log?: string[];
      synced?: boolean;
    }>("/api/admin/models", {
      method: "POST",
      body: JSON.stringify({ action: "clear" }),
    });
    if (data.log?.length) appendLog(data.log);
    if (!ok) {
      appendLog(data.error || "Clear models failed");
      return;
    }
    setModelsCount(0);
    appendLog(
      data.synced === false
        ? "Models cleared locally but KV may be missing"
        : "All models removed"
    );
  }

  async function runSearch() {
    const name = actor.trim();
    if (!name) {
      appendLog("Enter an actor name");
      return;
    }
    if (searchSources.length === 0) {
      appendLog("Select at least one search source");
      return;
    }
    setSearching(true);
    setResults([]);
    setSelected(new Set());
    appendLog(`Searching for “${name}”…`);
    const { ok, data } = await api<{
      results?: SearchResult[];
      log?: string[];
      modelsCount?: number;
      error?: string;
      count?: number;
    }>("/api/admin/search", {
      method: "POST",
      body: JSON.stringify({
        actor: name,
        sources: searchSources,
        limit: searchLimit,
      }),
    });
    setSearching(false);
    if (data.log?.length) appendLog(data.log);
    if (!ok) {
      appendLog(data.error || "Search failed");
      return;
    }
    const list = data.results ?? [];
    setResults(list);
    const selectable = list.filter((r) => r.url && !r.error).map((r) => r.url);
    setSelected(new Set(selectable));
    if (typeof data.modelsCount === "number") setModelsCount(data.modelsCount);
    appendLog(`Found ${data.count ?? selectable.length} video link(s)`);
  }

  function selectAllResults() {
    setSelected(
      new Set(results.filter((r) => r.url && !r.error).map((r) => r.url))
    );
  }

  function selectNoneResults() {
    setSelected(new Set());
  }

  async function publishSelected() {
    const items = results.filter(
      (r) => r.url && !r.error && selected.has(r.url)
    );
    if (items.length === 0) {
      appendLog("Select at least one search result");
      return;
    }
    setPublishing(true);
    appendLog(`Publishing ${items.length} link(s)…`);
    const films = items.map((item) => ({
      sourceUrl: item.url,
      title: item.title,
      posterUrl: item.poster || undefined,
      actor: item.actor || actor.trim() || undefined,
      site: item.site,
    }));
    const { ok, data } = await api<{
      count?: number;
      error?: string;
      message?: string;
      persisted?: boolean;
    }>("/api/admin/outbound", {
      method: "POST",
      body: JSON.stringify({ films }),
    });
    setPublishing(false);
    if (!ok) {
      appendLog(data.error || data.message || "Publish failed");
      return;
    }
    appendLog(
      `Published. Catalog size: ${data.count ?? "?"}${
        data.persisted === false ? " (KV missing)" : ""
      }`
    );
    setCatalogCount(data.count ?? catalogCount);
    void refreshOutbound();
  }

  async function publishPasted() {
    const lines = pasteText
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      appendLog("Paste at least one URL");
      return;
    }
    setPastePublishing(true);
    const films = lines.map((line) => {
      const parts = line.split(/\s+\|\s+/);
      return {
        sourceUrl: (parts[0] || "").trim(),
        title: (parts[1] || parts[0] || "").trim(),
        actor: actor.trim() || undefined,
      };
    });
    appendLog(`Publishing ${films.length} pasted link(s)…`);
    const { ok, data } = await api<{
      count?: number;
      error?: string;
      message?: string;
    }>("/api/admin/outbound", {
      method: "POST",
      body: JSON.stringify({ films }),
    });
    setPastePublishing(false);
    if (!ok) {
      appendLog(data.error || data.message || "Publish failed");
      return;
    }
    appendLog(`Published pasted links. Catalog size: ${data.count ?? "?"}`);
    setPasteText("");
    setCatalogCount(data.count ?? catalogCount);
    void refreshOutbound();
  }

  async function handleDeleteOutbound(id: string) {
    const { ok } = await api(`/api/admin/outbound/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (ok) {
      appendLog(`Removed ${id}`);
      void refreshOutbound();
    }
  }

  if (checking) {
    return (
      <p className="text-sm text-cinema-muted">Checking admin session…</p>
    );
  }

  if (!authed) {
    return (
      <form
        onSubmit={handleLogin}
        className="mx-auto max-w-md space-y-4 rounded-lg border border-cinema-border/50 bg-cinema-card p-6"
      >
        <h2 className="font-display text-2xl text-cinema-text">Admin login</h2>
        <p className="text-sm text-cinema-muted">
          Password-protected tools for outbound video links and model imports.
        </p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-md border border-cinema-border bg-cinema-dark px-3 py-2 text-cinema-text outline-none focus:border-cinema-accent"
          autoComplete="current-password"
        />
        {loginError ? (
          <p className="text-sm text-red-400">{loginError}</p>
        ) : null}
        <button
          type="submit"
          className="w-full rounded-md bg-cinema-accent px-4 py-2 font-medium text-cinema-black transition hover:bg-cinema-accent-hover"
        >
          Enter admin
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl text-cinema-text">
            Links &amp; models
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-cinema-muted">
            Search by actor or sync newest listings, then publish outbound
            links. Import model names and pictures for the Models page. Bunny
            downloads stay in the local Python tool.
          </p>
          <p className="mt-2 font-mono text-xs text-cinema-muted">
            Links {catalogCount.toLocaleString()} · Models{" "}
            {modelsCount.toLocaleString()} · KV {outboundKv ? "on" : "missing"}
            {lastRun
              ? ` · Last sync ${new Date(lastRun.finishedAt).toLocaleString()} (+${lastRun.added})`
              : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="shrink-0 rounded-md border border-cinema-border px-3 py-1.5 text-sm text-cinema-muted hover:border-cinema-accent hover:text-cinema-accent"
        >
          Log out
        </button>
      </div>

      {/* Catalog import */}
      <section className="space-y-3 rounded-lg border border-cinema-border/50 bg-cinema-card p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-cinema-muted">
          Import from FPO / Playvids
        </h3>
        <p className="text-sm text-cinema-muted">
          <strong className="text-cinema-text">Sync new</strong> pulls newest
          pages and stops when links are already on the site.{" "}
          <strong className="text-cinema-text">Import all</strong> crawls up to
          max pages (capped at 20 per run on Cloudflare). Auto-scrape runs every
          6 hours when On.
        </p>
        <div className="flex flex-wrap gap-4 text-sm text-cinema-muted">
          {CATALOG_SOURCES.map((s) => (
            <label key={s.key} className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={catalogSites.includes(s.key)}
                onChange={() => toggleCatalogSite(s.key)}
              />
              {s.label}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-cinema-muted">Max pages</label>
          <input
            type="number"
            min={1}
            max={20}
            value={importPages}
            onChange={(e) => setImportPages(Number(e.target.value) || 5)}
            className="w-20 rounded-md border border-cinema-border bg-cinema-dark px-2 py-1.5 text-cinema-text"
          />
          <button
            type="button"
            disabled={syncRunning || !outboundKv}
            onClick={() => void runSync(true)}
            className="rounded-full bg-cinema-accent px-4 py-2 text-sm font-semibold text-cinema-black disabled:opacity-50"
          >
            Sync new
          </button>
          <button
            type="button"
            disabled={syncRunning || !outboundKv}
            onClick={() => void runSync(false)}
            className="rounded-full border border-cinema-border px-4 py-2 text-sm font-semibold text-cinema-text disabled:opacity-50"
          >
            Import all
          </button>
          <button
            type="button"
            disabled={!syncRunning}
            onClick={() => void stopSync()}
            className="rounded-full border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-400 disabled:opacity-50"
          >
            Stop import
          </button>
          <button
            type="button"
            disabled={!outboundKv}
            onClick={() => void toggleAutoSync()}
            className="rounded-full border border-cinema-border px-4 py-2 text-sm text-cinema-text disabled:opacity-50"
          >
            Auto-scrape: {syncEnabled ? "On" : "Off"}
          </button>
        </div>
      </section>

      {/* Models import */}
      <section className="space-y-3 rounded-lg border border-cinema-border/50 bg-cinema-card p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-cinema-muted">
          Import models
        </h3>
        <p className="text-sm text-cinema-muted">
          Default source is{" "}
          <a
            href="https://porndoe.com/pornstars"
            target="_blank"
            rel="noreferrer"
            className="text-cinema-accent hover:underline"
          >
            porndoe.com/pornstars
          </a>
          . Imports each name + profile photo. Re-importing{" "}
          <strong className="text-cinema-text">overwrites photos</strong> on
          matching models. If the site blocks the server (geo/age-gate), paste
          page HTML below.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="url"
            value={modelsUrl}
            onChange={(e) => setModelsUrl(e.target.value)}
            className="min-w-[220px] flex-1 rounded-md border border-cinema-border bg-cinema-dark px-3 py-2 text-sm text-cinema-text"
          />
          <label className="text-sm text-cinema-muted">Max pages</label>
          <input
            type="number"
            min={1}
            max={20}
            value={modelsPages}
            onChange={(e) => setModelsPages(Number(e.target.value) || 10)}
            className="w-20 rounded-md border border-cinema-border bg-cinema-dark px-2 py-1.5 text-cinema-text"
          />
          <button
            type="button"
            disabled={modelsRunning || !outboundKv}
            onClick={() => void importModels()}
            className="rounded-full bg-cinema-accent px-4 py-2 text-sm font-semibold text-cinema-black disabled:opacity-50"
          >
            Import models
          </button>
          <button
            type="button"
            disabled={!modelsRunning}
            onClick={() => void stopModels()}
            className="rounded-full border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-400 disabled:opacity-50"
          >
            Stop
          </button>
          <button
            type="button"
            disabled={modelsRunning || modelsCount === 0}
            onClick={() => void clearAllModels()}
            className="rounded-full border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-400 disabled:opacity-50"
          >
            Clear all models
          </button>
        </div>
        <details className="border-t border-cinema-border/40 pt-3">
          <summary className="cursor-pointer text-sm font-semibold text-cinema-muted">
            Paste page HTML (recommended if Cloudflare blocks)
          </summary>
          <p className="mt-2 text-sm text-cinema-muted">
            View Page Source on the models list → select all → paste. Photos from
            the paste overwrite matching models already on the site.
          </p>
          <textarea
            value={modelsHtml}
            onChange={(e) => setModelsHtml(e.target.value)}
            rows={5}
            placeholder="Paste Indexxx models page HTML here"
            className="mt-2 w-full rounded-md border border-cinema-border bg-cinema-dark px-3 py-2 font-mono text-xs text-cinema-text"
          />
          <button
            type="button"
            disabled={modelsRunning || !modelsHtml.trim()}
            onClick={() => void importModelsHtml()}
            className="mt-2 rounded-full border border-cinema-border px-4 py-2 text-sm font-semibold text-cinema-text disabled:opacity-50"
          >
            Import pasted HTML
          </button>
        </details>
        <p className="text-sm text-cinema-muted">
          Models on site:{" "}
          <strong className="text-cinema-text">{modelsCount}</strong>
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        {/* Find by actor */}
        <section className="space-y-3 rounded-lg border border-cinema-border/50 bg-cinema-card p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-cinema-muted">
            Find by actor
          </h3>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={actor}
              onChange={(e) => setActor(e.target.value)}
              placeholder="Actor name"
              className="min-w-[180px] flex-1 rounded-md border border-cinema-border bg-cinema-dark px-3 py-2 text-cinema-text"
            />
            <input
              type="number"
              min={1}
              max={60}
              value={searchLimit}
              onChange={(e) => setSearchLimit(Number(e.target.value) || 24)}
              title="Results per site"
              className="w-20 rounded-md border border-cinema-border bg-cinema-dark px-2 py-2 text-cinema-text"
            />
            <button
              type="button"
              disabled={searching}
              onClick={() => void runSearch()}
              className="rounded-full bg-cinema-accent px-4 py-2 text-sm font-semibold text-cinema-black disabled:opacity-50"
            >
              {searching ? "Searching…" : "Search"}
            </button>
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-cinema-muted">
            {SEARCH_SOURCES.map((s) => (
              <label key={s.key} className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={searchSources.includes(s.key)}
                  onChange={() => toggleSearchSource(s.key)}
                />
                {s.label}
              </label>
            ))}
          </div>
          <p className="text-sm text-cinema-muted">
            Actor is auto-added to Models when videos are found. Publish as
            links = thumbnail + ad redirect (no download).
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={selectAllResults}
              className="rounded-full border border-cinema-border px-3 py-1.5 text-sm text-cinema-text"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={selectNoneResults}
              className="rounded-full border border-cinema-border px-3 py-1.5 text-sm text-cinema-text"
            >
              Select none
            </button>
            <button
              type="button"
              disabled={publishing || selected.size === 0}
              onClick={() => void publishSelected()}
              className="rounded-full bg-cinema-accent px-4 py-1.5 text-sm font-semibold text-cinema-black disabled:opacity-50"
            >
              {publishing ? "Publishing…" : "Publish as links"}
            </button>
          </div>
          <ul className="max-h-80 space-y-1 overflow-auto rounded-md border border-cinema-border/40 bg-cinema-dark/30 p-2">
            {results.length === 0 ? (
              <li className="p-3 text-sm text-cinema-muted">
                Search results will show up here.
              </li>
            ) : (
              results.map((r, i) =>
                r.error ? (
                  <li
                    key={`err-${i}`}
                    className="px-2 py-2 text-sm text-red-400"
                  >
                    {r.title}
                  </li>
                ) : (
                  <li
                    key={r.url}
                    className="flex gap-2 rounded-md px-2 py-2 hover:bg-cinema-border/20"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(r.url)}
                      onChange={() => {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(r.url)) next.delete(r.url);
                          else next.add(r.url);
                          return next;
                        });
                      }}
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-cinema-text">
                        {r.title}
                      </p>
                      <p className="truncate font-mono text-[11px] text-cinema-muted">
                        <span className="mr-1 rounded-full bg-cinema-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-cinema-accent">
                          {r.site}
                        </span>
                        {r.url}
                      </p>
                    </div>
                  </li>
                )
              )
            )}
          </ul>

          <details className="border-t border-cinema-border/40 pt-3">
            <summary className="cursor-pointer text-sm font-semibold text-cinema-muted">
              Or paste URLs manually
            </summary>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={4}
              placeholder={"One URL per line\noptional: url | title"}
              className="mt-2 w-full rounded-md border border-cinema-border bg-cinema-dark px-3 py-2 font-mono text-xs text-cinema-text"
            />
            <button
              type="button"
              disabled={pastePublishing}
              onClick={() => void publishPasted()}
              className="mt-2 rounded-full bg-cinema-accent px-4 py-2 text-sm font-semibold text-cinema-black disabled:opacity-50"
            >
              {pastePublishing ? "Publishing…" : "Publish as links"}
            </button>
          </details>
        </section>

        {/* Status / recent links */}
        <section className="space-y-3 rounded-lg border border-cinema-border/50 bg-cinema-card p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-cinema-muted">
            Catalog status
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md bg-cinema-dark/40 p-3">
              <strong className="block text-2xl text-cinema-text">
                {catalogCount.toLocaleString()}
              </strong>
              <span className="text-xs uppercase tracking-wide text-cinema-muted">
                Links
              </span>
            </div>
            <div className="rounded-md bg-cinema-dark/40 p-3">
              <strong className="block text-2xl text-cinema-text">
                {modelsCount.toLocaleString()}
              </strong>
              <span className="text-xs uppercase tracking-wide text-cinema-muted">
                Models
              </span>
            </div>
          </div>
          <ul className="max-h-80 space-y-2 overflow-auto">
            {outbound.length === 0 ? (
              <li className="text-sm text-cinema-muted">No recent links.</li>
            ) : (
              outbound.map((film) => (
                <li
                  key={film.id}
                  className="flex items-start justify-between gap-2 rounded-md border border-cinema-border/40 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-cinema-text">
                      {film.title}
                    </p>
                    <p className="truncate font-mono text-[11px] text-cinema-muted">
                      {film.sourceUrl}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDeleteOutbound(film.id)}
                    className="shrink-0 text-xs text-red-400 hover:underline"
                  >
                    Remove
                  </button>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      <section className="rounded-lg border border-cinema-border/50 bg-cinema-card p-5">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-cinema-muted">
          Activity
        </h3>
        <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-cinema-border/40 bg-cinema-dark/40 p-3 font-mono text-xs leading-relaxed text-cinema-muted">
          {logLines.join("\n")}
        </pre>
      </section>
    </div>
  );
}
