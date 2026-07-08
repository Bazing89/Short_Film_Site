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
  /** Cloudflare Stream video ID — replace with your actual ID from the Stream dashboard */
  streamId: string;
  /**
   * Optional full embed URL. If provided, this takes precedence over streamId.
   * Format: https://customer-<CODE>.cloudflarestream.com/<VIDEO_ID>/iframe
   */
  embedUrl?: string;
  runtime: string;
  year: number;
  genre: string;
  views: number;
  credits: FilmCredit[];
  featured?: boolean;
}

/**
 * Cloudflare Stream customer subdomain.
 * Replace YOUR_CUSTOMER_CODE with your Cloudflare Stream customer code.
 * Find it in the Stream dashboard under your video's embed code.
 */
export const CLOUDFLARE_STREAM_CUSTOMER_CODE = "YOUR_CUSTOMER_CODE";

export function getStreamEmbedUrl(film: Film): string {
  if (film.embedUrl) {
    return film.embedUrl;
  }
  return `https://customer-${CLOUDFLARE_STREAM_CUSTOMER_CODE}.cloudflarestream.com/${film.streamId}/iframe`;
}

export const films: Film[] = [
  {
    title: "Midnight on Mercer",
    slug: "midnight-on-mercer",
    description:
      "A lone saxophonist finds an unexpected connection on a rain-soaked New York corner.",
    synopsis:
      "On the last night of summer, Eliot — a street musician who has played the same corner for years — meets a stranger who asks for one song before the trains stop running. What begins as a simple request becomes a quiet meditation on memory, loss, and the music we carry with us long after the last note fades.",
    poster:
      "https://images.unsplash.com/photo-1485846234645-a62644f84728?w=800&q=80",
    streamId: "YOUR_STREAM_VIDEO_ID_1",
    runtime: "14 min",
    year: 2025,
    genre: "Drama",
    views: 48200,
    featured: true,
    credits: [
      { role: "Director", name: "Your Name" },
      { role: "Writer", name: "Your Name" },
      { role: "Cinematography", name: "Cinematographer Name" },
      { role: "Music", name: "Composer Name" },
      { role: "Lead", name: "Actor Name" },
    ],
  },
  {
    title: "The Last Frame",
    slug: "the-last-frame",
    description:
      "A film archivist discovers something impossible hidden in a forgotten reel.",
    synopsis:
      "Mara works nights restoring decaying 16mm prints in a basement archive no one visits anymore. When she threads up a reel with no catalog number, the footage shows her own apartment — filmed from a angle that shouldn't exist. As the frames advance, the present and the recorded past begin to collapse into one another.",
    poster:
      "https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=800&q=80",
    streamId: "YOUR_STREAM_VIDEO_ID_2",
    runtime: "18 min",
    year: 2024,
    genre: "Thriller",
    views: 35600,
    credits: [
      { role: "Director", name: "Your Name" },
      { role: "Writer", name: "Your Name" },
      { role: "Cinematography", name: "Cinematographer Name" },
      { role: "Editor", name: "Editor Name" },
      { role: "Lead", name: "Actor Name" },
    ],
  },
  {
    title: "Borrowed Light",
    slug: "borrowed-light",
    description:
      "Two siblings return home to sell their childhood house and find it still holding light.",
    synopsis:
      "After their mother's passing, Ana and Luis return to the house they grew up in — a sun-flooded bungalow at the edge of town they've avoided for a decade. As they pack away decades of accumulated life, small discoveries in drawers and corners force them to reckon with what they left behind and what they can still take with them.",
    poster:
      "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&q=80",
    streamId: "YOUR_STREAM_VIDEO_ID_3",
    runtime: "22 min",
    year: 2024,
    genre: "Drama",
    views: 29100,
    credits: [
      { role: "Director", name: "Your Name" },
      { role: "Writer", name: "Your Name" },
      { role: "Producer", name: "Producer Name" },
      { role: "Cinematography", name: "Cinematographer Name" },
      { role: "Lead", name: "Actor Name" },
    ],
  },
  {
    title: "Signal",
    slug: "signal",
    description:
      "A radio operator picks up a transmission that shouldn't be possible.",
    synopsis:
      "In a remote coastal monitoring station, technician Ren keeps watch over frequencies no one listens to anymore. One night, a voice cuts through the static — speaking in a language Ren half-remembers from childhood, asking for help from a place that doesn't appear on any map.",
    poster:
      "https://images.unsplash.com/photo-1535016120720-40c6464b0b8b?w=800&q=80",
    streamId: "YOUR_STREAM_VIDEO_ID_4",
    runtime: "11 min",
    year: 2023,
    genre: "Sci-Fi",
    views: 22400,
    credits: [
      { role: "Director", name: "Your Name" },
      { role: "Writer", name: "Your Name" },
      { role: "Sound Design", name: "Sound Designer Name" },
      { role: "VFX", name: "VFX Artist Name" },
      { role: "Lead", name: "Actor Name" },
    ],
  },
  {
    title: "Golden Hour",
    slug: "golden-hour",
    description:
      "A photographer chases the perfect light and finds something she wasn't looking for.",
    synopsis:
      "Documentary photographer Cleo has spent her career chasing decisive moments in far-flung places. When an injury forces her to stay local, she begins photographing her own neighborhood at dusk — and slowly realizes the most revealing images have been waiting outside her window the entire time.",
    poster:
      "https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=800&q=80",
    streamId: "YOUR_STREAM_VIDEO_ID_5",
    runtime: "16 min",
    year: 2023,
    genre: "Drama",
    views: 18700,
    credits: [
      { role: "Director", name: "Your Name" },
      { role: "Writer", name: "Your Name" },
      { role: "Cinematography", name: "Cinematographer Name" },
      { role: "Lead", name: "Actor Name" },
    ],
  },
  {
    title: "Exit Interview",
    slug: "exit-interview",
    description:
      "A departing employee's final day takes an unexpectedly surreal turn.",
    synopsis:
      "On his last day at a company he's given eight years to, Marcus sits through a perfunctory exit interview with HR. But the questions keep arriving from people who aren't in the room, the office layout keeps shifting, and the elevator only goes down — floor after floor, long past where the building should end.",
    poster:
      "https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80",
    streamId: "YOUR_STREAM_VIDEO_ID_6",
    runtime: "13 min",
    year: 2022,
    genre: "Dark Comedy",
    views: 14300,
    credits: [
      { role: "Director", name: "Your Name" },
      { role: "Writer", name: "Your Name" },
      { role: "Production Design", name: "Designer Name" },
      { role: "Lead", name: "Actor Name" },
    ],
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
  return [...new Set(films.map((film) => film.genre))].sort();
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
