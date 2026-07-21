import { getFilmsForModel, type ModelSummary } from "@/data/models";
import type { Film } from "@/data/films";

export interface SiteModelRecord {
  id: string;
  name: string;
  slug: string;
  poster: string;
  profileUrl?: string;
  sourceSite?: string;
  dateAdded?: string;
}

export function siteRecordToSummary(record: SiteModelRecord): ModelSummary {
  return {
    name: record.name,
    slug: record.slug,
    videoCount: 0,
    poster: record.poster,
    latestDate: record.dateAdded,
  };
}

export async function fetchSiteModels(): Promise<SiteModelRecord[]> {
  try {
    const res = await fetch("/api/models", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { models?: SiteModelRecord[] };
      return (data.models ?? []).filter((record) =>
        Boolean((record.poster || "").trim())
      );
    }
  } catch {
    // fall through to static JSON
  }

  const fallback = await fetch("/models.json", { cache: "no-store" });
  if (!fallback.ok) {
    return [];
  }
  const data: unknown = await fallback.json();
  const records = Array.isArray(data)
    ? (data as SiteModelRecord[])
    : ((data as { models?: SiteModelRecord[] }).models ?? []);
  return records.filter((record) => Boolean((record.poster || "").trim()));
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Merge imported model photos with video counts from the catalog. Photos come only from model import. */
export function mergeImportedAndFilmModels(
  imported: SiteModelRecord[],
  fromFilms: ModelSummary[],
  films?: Film[]
): ModelSummary[] {
  const bySlug = new Map<string, ModelSummary>();
  const filmCountBySlug = new Map(
    fromFilms.map((model) => [model.slug.toLowerCase(), model.videoCount])
  );
  const filmCountByName = new Map(
    fromFilms.map((model) => [normalizeName(model.name), model.videoCount])
  );

  for (const record of imported) {
    if (!(record.poster || "").trim()) continue;
    const summary = siteRecordToSummary(record);
    const slugKey = summary.slug.toLowerCase();
    const nameKey = normalizeName(summary.name);
    summary.videoCount = films
      ? getFilmsForModel(films, summary.slug, { modelName: summary.name })
          .films.length
      : filmCountBySlug.get(slugKey) ?? filmCountByName.get(nameKey) ?? 0;
    bySlug.set(slugKey, summary);
  }

  return [...bySlug.values()].sort((a, b) => {
    if (b.videoCount !== a.videoCount) return b.videoCount - a.videoCount;
    return a.name.localeCompare(b.name);
  });
}
