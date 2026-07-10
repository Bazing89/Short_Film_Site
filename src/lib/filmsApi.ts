import type { Film } from "@/data/films";

export async function fetchFilms(): Promise<Film[]> {
  const res = await fetch("/api/films", { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to load films (${res.status})`);
  }
  const data = (await res.json()) as { ok?: boolean; films?: Film[]; error?: string };
  if (!data.ok) {
    throw new Error(data.error || "Failed to load films");
  }
  return data.films ?? [];
}

export async function fetchFilm(id: string): Promise<Film | null> {
  const res = await fetch(`/api/films/${encodeURIComponent(id)}`, {
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Failed to load film (${res.status})`);
  }
  const data = (await res.json()) as { ok?: boolean; film?: Film; error?: string };
  if (!data.ok || !data.film) return null;
  return data.film;
}
