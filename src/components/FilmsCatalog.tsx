"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { FilmCard } from "@/components/FilmCard";
import type { Film } from "@/data/films";
import { fetchFilms } from "@/lib/filmsApi";

export function FilmsCatalog() {
  const [films, setFilms] = useState<Film[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchFilms();
        if (!cancelled) {
          setFilms(data);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load videos");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <PageHeader
        title="Films"
        subtitle="Bunny-hosted videos and external titles with thumbnails — watch on-site or continue to the source."
      />

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        {loading ? (
          <p className="text-center text-sm text-cinema-muted">
            Loading videos…
          </p>
        ) : error ? (
          <p className="text-center text-sm text-red-400">{error}</p>
        ) : films.length === 0 ? (
          <p className="text-center text-sm text-cinema-muted">
            No videos yet. Publish outbound links or upload to Bunny.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {films.map((film) => (
              <FilmCard key={film.slug} film={film} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
