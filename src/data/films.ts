export interface FilmCredit {
  role: string;
  name: string;
}

export type FilmKind = "bunny" | "outbound";

export interface Film {
  title: string;
  slug: string;
  description: string;
  synopsis: string;
  poster: string;
  streamId: string;
  embedUrl?: string;
  runtime: string;
  year: number;
  genre: string;
  views: number;
  credits: FilmCredit[];
  featured?: boolean;
  dateUploaded?: string;
  /** bunny = hosted player; outbound = ad redirect to source site */
  kind?: FilmKind;
  /** Original watch URL for outbound films */
  sourceUrl?: string;
}

export function isOutboundFilm(film: Film): boolean {
  return film.kind === "outbound" || Boolean(film.sourceUrl && !film.embedUrl);
}

export function getStreamEmbedUrl(film: Film): string {
  if (isOutboundFilm(film)) return "";
  if (film.embedUrl) return film.embedUrl;
  return "";
}

export type SortOption = "most-viewed" | "newest" | "oldest";

export function filterAndSortFilms(
  films: Film[],
  options: {
    query?: string;
    genre?: string;
    sort?: SortOption;
  }
): Film[] {
  const { query = "", genre = "all", sort = "most-viewed" } = options;
  let result = [...films];

  if (genre !== "all") {
    result = result.filter((film) => film.genre === genre);
  }

  if (query.trim()) {
    const normalized = query.trim().toLowerCase();
    result = result.filter((film) =>
      [film.title, film.description, film.synopsis, film.genre, film.year.toString()]
        .join(" ")
        .toLowerCase()
        .includes(normalized)
    );
  }

  switch (sort) {
    case "newest":
      return result.sort((a, b) => {
        const da = a.dateUploaded ? Date.parse(a.dateUploaded) : a.year;
        const db = b.dateUploaded ? Date.parse(b.dateUploaded) : b.year;
        return db - da;
      });
    case "oldest":
      return result.sort((a, b) => {
        const da = a.dateUploaded ? Date.parse(a.dateUploaded) : a.year;
        const db = b.dateUploaded ? Date.parse(b.dateUploaded) : b.year;
        return da - db;
      });
    case "most-viewed":
    default:
      return result.sort((a, b) => b.views - a.views);
  }
}

export function getRelatedFilms(
  films: Film[],
  currentSlug: string,
  limit = 3
): Film[] {
  return films.filter((film) => film.slug !== currentSlug).slice(0, limit);
}
