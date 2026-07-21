"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { VideoCard } from "@/components/VideoCard";
import { filterAndSortFilms, type Film, type SortOption } from "@/data/films";
import { fetchFilms } from "@/lib/filmsApi";

const sortOptions: { value: SortOption; label: string }[] = [
  { value: "most-viewed", label: "Most Viewed" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
];

export function VideosCatalog() {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortOption>("newest");
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

  const displayedFilms = useMemo(
    () => filterAndSortFilms(films, { query, sort }),
    [films, query, sort]
  );

  return (
    <>
      <PageHeader
        title="Videos"
        subtitle="Search the full library — videos imported by users and the community."
      />

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="relative">
          <svg
            className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-cinema-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, model, or site…"
            className="w-full rounded-xl border border-cinema-border/60 bg-cinema-card py-3 pl-12 pr-4 text-sm text-cinema-text placeholder:text-cinema-muted focus:border-cinema-accent focus:outline-none focus:ring-1 focus:ring-cinema-accent"
          />
        </div>

        <div className="mt-4 flex justify-end">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="rounded-lg border border-cinema-border bg-cinema-card px-3 py-2 text-xs text-cinema-text focus:border-cinema-accent focus:outline-none focus:ring-1 focus:ring-cinema-accent"
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <p className="mt-10 text-center text-sm text-cinema-muted">
            Loading videos…
          </p>
        ) : error ? (
          <p className="mt-10 text-center text-sm text-red-400">{error}</p>
        ) : (
          <>
            <p className="mt-4 text-sm text-cinema-muted">
              {displayedFilms.length} video
              {displayedFilms.length !== 1 ? "s" : ""}
            </p>

            {displayedFilms.length > 0 ? (
              <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {displayedFilms.map((film) => (
                  <VideoCard key={film.slug} film={film} />
                ))}
              </div>
            ) : (
              <p className="mt-10 text-center text-sm text-cinema-muted">
                No videos match your search.
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}
