import { slugifyFilmTitle, type Film } from "@/data/films";

export interface ModelSummary {
  name: string;
  slug: string;
  videoCount: number;
  poster: string;
  latestDate?: string;
}

export function modelSlug(name: string): string {
  return slugifyFilmTitle(name);
}

export function modelDetailPath(name: string, site?: "fpo"): string {
  const slug = modelSlug(name);
  if (site === "fpo") {
    return `/models/${encodeURIComponent(slug)}?site=fpo`;
  }
  return `/models/${encodeURIComponent(slug)}`;
}

function normalizeModelName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function filmMatchesModel(
  film: Film,
  modelName: string,
  _slug?: string
): boolean {
  const normalizedName = normalizeModelName(modelName);
  if (!normalizedName) return false;

  const title = normalizeModelName(film.title);
  return title.includes(normalizedName);
}

function filmActor(film: Film): string {
  return (film.actor || "").trim();
}

function filmDate(film: Film): number {
  return film.dateUploaded ? Date.parse(film.dateUploaded) : film.year;
}

export function deriveModels(
  films: Film[],
  options?: { site?: string }
): ModelSummary[] {
  const { site } = options ?? {};
  const byKey = new Map<
    string,
    { name: string; count: number; poster: string; latest: number }
  >();

  for (const film of films) {
    const actor = filmActor(film);
    if (!actor) continue;
    if (site && film.site !== site && film.genre !== site) continue;

    const key = actor.toLowerCase();
    const date = filmDate(film);
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, {
        name: actor,
        count: 1,
        poster: film.poster,
        latest: date,
      });
      continue;
    }

    existing.count += 1;
    if (date >= existing.latest) {
      existing.latest = date;
      existing.poster = film.poster;
      existing.name = actor;
    }
  }

  return [...byKey.values()]
    .map((entry) => ({
      name: entry.name,
      slug: modelSlug(entry.name),
      videoCount: entry.count,
      poster: entry.poster,
      latestDate:
        entry.latest > 0 ? new Date(entry.latest).toISOString() : undefined,
    }))
    .sort((a, b) => {
      if (b.videoCount !== a.videoCount) return b.videoCount - a.videoCount;
      return a.name.localeCompare(b.name);
    });
}

export function getFilmsForModel(
  films: Film[],
  slug: string,
  options?: { site?: string; modelName?: string }
): { model: ModelSummary | null; films: Film[] } {
  const { site, modelName } = options ?? {};
  const matched = films.filter((film) => {
    if (site && film.site !== site && film.genre !== site) return false;
    if (!modelName) return false;
    return filmMatchesModel(film, modelName, slug);
  });

  if (matched.length === 0) {
    return { model: null, films: [] };
  }

  const name = modelName || filmActor(matched[0]) || slug;
  const sorted = [...matched].sort((a, b) => filmDate(b) - filmDate(a));

  return {
    model: {
      name,
      slug: modelSlug(name),
      videoCount: sorted.length,
      poster: sorted[0].poster,
      latestDate: sorted[0].dateUploaded,
    },
    films: sorted,
  };
}
