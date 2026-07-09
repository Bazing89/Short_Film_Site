export interface FilmCredit {
  role: string;
  name: string;
}

export interface Film {
  title: string;
  slug: string;
  description: string;
  synopsis: string;
  poster: string;
  /** Unused when embedUrl is set */
  streamId: string;
  /**
   * Bunny Stream embed URL (takes precedence over streamId).
   * Format: https://player.mediadelivery.net/embed/{LIBRARY_ID}/{VIDEO_ID}
   */
  embedUrl?: string;
  runtime: string;
  year: number;
  genre: string;
  views: number;
  credits: FilmCredit[];
  featured?: boolean;
}

/** Fallback when a Bunny thumbnail URL is not set yet */
const PLACEHOLDER_POSTER =
  "https://images.unsplash.com/photo-1485846234645-a62644f84728?w=800&q=80";

/**
 * Legacy Cloudflare Stream helper — prefer embedUrl with Bunny instead.
 */
export const CLOUDFLARE_STREAM_CUSTOMER_CODE = "YOUR_CUSTOMER_CODE";

export function getStreamEmbedUrl(film: Film): string {
  if (film.embedUrl) {
    return film.embedUrl;
  }
  return `https://customer-${CLOUDFLARE_STREAM_CUSTOMER_CODE}.cloudflarestream.com/${film.streamId}/iframe`;
}

/**
 * Fill-in slots for Bunny Stream videos.
 * 1. Upload to Bunny Stream library
 * 2. Set title to the video file name (no .mp4)
 * 3. Put the Bunny play/embed URL in embedUrl below
 *    (Bunny dashboard → video → Embed / Video ID)
 *    Format: https://player.mediadelivery.net/embed/{LIBRARY_ID}/{VIDEO_ID}
 */
export const films: Film[] = [
  {
    title: "PASTE_FILENAME_HERE_01", // set to video file name (no .mp4)
    slug: "film-slot-01",
    description: "",
    synopsis: "",
    poster: PLACEHOLDER_POSTER, // replace with Bunny thumbnail URL
    streamId: "bunny",
    // >>> PUT BUNNY VIDEO PLAY ID / EMBED URL HERE <<<
    // Example: "https://player.mediadelivery.net/embed/YOUR_LIBRARY_ID/YOUR_VIDEO_ID"
    embedUrl: "https://player.mediadelivery.net/play/700551/9c00c56f-1a75-4337-b9af-a3c24565f00a",
    runtime: "",
    year: 2026,
    genre: "",
    views: 0,
    featured: true,
    credits: [],
  },
  {
    title: "PASTE_FILENAME_HERE_02",
    slug: "film-slot-02",
    description: "",
    synopsis: "",
    poster: PLACEHOLDER_POSTER,
    streamId: "bunny",
    // >>> PUT BUNNY VIDEO PLAY ID / EMBED URL HERE <<<
    embedUrl: "https://player.mediadelivery.net/play/700551/ab06f681-1c7f-4f7d-b5a7-a6892ec4acc4",
    runtime: "",
    year: 2026,
    genre: "",
    views: 0,
    credits: [],
  },
  {
    title: "PASTE_FILENAME_HERE_03",
    slug: "film-slot-03",
    description: "",
    synopsis: "",
    poster: PLACEHOLDER_POSTER,
    streamId: "bunny",
    // >>> PUT BUNNY VIDEO PLAY ID / EMBED URL HERE <<<
    embedUrl: "",
    runtime: "",
    year: 2026,
    genre: "",
    views: 0,
    credits: [],
  },
  {
    title: "PASTE_FILENAME_HERE_04",
    slug: "film-slot-04",
    description: "",
    synopsis: "",
    poster: PLACEHOLDER_POSTER,
    streamId: "bunny",
    // >>> PUT BUNNY VIDEO PLAY ID / EMBED URL HERE <<<
    embedUrl: "",
    runtime: "",
    year: 2026,
    genre: "",
    views: 0,
    credits: [],
  },
  {
    title: "PASTE_FILENAME_HERE_05",
    slug: "film-slot-05",
    description: "",
    synopsis: "",
    poster: PLACEHOLDER_POSTER,
    streamId: "bunny",
    // >>> PUT BUNNY VIDEO PLAY ID / EMBED URL HERE <<<
    embedUrl: "",
    runtime: "",
    year: 2026,
    genre: "",
    views: 0,
    credits: [],
  },
  {
    title: "PASTE_FILENAME_HERE_06",
    slug: "film-slot-06",
    description: "",
    synopsis: "",
    poster: PLACEHOLDER_POSTER,
    streamId: "bunny",
    // >>> PUT BUNNY VIDEO PLAY ID / EMBED URL HERE <<<
    embedUrl: "",
    runtime: "",
    year: 2026,
    genre: "",
    views: 0,
    credits: [],
  },
  {
    title: "PASTE_FILENAME_HERE_07",
    slug: "film-slot-07",
    description: "",
    synopsis: "",
    poster: PLACEHOLDER_POSTER,
    streamId: "bunny",
    // >>> PUT BUNNY VIDEO PLAY ID / EMBED URL HERE <<<
    embedUrl: "",
    runtime: "",
    year: 2026,
    genre: "",
    views: 0,
    credits: [],
  },
  {
    title: "PASTE_FILENAME_HERE_08",
    slug: "film-slot-08",
    description: "",
    synopsis: "",
    poster: PLACEHOLDER_POSTER,
    streamId: "bunny",
    // >>> PUT BUNNY VIDEO PLAY ID / EMBED URL HERE <<<
    embedUrl: "",
    runtime: "",
    year: 2026,
    genre: "",
    views: 0,
    credits: [],
  },
  {
    title: "PASTE_FILENAME_HERE_09",
    slug: "film-slot-09",
    description: "",
    synopsis: "",
    poster: PLACEHOLDER_POSTER,
    streamId: "bunny",
    // >>> PUT BUNNY VIDEO PLAY ID / EMBED URL HERE <<<
    embedUrl: "",
    runtime: "",
    year: 2026,
    genre: "",
    views: 0,
    credits: [],
  },
  {
    title: "PASTE_FILENAME_HERE_10",
    slug: "film-slot-10",
    description: "",
    synopsis: "",
    poster: PLACEHOLDER_POSTER,
    streamId: "bunny",
    // >>> PUT BUNNY VIDEO PLAY ID / EMBED URL HERE <<<
    embedUrl: "",
    runtime: "",
    year: 2026,
    genre: "",
    views: 0,
    credits: [],
  },
];

export function getFilmBySlug(slug: string): Film | undefined {
  return films.find((film) => film.slug === slug);
}

export function getMostViewedFilms(limit?: number): Film[] {
  const sorted = [...films].sort((a, b) => b.views - a.views);
  return limit ? sorted.slice(0, limit) : sorted;
}

export function searchFilms(query: string): Film[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];

  return films.filter((film) =>
    [film.title, film.description, film.synopsis, film.genre, film.year.toString()]
      .join(" ")
      .toLowerCase()
      .includes(normalized)
  );
}

export type SortOption = "most-viewed" | "newest" | "oldest";

export function getGenres(): string[] {
  return [...new Set(films.map((film) => film.genre).filter(Boolean))].sort();
}

export function filterAndSortFilms(options: {
  query?: string;
  genre?: string;
  sort?: SortOption;
}): Film[] {
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
      return result.sort((a, b) => b.year - a.year);
    case "oldest":
      return result.sort((a, b) => a.year - b.year);
    case "most-viewed":
    default:
      return result.sort((a, b) => b.views - a.views);
  }
}

export function getFeaturedFilm(): Film {
  return films.find((film) => film.featured) ?? films[0];
}

export function getRelatedFilms(currentSlug: string, limit = 3): Film[] {
  const current = getFilmBySlug(currentSlug);
  if (!current) return films.slice(0, limit);

  const sameGenre = films.filter(
    (film) => film.slug !== currentSlug && film.genre === current.genre
  );
  const others = films.filter(
    (film) => film.slug !== currentSlug && film.genre !== current.genre
  );

  return [...sameGenre, ...others].slice(0, limit);
}
