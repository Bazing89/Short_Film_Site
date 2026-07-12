import { type ModelSummary } from "@/data/models";

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
      return data.models ?? [];
    }
  } catch {
    // fall through to static JSON
  }

  const fallback = await fetch("/models.json", { cache: "no-store" });
  if (!fallback.ok) {
    return [];
  }
  const data: unknown = await fallback.json();
  if (Array.isArray(data)) {
    return data as SiteModelRecord[];
  }
  return (data as { models?: SiteModelRecord[] }).models ?? [];
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function mergeImportedAndFilmModels(
  imported: SiteModelRecord[],
  fromFilms: ModelSummary[]
): ModelSummary[] {
  const bySlug = new Map<string, ModelSummary>();
  const nameIndex = new Map<string, string>();
  const filmCountBySlug = new Map(
    fromFilms.map((model) => [model.slug.toLowerCase(), model.videoCount])
  );
  const filmCountByName = new Map(
    fromFilms.map((model) => [normalizeName(model.name), model.videoCount])
  );
  const filmPosterBySlug = new Map(
    fromFilms.map((model) => [model.slug.toLowerCase(), model.poster])
  );

  for (const record of imported) {
    const summary = siteRecordToSummary(record);
    const slugKey = summary.slug.toLowerCase();
    const nameKey = normalizeName(summary.name);
    summary.videoCount =
      filmCountBySlug.get(slugKey) ?? filmCountByName.get(nameKey) ?? 0;
    if (!summary.poster) {
      summary.poster = filmPosterBySlug.get(slugKey) || "";
    }
    bySlug.set(slugKey, summary);
    nameIndex.set(nameKey, slugKey);
  }

  for (const filmModel of fromFilms) {
    const slugKey = filmModel.slug.toLowerCase();
    const nameKey = normalizeName(filmModel.name);
    const existingSlug = bySlug.has(slugKey)
      ? slugKey
      : nameIndex.get(nameKey);

    if (existingSlug && bySlug.has(existingSlug)) {
      const existing = bySlug.get(existingSlug)!;
      existing.videoCount = Math.max(existing.videoCount, filmModel.videoCount);
      if (!existing.poster && filmModel.poster) {
        existing.poster = filmModel.poster;
      }
      continue;
    }

    bySlug.set(slugKey, { ...filmModel });
    nameIndex.set(nameKey, slugKey);
  }

  return [...bySlug.values()].sort((a, b) => {
    if (b.videoCount !== a.videoCount) return b.videoCount - a.videoCount;
    return a.name.localeCompare(b.name);
  });
}
