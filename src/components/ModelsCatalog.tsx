"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { ModelCard } from "@/components/ModelCard";
import { deriveModels, type ModelSummary } from "@/data/models";
import { fetchFilms } from "@/lib/filmsApi";
import {
  fetchSiteModels,
  mergeImportedAndFilmModels,
} from "@/lib/siteModelsApi";

const MODELS_PAGE_SIZE = 80;

interface ModelsCatalogProps {
  site?: "fpo";
  title: string;
  subtitle: string;
}

export function ModelsCatalog({ site, title, subtitle }: ModelsCatalogProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [models, setModels] = useState([] as ModelSummary[]);
  const [visibleCount, setVisibleCount] = useState(MODELS_PAGE_SIZE);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [imported, films] = await Promise.all([
          fetchSiteModels(),
          fetchFilms(),
        ]);
        if (!cancelled) {
          const fromFilms = deriveModels(films, site ? { site } : undefined);
          setModels(mergeImportedAndFilmModels(imported, fromFilms, films));
          setVisibleCount(MODELS_PAGE_SIZE);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load models");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [site]);

  const displayedModels = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return models;
    return models.filter((model) =>
      model.name.toLowerCase().includes(normalized)
    );
  }, [models, query]);

  useEffect(() => {
    setVisibleCount(MODELS_PAGE_SIZE);
  }, [query]);

  const visibleModels = useMemo(
    () => displayedModels.slice(0, visibleCount),
    [displayedModels, visibleCount]
  );

  const hasMore = visibleCount < displayedModels.length;

  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />

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
            placeholder="Search models by name…"
            className="w-full rounded-xl border border-cinema-border/60 bg-cinema-card py-3 pl-12 pr-4 text-sm text-cinema-text placeholder:text-cinema-muted focus:border-cinema-accent focus:outline-none focus:ring-1 focus:ring-cinema-accent"
          />
        </div>

        {loading ? (
          <p className="mt-10 text-center text-sm text-cinema-muted">
            Loading models…
          </p>
        ) : error ? (
          <p className="mt-10 text-center text-sm text-red-400">{error}</p>
        ) : (
          <>
            <p className="mt-4 text-sm text-cinema-muted">
              {displayedModels.length} model
              {displayedModels.length !== 1 ? "s" : ""}
            </p>

            {displayedModels.length > 0 ? (
              <>
                <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {visibleModels.map((model) => (
                    <ModelCard key={model.slug} model={model} site={site} />
                  ))}
                </div>
                {hasMore ? (
                  <div className="mt-8 flex justify-center">
                    <button
                      type="button"
                      onClick={() =>
                        setVisibleCount((count) => count + MODELS_PAGE_SIZE)
                      }
                      className="rounded-lg border border-cinema-border bg-cinema-card px-5 py-2.5 text-sm text-cinema-text transition-colors hover:border-cinema-accent hover:text-cinema-accent"
                    >
                      Load more ({displayedModels.length - visibleCount} remaining)
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="mt-10 text-center text-sm text-cinema-muted">
                No models found yet.{" "}
                <Link href="/" className="text-cinema-accent hover:underline">
                  Search online
                </Link>{" "}
                to import the first one.
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}
