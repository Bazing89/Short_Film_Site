import Link from "next/link";
import type { Film } from "@/data/films";

interface VideoCardProps {
  film: Film;
}

export function VideoCard({ film }: VideoCardProps) {
  return (
    <Link
      href={`/play?id=${encodeURIComponent(film.streamId || film.slug)}`}
      className="group flex w-full flex-col gap-2"
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-md border border-cinema-border/50 bg-cinema-card transition-colors group-hover:border-cinema-accent/40">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={film.poster}
          alt={film.title}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-cinema-black/20 opacity-0 transition-opacity group-hover:opacity-100">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-cinema-accent/90">
            <svg
              className="h-5 w-5 text-cinema-black"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </div>
      <p className="truncate text-sm text-cinema-text transition-colors group-hover:text-cinema-accent">
        {film.title}
      </p>
    </Link>
  );
}
