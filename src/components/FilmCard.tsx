import Link from "next/link";
import type { Film } from "@/data/films";

interface FilmCardProps {
  film: Film;
}

export function FilmCard({ film }: FilmCardProps) {
  return (
    <Link
      href={`/play?id=${encodeURIComponent(film.streamId || film.slug)}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-cinema-border/50 bg-cinema-card transition-all duration-300 hover:border-cinema-accent/40 hover:shadow-lg hover:shadow-cinema-accent/5"
    >
      <div className="relative aspect-[2/3] overflow-hidden bg-cinema-dark">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={film.poster}
          alt={`${film.title} poster`}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-cinema-black/80 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        <div className="absolute bottom-0 left-0 right-0 p-4 translate-y-2 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          <span className="text-xs font-medium uppercase tracking-wider text-cinema-accent">
            Watch Now
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <h3 className="font-display text-lg leading-tight text-cinema-text transition-colors group-hover:text-cinema-accent sm:text-xl">
          {film.title}
        </h3>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-cinema-muted">
          {film.year ? <span>{film.year}</span> : null}
          {film.runtime ? (
            <>
              <span className="text-cinema-border">|</span>
              <span>{film.runtime}</span>
            </>
          ) : null}
          {film.genre ? (
            <>
              <span className="text-cinema-border">|</span>
              <span className="rounded-full border border-cinema-border/60 px-2 py-0.5 text-cinema-accent">
                {film.genre}
              </span>
            </>
          ) : null}
        </div>

        {film.description ? (
          <p className="mt-3 line-clamp-2 flex-1 text-sm leading-relaxed text-cinema-muted">
            {film.description}
          </p>
        ) : null}
      </div>
    </Link>
  );
}
