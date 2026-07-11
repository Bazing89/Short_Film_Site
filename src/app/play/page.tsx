"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { BackLink } from "@/components/PageHeader";
import { VideoPlayer } from "@/components/VideoPlayer";
import { FilmCard } from "@/components/FilmCard";
import { getRelatedFilms, isOutboundFilm, type Film } from "@/data/films";
import { fetchFilm, fetchFilms } from "@/lib/filmsApi";

function PlayContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") || "";
  const [film, setFilm] = useState<Film | null>(null);
  const [related, setRelated] = useState<Film[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError("Missing video id");
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const [current, all] = await Promise.all([fetchFilm(id), fetchFilms()]);
        if (cancelled) return;
        if (!current) {
          setError("Video not found or still processing");
          setFilm(null);
        } else {
          setFilm(current);
          setRelated(getRelatedFilms(all, current.slug, 3));
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load video");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <p className="mx-auto max-w-7xl px-4 py-20 text-center text-sm text-cinema-muted">
        Loading video…
      </p>
    );
  }

  if (error || !film) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-20 text-center sm:px-6 lg:px-8">
        <p className="text-sm text-red-400">{error || "Video not found"}</p>
        <div className="mt-6 flex justify-center">
          <BackLink href="/films" label="Back to films" />
        </div>
      </div>
    );
  }

  const outbound = isOutboundFilm(film);

  return (
    <>
      <div className="relative h-48 overflow-hidden sm:h-64 lg:h-80">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={film.poster}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-cinema-black via-cinema-black/60 to-cinema-black/30" />
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative -mt-16 sm:-mt-20">
          <BackLink href="/films" label="Back to films" />
        </div>

        <div className="mt-6 max-w-4xl">
          {outbound ? (
            <div className="relative overflow-hidden rounded-lg border border-cinema-border/50 bg-cinema-card">
              <div className="relative aspect-video w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={film.poster}
                  alt={film.title}
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-cinema-black/55" />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
                  <p className="max-w-md text-sm text-cinema-muted">
                    This title streams on the original site. Continue through a short
                    ad page to watch.
                  </p>
                  <Link
                    href={`/go?id=${encodeURIComponent(film.streamId)}`}
                    className="rounded-full bg-cinema-accent px-6 py-3 text-sm font-semibold text-cinema-black transition hover:brightness-110"
                  >
                    Watch on source site
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <VideoPlayer film={film} />
          )}

          <div className="mt-8">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-3xl text-cinema-text sm:text-4xl lg:text-5xl">
                {film.title}
              </h1>
              {outbound ? (
                <span className="rounded-full border border-cinema-accent/40 px-2.5 py-1 text-[11px] uppercase tracking-wider text-cinema-accent">
                  External
                </span>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-cinema-muted">
              {film.year ? <span>{film.year}</span> : null}
              {film.runtime ? (
                <>
                  <span className="text-cinema-border">|</span>
                  <span>{film.runtime}</span>
                </>
              ) : null}
              {film.views ? (
                <>
                  <span className="text-cinema-border">|</span>
                  <span>{film.views.toLocaleString()} views</span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {related.length > 0 ? (
          <section className="mt-16 border-t border-cinema-border/50 py-16 sm:mt-20 sm:py-20">
            <h2 className="font-display text-2xl text-cinema-text sm:text-3xl">
              More videos
            </h2>
            <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((item) => (
                <FilmCard key={item.slug} film={item} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}

export default function PlayPage() {
  return (
    <Suspense
      fallback={
        <p className="mx-auto max-w-7xl px-4 py-20 text-center text-sm text-cinema-muted">
          Loading video…
        </p>
      }
    >
      <PlayContent />
    </Suspense>
  );
}
