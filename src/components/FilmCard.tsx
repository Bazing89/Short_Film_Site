import Link from "next/link";
import { isOutboundFilm, type Film } from "@/data/films";

interface FilmCardProps {
  film: Film;
}

export function FilmCard({ film }: FilmCardProps) {
  const outbound = isOutboundFilm(film);
  return (
    <Link
      href={`/play?id=${encodeURIComponent(film.streamId || film.slug)}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-cinema-border/50 bg-cinema-card transition-all duration-300 hover:border-cinema-accent/40 hover:shadow-lg hover:shadow-cinema-accent/5"
    >
      <div className="relative aspect-video overflow-hidden bg-cinema-dark">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={film.poster}
          alt={`${film.title} preview`}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-cinema-black/80 via-transparent to-transparent" />
        {outbound ? (
          <span className="absolute left-3 top-3 rounded bg-cinema-black/80 px-2 py-0.5 text-[10px] uppercase tracking-wide text-cinema-accent">
            External
          </span>
        ) : null}
        {film.runtime ? (
          <span className="absolute bottom-3 right-3 rounded bg-cinema-black/80 px-2 py-0.5 text-xs text-cinema-text">
            {film.runtime}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <h3 className="font-display text-lg leading-tight text-cinema-text transition-colors group-hover:text-cinema-accent sm:text-xl">
          {film.title}
        </h3>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-cinema-muted">
          {film.year ? <span>{film.year}</span> : null}
          {film.views ? (
            <>
              <span className="text-cinema-border">|</span>
              <span>{film.views.toLocaleString()} views</span>
            </>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
