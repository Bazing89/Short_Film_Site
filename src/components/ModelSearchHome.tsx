"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ModelCard } from "@/components/ModelCard";
import { VideoCard } from "@/components/VideoCard";
import {
  deriveModels,
  getFilmsForModel,
  modelDetailPath,
  modelSlug,
  type ModelSummary,
} from "@/data/models";
import { fetchFilms } from "@/lib/filmsApi";
import {
  importModelVideos,
  searchModelOnline,
  SEARCH_SOURCES,
  type ModelSearchResult,
} from "@/lib/modelSearchApi";
import {
  fetchSiteModels,
  mergeImportedAndFilmModels,
} from "@/lib/siteModelsApi";

const SOURCE_LABELS: Record<string, string> = {
  xvideos: "XVideos",
  xnxx: "XNXX",
  pornhub: "Pornhub",
  fpo: "FPO",
  eporner: "Eporner",
  playvids: "Playvids",
};

export function ModelSearchHome() {
  const [query, setQuery] = useState("");
  const [activeModel, setActiveModel] = useState("");
  const [sources, setSources] = useState<string[]>([...SEARCH_SOURCES]);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [results, setResults] = useState<ModelSearchResult[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hasSearched, setHasSearched] = useState(false);

  const [catalogLoading, setCatalogLoading] = useState(true);
  const [popularModels, setPopularModels] = useState<ModelSummary[]>([]);
  const [libraryFilms, setLibraryFilms] = useState<
    ReturnType<typeof getFilmsForModel>["films"]
  >([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [imported, films] = await Promise.all([
          fetchSiteModels(),
          fetchFilms(),
        ]);
        if (!cancelled) {
          const fromFilms = deriveModels(films);
          const merged = mergeImportedAndFilmModels(imported, fromFilms);
          setPopularModels(merged.slice(0, 12));
        }
      } catch {
        /* non-blocking */
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshLibraryForModel = useCallback(async (model: string) => {
    try {
      const films = await fetchFilms();
      const slug = modelSlug(model);
      const { films: matched } = getFilmsForModel(films, slug, {
        modelName: model,
      });
      setLibraryFilms(matched);
    } catch {
      setLibraryFilms([]);
    }
  }, []);

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();
    const name = query.trim();
    if (name.length < 2) {
      setSearchError("Enter a model name (at least 2 characters)");
      return;
    }
    if (sources.length === 0) {
      setSearchError("Select at least one site to search");
      return;
    }

    setSearching(true);
    setSearchError("");
    setImportMessage("");
    setResults([]);
    setSelected(new Set());
    setHasSearched(true);
    setActiveModel(name);

    try {
      const data = await searchModelOnline(name, sources);
      const list = (data.results ?? []).filter(
        (r) => r.url && !r.error && (r.poster || "").trim()
      );
      setResults(list);
      setSelected(new Set(list.map((r) => r.url)));
      void refreshLibraryForModel(name);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function handleImport() {
    const items = results.filter(
      (r) => selected.has(r.url) && (r.poster || "").trim()
    );
    if (items.length === 0) {
      setSearchError("Select at least one video with a thumbnail to import");
      return;
    }

    setImporting(true);
    setSearchError("");
    setImportMessage("");

    try {
      const data = await importModelVideos(
        activeModel,
        items.map((r) => ({
          url: r.url,
          title: r.title,
          poster: r.poster,
          site: r.site,
        }))
      );
      setImportMessage(
        `Imported ${data.imported ?? items.length} video${(data.imported ?? items.length) !== 1 ? "s" : ""} to the library.${
          data.removedNoThumbnail
            ? ` Skipped ${data.removedNoThumbnail} without thumbnails.`
            : ""
        } Others can now search and watch them here.`
      );
      void refreshLibraryForModel(activeModel);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  function toggleSource(key: string) {
    setSources((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  function toggleResult(url: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === results.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(results.map((r) => r.url)));
    }
  }

  const allSelected = useMemo(
    () => results.length > 0 && selected.size === results.length,
    [results.length, selected.size]
  );

  return (
    <div className="relative">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-cinema-border/40">
        <div className="pointer-events-none absolute inset-0 bg-mesh-gradient opacity-60" />
        <div className="pointer-events-none absolute -left-32 top-0 h-96 w-96 rounded-full bg-cinema-glow/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-32 bottom-0 h-80 w-80 rounded-full bg-cinema-accent/10 blur-3xl" />

        <div className="relative mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-24 lg:px-8">
          <p className="animate-fade-in-up text-xs font-semibold uppercase tracking-[0.25em] text-cinema-accent">
            Model Search Tool
          </p>
          <h1 className="animate-fade-in-up-delay font-display mt-4 text-4xl leading-tight text-cinema-text sm:text-5xl lg:text-6xl">
            Find &amp; import videos
            <span className="block bg-gradient-to-r from-cinema-accent via-cinema-glow to-cinema-accent bg-clip-text text-transparent">
              from across the web
            </span>
          </h1>
          <p className="animate-fade-in-up-delay mx-auto mt-5 max-w-2xl text-base text-cinema-muted sm:text-lg">
            Type a model name to search tube sites online. Import links to the
            library so everyone can browse and watch them on BangHeroes.
          </p>

          <form
            onSubmit={(e) => void handleSearch(e)}
            className="animate-fade-in-up-delay-2 mx-auto mt-10 max-w-2xl"
          >
            <div className="glass-card flex flex-col gap-3 rounded-2xl p-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
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
                  placeholder="Enter model name…"
                  className="w-full rounded-xl border-0 bg-transparent py-4 pl-12 pr-4 text-base text-cinema-text placeholder:text-cinema-muted focus:outline-none focus:ring-0"
                  autoComplete="off"
                />
              </div>
              <button
                type="submit"
                disabled={searching}
                className="shrink-0 rounded-xl bg-gradient-to-r from-cinema-accent to-cinema-accent-hover px-8 py-4 text-sm font-semibold text-cinema-black transition-all hover:shadow-lg hover:shadow-cinema-accent/25 disabled:opacity-60"
              >
                {searching ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-cinema-black/30 border-t-cinema-black" />
                    Searching…
                  </span>
                ) : (
                  "Search online"
                )}
              </button>
            </div>

            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {SEARCH_SOURCES.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleSource(key)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                    sources.includes(key)
                      ? "bg-cinema-accent/20 text-cinema-accent ring-1 ring-cinema-accent/40"
                      : "bg-cinema-card/80 text-cinema-muted ring-1 ring-cinema-border hover:text-cinema-text"
                  }`}
                >
                  {SOURCE_LABELS[key] ?? key}
                </button>
              ))}
            </div>
          </form>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {searchError ? (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {searchError}
          </div>
        ) : null}

        {importMessage ? (
          <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            {importMessage}
            {activeModel ? (
              <>
                {" "}
                <Link
                  href={modelDetailPath(activeModel)}
                  className="font-medium underline hover:text-emerald-200"
                >
                  View {activeModel}&apos;s page →
                </Link>
              </>
            ) : null}
          </div>
        ) : null}

        {/* Search results */}
        {hasSearched ? (
          <section className="mb-14">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl text-cinema-text sm:text-3xl">
                  {searching
                    ? "Searching…"
                    : results.length > 0
                      ? `${results.length} result${results.length !== 1 ? "s" : ""} for “${activeModel}”`
                      : `No results for “${activeModel}”`}
                </h2>
                <p className="mt-1 text-sm text-cinema-muted">
                  Select videos to import into the site library
                </p>
              </div>
              {results.length > 0 ? (
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="text-sm text-cinema-muted transition-colors hover:text-cinema-accent"
                  >
                    {allSelected ? "Deselect all" : "Select all"}
                  </button>
                  <button
                    type="button"
                    disabled={importing || selected.size === 0}
                    onClick={() => void handleImport()}
                    className="rounded-full bg-gradient-to-r from-cinema-accent to-cinema-accent-hover px-5 py-2.5 text-sm font-semibold text-cinema-black transition-all hover:shadow-lg hover:shadow-cinema-accent/20 disabled:opacity-50"
                  >
                    {importing
                      ? "Importing…"
                      : `Import ${selected.size} to library`}
                  </button>
                </div>
              ) : null}
            </div>

            {results.length > 0 ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {results.map((result) => {
                  const isSelected = selected.has(result.url);
                  return (
                    <button
                      key={result.url}
                      type="button"
                      onClick={() => toggleResult(result.url)}
                      className={`group relative flex flex-col gap-2 rounded-xl text-left transition-all ${
                        isSelected
                          ? "ring-2 ring-cinema-accent ring-offset-2 ring-offset-cinema-black"
                          : "opacity-80 hover:opacity-100"
                      }`}
                    >
                      <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-cinema-border/50 bg-cinema-card">
                        {result.poster ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={result.poster}
                            alt={result.title}
                            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            loading="lazy"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center text-xs text-cinema-muted">
                            No thumbnail
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-cinema-black/60 via-transparent to-transparent" />
                        <span
                          className={`absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded border ${
                            isSelected
                              ? "border-cinema-accent bg-cinema-accent text-cinema-black"
                              : "border-white/40 bg-cinema-black/60"
                          }`}
                        >
                          {isSelected ? (
                            <svg
                              className="h-3 w-3"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={3}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          ) : null}
                        </span>
                        {result.site ? (
                          <span className="absolute bottom-2 left-2 rounded bg-cinema-black/80 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-cinema-accent">
                            {result.site}
                          </span>
                        ) : null}
                      </div>
                      <p className="line-clamp-2 text-sm text-cinema-text">
                        {result.title}
                      </p>
                    </button>
                  );
                })}
              </div>
            ) : !searching ? (
              <p className="text-center text-sm text-cinema-muted">
                Try a different spelling or enable more search sources above.
              </p>
            ) : null}
          </section>
        ) : null}

        {/* Already in library */}
        {activeModel && libraryFilms.length > 0 ? (
          <section className="mb-14">
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl text-cinema-text">
                  Already in library
                </h2>
                <p className="mt-1 text-sm text-cinema-muted">
                  {libraryFilms.length} video
                  {libraryFilms.length !== 1 ? "s" : ""} for {activeModel}
                </p>
              </div>
              <Link
                href={modelDetailPath(activeModel)}
                className="text-sm text-cinema-accent transition-colors hover:text-cinema-accent-hover"
              >
                View all →
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {libraryFilms.slice(0, 8).map((film) => (
                <VideoCard key={film.slug} film={film} />
              ))}
            </div>
          </section>
        ) : null}

        {/* Popular models */}
        <section>
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl text-cinema-text sm:text-3xl">
                Browse models
              </h2>
              <p className="mt-1 text-sm text-cinema-muted">
                Search videos already imported to the library
              </p>
            </div>
            <Link
              href="/models"
              className="text-sm text-cinema-accent transition-colors hover:text-cinema-accent-hover"
            >
              All models →
            </Link>
          </div>

          {catalogLoading ? (
            <p className="text-center text-sm text-cinema-muted">
              Loading models…
            </p>
          ) : popularModels.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {popularModels.map((model) => (
                <ModelCard key={model.slug} model={model} />
              ))}
            </div>
          ) : (
            <div className="glass-card rounded-2xl px-6 py-12 text-center">
              <p className="text-cinema-muted">
                No models yet. Search above to import the first one.
              </p>
            </div>
          )}
        </section>

        {/* Quick links */}
        <div className="mt-12 flex flex-wrap justify-center gap-3">
          <Link href="/videos" className="nav-pill">
            Browse video library
          </Link>
          <Link href="/models" className="nav-pill">
            All models
          </Link>
        </div>
      </div>
    </div>
  );
}
