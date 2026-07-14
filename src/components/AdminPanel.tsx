"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type JobStatus = "queued" | "fetching" | "processing" | "finished" | "failed";

type LocalJob = {
  id: string;
  url: string;
  title: string;
  bunnyVideoId?: string;
  status: JobStatus;
  progress: number;
  message?: string;
  createdAt: string;
};

type LibraryItem = {
  bunnyVideoId: string;
  title: string;
  status: JobStatus;
  progress: number;
  length?: number;
  dateUploaded?: string;
  embedUrl: string;
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

function statusLabel(status: JobStatus): string {
  switch (status) {
    case "finished":
      return "Finished";
    case "failed":
      return "Failed";
    case "processing":
      return "Processing";
    case "fetching":
      return "Fetching";
    default:
      return "Queued";
  }
}

function ProgressBar({
  progress,
  status,
}: {
  progress: number;
  status: JobStatus;
}) {
  const color =
    status === "failed"
      ? "bg-red-500"
      : status === "finished"
        ? "bg-emerald-500"
        : "bg-cinema-accent";

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-cinema-border/60">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
      />
    </div>
  );
}

export function AdminPanel() {
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [urlText, setUrlText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [queueError, setQueueError] = useState("");
  const [jobs, setJobs] = useState<LocalJob[]>([]);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [historyError, setHistoryError] = useState("");

  const [linkText, setLinkText] = useState("");
  const [linkSubmitting, setLinkSubmitting] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [linkMessage, setLinkMessage] = useState("");
  const [outbound, setOutbound] = useState<OutboundFilm[]>([]);
  const [outboundKv, setOutboundKv] = useState(false);

  const [syncEnabled, setSyncEnabled] = useState(true);
  const [syncRunning, setSyncRunning] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [lastRun, setLastRun] = useState<SyncLastRun | null>(null);
  const [catalogCount, setCatalogCount] = useState(0);

  const refreshSession = useCallback(async () => {
    const { ok, data } = await api<{ authenticated?: boolean }>(
      "/api/admin/session"
    );
    setAuthed(ok && !!data.authenticated);
    setChecking(false);
  }, []);

  const refreshHistory = useCallback(async () => {
    const { ok, data } = await api<{
      library?: LibraryItem[];
      error?: string;
    }>("/api/admin/history");
    if (!ok) {
      setHistoryError(data.error || "Could not load Bunny library history");
      return;
    }
    setHistoryError("");
    setLibrary(data.library ?? []);
  }, []);

  const refreshOutbound = useCallback(async () => {
    const { ok, data } = await api<{
      films?: OutboundFilm[];
      kv?: boolean;
      error?: string;
    }>("/api/admin/outbound");
    if (!ok) return;
    setOutbound((data.films ?? []).slice(0, 40));
    setOutboundKv(!!data.kv);
    setCatalogCount(data.films?.length ?? 0);
  }, []);

  const refreshSync = useCallback(async () => {
    const { ok, data } = await api<{
      enabled?: boolean;
      lastRun?: SyncLastRun;
      catalogCount?: number;
      kv?: boolean;
      error?: string;
    }>("/api/admin/sync");
    if (!ok) {
      setSyncError(data.error || "Could not load sync status");
      return;
    }
    setSyncError("");
    setSyncEnabled(data.enabled !== false);
    setLastRun(data.lastRun ?? null);
    if (typeof data.catalogCount === "number") {
      setCatalogCount(data.catalogCount);
    }
    if (typeof data.kv === "boolean") setOutboundKv(data.kv);
  }, []);

  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  const pollJobs = useCallback(async () => {
    const active = jobsRef.current.filter(
      (j) => j.bunnyVideoId && j.status !== "finished" && j.status !== "failed"
    );
    if (active.length === 0) return;

    const updates = await Promise.all(
      active.map(async (job) => {
        const { ok, data } = await api<{
          status?: JobStatus;
          progress?: number;
          title?: string;
          message?: string;
        }>(`/api/admin/status/${job.bunnyVideoId}`);
        if (!ok) return job;
        return {
          ...job,
          status: data.status ?? job.status,
          progress: data.progress ?? job.progress,
          title: data.title || job.title,
          message: data.message ?? job.message,
        };
      })
    );

    setJobs((prev) =>
      prev.map((job) => updates.find((u) => u.id === job.id) ?? job)
    );
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    if (!authed) return;
    void refreshHistory();
    void refreshOutbound();
    void refreshSync();
    const id = window.setInterval(() => {
      void refreshHistory();
      void pollJobs();
    }, 4000);
    return () => window.clearInterval(id);
  }, [authed, refreshHistory, refreshOutbound, refreshSync, pollJobs]);

  const overallProgress = useMemo(() => {
    const active = jobs.filter((j) => j.status !== "failed");
    if (active.length === 0) return 0;
    return Math.round(
      active.reduce((sum, j) => sum + j.progress, 0) / active.length
    );
  }, [jobs]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");
    const { ok, data } = await api<{ error?: string; token?: string }>(
      "/api/admin/login",
      {
        method: "POST",
        body: JSON.stringify({ password }),
      }
    );
    if (!ok) {
      setLoginError(data.error || "Login failed. Is the Worker API running?");
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
    setJobs([]);
  }

  async function handleQueue(e: React.FormEvent) {
    e.preventDefault();
    setQueueError("");
    const urls = urlText
      .split(/\n|,/)
      .map((u) => u.trim())
      .filter(Boolean);
    if (urls.length === 0) {
      setQueueError("Paste at least one direct video URL");
      return;
    }

    setSubmitting(true);
    const { ok, data } = await api<{
      jobs?: LocalJob[];
      error?: string;
    }>("/api/admin/queue", {
      method: "POST",
      body: JSON.stringify({ urls }),
    });
    setSubmitting(false);

    if (!ok) {
      setQueueError(data.error || "Queue failed");
      return;
    }

    setJobs((prev) => [...(data.jobs ?? []), ...prev]);
    setUrlText("");
    void refreshHistory();
  }

  async function handlePublishLinks(e: React.FormEvent) {
    e.preventDefault();
    setLinkError("");
    setLinkMessage("");
    const lines = linkText
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      setLinkError("Paste at least one page URL");
      return;
    }

    const films = lines.map((line) => {
      const parts = line.split(/\s+\|\s+/);
      const sourceUrl = (parts[0] || "").trim();
      const title = (parts[1] || sourceUrl).trim();
      return { sourceUrl, title };
    });

    setLinkSubmitting(true);
    const before = catalogCount;
    const { ok, data } = await api<{
      count?: number;
      added?: number;
      persisted?: boolean;
      error?: string;
      message?: string;
    }>("/api/admin/outbound", {
      method: "POST",
      body: JSON.stringify({ films }),
    });
    setLinkSubmitting(false);

    if (!ok) {
      setLinkError(data.error || data.message || "Publish failed");
      return;
    }

    const nextCount = data.count ?? catalogCount;
    const skippedAll = before === nextCount && films.length > 0;
    setLinkMessage(
      skippedAll
        ? `No new links — ${films.length} duplicate(s) skipped. Catalog size: ${nextCount}`
        : `Published. Catalog size: ${nextCount}` +
            (data.persisted === false ? " (KV not bound — not live yet)" : "")
    );
    setLinkText("");
    setCatalogCount(nextCount);
    void refreshOutbound();
    void refreshSync();
  }

  async function handleDeleteOutbound(id: string) {
    const { ok } = await api(`/api/admin/outbound/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (ok) {
      void refreshOutbound();
      void refreshSync();
    }
  }

  async function handleSyncNow() {
    setSyncError("");
    setSyncRunning(true);
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
        sites: ["fpo", "playvids"],
        maxPages: 5,
        untilCaughtUp: true,
      }),
    });
    setSyncRunning(false);

    if (!ok || data.ok === false) {
      setSyncError(data.error || "Sync failed");
      if (data.finishedAt) {
        setLastRun({
          ok: false,
          added: data.added ?? 0,
          skipped: data.skipped ?? 0,
          pages: data.pages ?? 0,
          sites: data.sites ?? [],
          count: data.count ?? catalogCount,
          error: data.error,
          log: data.log,
          finishedAt: data.finishedAt,
          trigger: data.trigger || "admin",
        });
      }
      return;
    }

    setLastRun({
      ok: true,
      added: data.added ?? 0,
      skipped: data.skipped ?? 0,
      pages: data.pages ?? 0,
      sites: data.sites ?? ["fpo", "playvids"],
      count: data.count ?? catalogCount,
      log: data.log,
      finishedAt: data.finishedAt || new Date().toISOString(),
      trigger: data.trigger || "admin",
    });
    setCatalogCount(data.count ?? catalogCount);
    void refreshOutbound();
  }

  async function handleToggleAutoSync() {
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
      setSyncError(data.error || "Could not update auto-sync");
      return;
    }
    setSyncEnabled(data.enabled !== false);
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
          Enter the admin password to manage outbound links and Bunny downloads.
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
    <div className="space-y-10">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl text-cinema-text">Admin</h2>
          <p className="mt-1 text-sm text-cinema-muted">
            Publish outbound links and auto-scrape newest listings on Cloudflare
            (runs even when your computer is off).
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

      <section className="space-y-4 rounded-lg border border-cinema-border/50 bg-cinema-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-xl text-cinema-text">
              Auto-scrape (cloud)
            </h3>
            <p className="mt-1 text-sm text-cinema-muted">
              Every 6 hours Cloudflare pulls newest FPO / Playvids pages, skips
              duplicates, and publishes as outbound links. No yt-dlp / Bunny
              download — link catalog only.
            </p>
          </div>
          <span className="text-sm text-cinema-muted">
            Catalog: {catalogCount.toLocaleString()} · KV{" "}
            {outboundKv ? "on" : "missing"}
          </span>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void handleSyncNow()}
            disabled={syncRunning || !outboundKv}
            className="rounded-md bg-cinema-accent px-4 py-2 font-medium text-cinema-black transition hover:bg-cinema-accent-hover disabled:opacity-60"
          >
            {syncRunning ? "Syncing…" : "Sync new now"}
          </button>
          <button
            type="button"
            onClick={() => void handleToggleAutoSync()}
            disabled={!outboundKv}
            className="rounded-md border border-cinema-border px-4 py-2 text-sm text-cinema-text hover:border-cinema-accent disabled:opacity-60"
          >
            Auto-scrape: {syncEnabled ? "On" : "Off"}
          </button>
        </div>

        {syncError ? <p className="text-sm text-red-400">{syncError}</p> : null}

        {lastRun ? (
          <div className="space-y-2 rounded-md border border-cinema-border/40 bg-cinema-dark/40 p-3 text-sm text-cinema-muted">
            <p>
              Last run ({lastRun.trigger}):{" "}
              <span
                className={lastRun.ok ? "text-emerald-400" : "text-red-400"}
              >
                {lastRun.ok ? "ok" : "failed"}
              </span>
              {" · "}+{lastRun.added} new · {lastRun.skipped} skipped ·{" "}
              {lastRun.pages} pages ·{" "}
              {new Date(lastRun.finishedAt).toLocaleString()}
            </p>
            {lastRun.error ? (
              <p className="text-red-400">{lastRun.error}</p>
            ) : null}
            {lastRun.log?.length ? (
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs text-cinema-muted">
                {lastRun.log.slice(-12).join("\n")}
              </pre>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-cinema-muted">
            No sync has run yet. Click “Sync new now” or wait for the 6-hour cron
            after deploy.
          </p>
        )}
      </section>

      <section className="space-y-4">
        <h3 className="font-display text-xl text-cinema-text">
          Publish as links
        </h3>
        <p className="text-sm text-cinema-muted">
          One URL per line. Optional title after{" "}
          <code className="text-cinema-accent"> | </code>
          (example:{" "}
          <code className="text-xs text-cinema-accent">
            https://…/video/… | My title
          </code>
          ). Viewers hit your ad page then the source site — no download.
        </p>
        <form onSubmit={handlePublishLinks} className="space-y-3">
          <textarea
            value={linkText}
            onChange={(e) => setLinkText(e.target.value)}
            rows={5}
            placeholder={
              "https://www.fpo.xxx/video/123/title/\nhttps://www.playvids.com/abc123/title | Custom title"
            }
            className="w-full rounded-md border border-cinema-border bg-cinema-card px-3 py-2 font-mono text-sm text-cinema-text outline-none focus:border-cinema-accent"
          />
          {linkError ? <p className="text-sm text-red-400">{linkError}</p> : null}
          {linkMessage ? (
            <p className="text-sm text-emerald-400">{linkMessage}</p>
          ) : null}
          <button
            type="submit"
            disabled={linkSubmitting}
            className="rounded-md bg-cinema-accent px-4 py-2 font-medium text-cinema-black transition hover:bg-cinema-accent-hover disabled:opacity-60"
          >
            {linkSubmitting ? "Publishing…" : "Publish as links"}
          </button>
        </form>

        {outbound.length > 0 ? (
          <ul className="space-y-2">
            {outbound.map((film) => (
              <li
                key={film.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-cinema-border/50 bg-cinema-card px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-cinema-text">
                    {film.title}
                  </p>
                  <p className="truncate text-xs text-cinema-muted">
                    {film.site ? `${film.site} · ` : ""}
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
            ))}
          </ul>
        ) : null}
      </section>

      <div className="border-t border-cinema-border/40 pt-8">
        <div className="mb-4">
          <h2 className="font-display text-2xl text-cinema-text">
            Bunny download queue
          </h2>
          <p className="mt-1 text-sm text-cinema-muted">
            Paste direct video file URLs (e.g. ending in .mp4). Bunny fetches
            them into library 700551. Tube site page URLs usually will not work
            here — use Publish as links or the local Python tool for those.
          </p>
        </div>

        <form onSubmit={handleQueue} className="space-y-3">
          <textarea
            value={urlText}
            onChange={(e) => setUrlText(e.target.value)}
            rows={5}
            placeholder={
              "https://cdn.example.com/video1.mp4\nhttps://cdn.example.com/video2.mp4"
            }
            className="w-full rounded-md border border-cinema-border bg-cinema-card px-3 py-2 font-mono text-sm text-cinema-text outline-none focus:border-cinema-accent"
          />
          {queueError ? (
            <p className="text-sm text-red-400">{queueError}</p>
          ) : null}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-cinema-accent px-4 py-2 font-medium text-cinema-black transition hover:bg-cinema-accent-hover disabled:opacity-60"
          >
            {submitting ? "Sending to Bunny…" : "Queue downloads"}
          </button>
        </form>
      </div>

      {jobs.length > 0 ? (
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <h3 className="font-display text-xl text-cinema-text">
              This session
            </h3>
            <span className="text-sm text-cinema-muted">
              Overall {overallProgress}%
            </span>
          </div>
          <ProgressBar progress={overallProgress} status="processing" />
          <ul className="space-y-3">
            {jobs.map((job) => (
              <li
                key={job.id}
                className="rounded-lg border border-cinema-border/50 bg-cinema-card p-4"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-cinema-text">{job.title}</p>
                  <span className="text-xs uppercase tracking-wide text-cinema-muted">
                    {statusLabel(job.status)} · {job.progress}%
                  </span>
                </div>
                <ProgressBar progress={job.progress} status={job.status} />
                <p className="mt-2 truncate text-xs text-cinema-muted">
                  {job.url}
                </p>
                {job.message ? (
                  <p className="mt-1 text-xs text-cinema-muted">{job.message}</p>
                ) : null}
                {job.bunnyVideoId ? (
                  <p className="mt-1 font-mono text-xs text-cinema-accent">
                    {job.bunnyVideoId}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-4">
        <h3 className="font-display text-xl text-cinema-text">
          Bunny library history
        </h3>
        {historyError ? (
          <p className="text-sm text-red-400">{historyError}</p>
        ) : null}
        {library.length === 0 ? (
          <p className="text-sm text-cinema-muted">
            No videos in the library yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {library.map((item) => (
              <li
                key={item.bunnyVideoId}
                className="rounded-lg border border-cinema-border/50 bg-cinema-card p-4"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-cinema-text">{item.title}</p>
                  <span className="text-xs uppercase tracking-wide text-cinema-muted">
                    {statusLabel(item.status)} · {item.progress}%
                  </span>
                </div>
                <ProgressBar progress={item.progress} status={item.status} />
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-cinema-muted">
                  {item.dateUploaded ? (
                    <span>
                      {new Date(item.dateUploaded).toLocaleString()}
                    </span>
                  ) : null}
                  <a
                    href={item.embedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-cinema-accent hover:underline"
                  >
                    Open embed
                  </a>
                  <span className="font-mono">{item.bunnyVideoId}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
