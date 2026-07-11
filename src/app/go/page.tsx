"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BackLink } from "@/components/PageHeader";
import type { Film } from "@/data/films";
import { fetchFilm } from "@/lib/filmsApi";

const COUNTDOWN_SECONDS = 5;

function GoContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") || "";
  const [film, setFilm] = useState<Film | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [seconds, setSeconds] = useState(COUNTDOWN_SECONDS);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError("Missing video id");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const current = await fetchFilm(id);
        if (cancelled) return;
        if (!current?.sourceUrl) {
          setError("This video is not an outbound link");
          setFilm(null);
        } else {
          setFilm(current);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!film?.sourceUrl || !started) return;
    if (seconds <= 0) {
      window.location.href = film.sourceUrl;
      return;
    }
    const timer = window.setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [film, seconds, started]);

  const host = useMemo(() => {
    if (!film?.sourceUrl) return "";
    try {
      return new URL(film.sourceUrl).hostname.replace(/^www\./, "");
    } catch {
      return "source site";
    }
  }, [film]);

  if (loading) {
    return (
      <p className="mx-auto max-w-3xl px-4 py-20 text-center text-sm text-cinema-muted">
        Preparing redirect…
      </p>
    );
  }

  if (error || !film) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <p className="text-sm text-red-400">{error || "Not found"}</p>
        <div className="mt-6 flex justify-center">
          <BackLink href="/films" label="Back to films" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <BackLink href={`/play?id=${encodeURIComponent(film.streamId)}`} label="Back" />

      <div className="mt-8 overflow-hidden rounded-xl border border-cinema-border/50 bg-cinema-card">
        <div className="relative aspect-video bg-cinema-dark">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={film.poster}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-cinema-black via-cinema-black/40 to-transparent" />
        </div>

        <div className="space-y-5 p-6 sm:p-8">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-cinema-muted">
              Leaving this site
            </p>
            <h1 className="mt-2 font-display text-2xl text-cinema-text sm:text-3xl">
              {film.title}
            </h1>
            <p className="mt-2 text-sm text-cinema-muted">
              You will continue to <span className="text-cinema-text">{host}</span> to
              watch this video.
            </p>
          </div>

          {/* Ad slot — replace with your ad network snippet */}
          <div className="rounded-lg border border-dashed border-cinema-border/70 bg-cinema-dark/60 px-4 py-8 text-center">
            <p className="text-xs uppercase tracking-[0.18em] text-cinema-muted">
              Advertisement
            </p>
            <p className="mt-3 text-sm text-cinema-muted">
              Ad placement — drop your ad code into <code className="text-cinema-accent">src/app/go/page.tsx</code>
            </p>
          </div>

          {!started ? (
            <button
              type="button"
              onClick={() => {
                setStarted(true);
                setSeconds(COUNTDOWN_SECONDS);
              }}
              className="w-full rounded-full bg-cinema-accent px-5 py-3 text-sm font-semibold text-cinema-black transition hover:brightness-110"
            >
              Continue to video
            </button>
          ) : (
            <div className="space-y-3 text-center">
              <p className="text-sm text-cinema-muted">
                Redirecting in <span className="text-cinema-text">{seconds}</span>…
              </p>
              <a
                href={film.sourceUrl || "#"}
                className="inline-flex rounded-full border border-cinema-border px-5 py-2.5 text-sm text-cinema-text transition hover:border-cinema-accent/50"
              >
                Continue now
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function GoPage() {
  return (
    <Suspense
      fallback={
        <p className="mx-auto max-w-3xl px-4 py-20 text-center text-sm text-cinema-muted">
          Preparing redirect…
        </p>
      }
    >
      <GoContent />
    </Suspense>
  );
}
