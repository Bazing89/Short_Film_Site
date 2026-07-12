"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BackLink } from "@/components/PageHeader";
import { VideoCard } from "@/components/VideoCard";
import { getFilmsForModel } from "@/data/models";
import { fetchFilms } from "@/lib/filmsApi";
import { fetchSiteModels, siteRecordToSummary } from "@/lib/siteModelsApi";

function ModelDetailContent() {
  const searchParams = useSearchParams();
  const slug = searchParams.get("slug") || "";
  const site = searchParams.get("site") === "fpo" ? "fpo" : undefined;
  const backHref = site === "fpo" ? "/bop-models" : "/models";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [poster, setPoster] = useState("");
  const [videoCount, setVideoCount] = useState(0);
  const [films, setFilms] = useState(
    [] as ReturnType<typeof getFilmsForModel>["films"]
  );

  useEffect(() => {
    if (!slug) {
      setLoading(false);
      setError("Missing model");
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const [importedModels, all] = await Promise.all([
          fetchSiteModels(),
          fetchFilms(),
        ]);
        if (cancelled) return;

        const imported = importedModels.find(
          (model) => model.slug.toLowerCase() === slug.toLowerCase()
        );

        if (imported) {
          const result = getFilmsForModel(all, slug, {
            site,
            modelName: imported.name,
          });
          const summary = siteRecordToSummary(imported);
          setName(summary.name);
          setPoster(summary.poster || result.model?.poster || "");
          setVideoCount(result.films.length);
          setFilms(result.films);
          setError("");
          return;
        }

        const result = getFilmsForModel(all, slug, site ? { site } : undefined);
        if (!result.model) {
          setError("Model not found");
          setName("");
          setPoster("");
          setVideoCount(0);
          setFilms([]);
        } else {
          setName(result.model.name);
          setPoster(result.model.poster);
          setVideoCount(result.model.videoCount);
          setFilms(result.films);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load model");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, site]);

  if (loading) {
    return (
      <p className="mx-auto max-w-7xl px-4 py-20 text-center text-sm text-cinema-muted">
        Loading model…
      </p>
    );
  }

  if (error || !name) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-20 text-center sm:px-6 lg:px-8">
        <p className="text-sm text-red-400">{error || "Model not found"}</p>
        <div className="mt-6 flex justify-center">
          <BackLink href={backHref} label="Back to models" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="border-b border-cinema-border/50 bg-cinema-dark">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <BackLink href={backHref} label="Back to models" />
          <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-end">
            <div className="relative h-40 w-32 shrink-0 overflow-hidden rounded-lg border border-cinema-border/50 sm:h-48 sm:w-36">
              {poster ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={poster}
                  alt={name}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-cinema-dark text-xs text-cinema-muted">
                  No image
                </div>
              )}
            </div>
            <div>
              <h1 className="font-display text-3xl capitalize text-cinema-text sm:text-4xl">
                {name}
              </h1>
              <p className="mt-2 text-sm text-cinema-muted">
                {videoCount} video{videoCount !== 1 ? "s" : ""} on BangHeroes
              </p>
            </div>
          </div>
        </div>
      </div>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        {films.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {films.map((film) => (
              <VideoCard key={film.slug} film={film} />
            ))}
          </div>
        ) : (
          <p className="text-center text-sm text-cinema-muted">
            No videos for this model yet. Search and publish links from the Python UI.
          </p>
        )}
      </section>
    </>
  );
}

export function ModelDetail() {
  return (
    <Suspense
      fallback={
        <p className="mx-auto max-w-7xl px-4 py-20 text-center text-sm text-cinema-muted">
          Loading model…
        </p>
      }
    >
      <ModelDetailContent />
    </Suspense>
  );
}
