import Link from "next/link";
import { isOutboundFilm, type Film } from "@/data/films";

interface VideoCardProps {
  film: Film;
}

export function VideoCard({ film }: VideoCardProps) {
  const outbound = isOutboundFilm(film);
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
        <div className="absolute inset-0 bg-gradient-to-t from-cinema-black/50 via-transparent to-transparent" />
        {outbound ? (
          <span className="absolute left-2 top-2 rounded bg-cinema-black/80 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-cinema-accent">
            External
          </span>
        ) : null}
        {film.runtime ? (
          <span className="absolute bottom-2 right-2 rounded bg-cinema-black/80 px-1.5 py-0.5 text-[10px] text-cinema-text">
            {film.runtime}
          </span>
        ) : null}
      </div>
      <p className="line-clamp-2 text-sm text-cinema-text transition-colors group-hover:text-cinema-accent">
        {film.title}
      </p>
    </Link>
  );
}
