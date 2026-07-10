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
    const id = window.setInterval(() => {
      void refreshHistory();
      void pollJobs();
    }, 4000);
    return () => window.clearInterval(id);
  }, [authed, refreshHistory, pollJobs]);

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
          Enter the admin password to queue Bunny Stream downloads.
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
          <h2 className="font-display text-2xl text-cinema-text">
            Download queue
          </h2>
          <p className="mt-1 text-sm text-cinema-muted">
            Paste direct video file URLs (e.g. ending in .mp4). Bunny fetches
            them into library 700551. Page URLs from tube sites usually will not
            work — use a direct media link.
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

      <form onSubmit={handleQueue} className="space-y-3">
        <textarea
          value={urlText}
          onChange={(e) => setUrlText(e.target.value)}
          rows={5}
          placeholder={"https://cdn.example.com/video1.mp4\nhttps://cdn.example.com/video2.mp4"}
          className="w-full rounded-md border border-cinema-border bg-cinema-card px-3 py-2 font-mono text-sm text-cinema-text outline-none focus:border-cinema-accent"
        />
        {queueError ? <p className="text-sm text-red-400">{queueError}</p> : null}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-cinema-accent px-4 py-2 font-medium text-cinema-black transition hover:bg-cinema-accent-hover disabled:opacity-60"
        >
          {submitting ? "Sending to Bunny…" : "Queue downloads"}
        </button>
      </form>

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
          <p className="text-sm text-cinema-muted">No videos in the library yet.</p>
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
