import type { Film } from "@/data/films";

export async function fetchFilms(): Promise<Film[]> {
  const res = await fetch("/api/films", { cache: "no-store" });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    films?: Film[];
    error?: string;
  };
  if (!res.ok || !data.ok) {
    throw new Error(
      data.error || `Failed to load films (${res.status})`
    );
  }
  return data.films ?? [];
}

export async function fetchFilm(id: string): Promise<Film | null> {
  const res = await fetch(`/api/films/${encodeURIComponent(id)}`, {
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    film?: Film;
    error?: string;
  };
  if (res.status === 404) return null;
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Failed to load film (${res.status})`);
  }
  return data.film ?? null;
}
