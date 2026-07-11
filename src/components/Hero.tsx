import Image from "next/image";
import type { Film } from "@/data/films";
import { filmWatchPath } from "@/data/films";

interface HeroProps {
  film: Film;
}

export function Hero({ film }: HeroProps) {
  return (
    <section className="relative min-h-[70vh] overflow-hidden sm:min-h-[80vh]">
      <div className="absolute inset-0">
        <Image
          src={film.poster}
          alt=""
          fill
          className="object-cover"
          priority
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-cinema-black via-cinema-black/80 to-cinema-black/40" />
        <div className="absolute inset-0 bg-gradient-to-t from-cinema-black via-transparent to-cinema-black/30" />
      </div>

      <div className="relative mx-auto flex min-h-[70vh] max-w-7xl flex-col justify-center px-4 py-20 sm:min-h-[80vh] sm:px-6 lg:px-8">
        <p className="animate-fade-in-up text-xs font-medium uppercase tracking-[0.3em] text-cinema-accent sm:text-sm">
          Featured Film
        </p>

        <h1 className="animate-fade-in-up-delay font-display mt-4 max-w-3xl text-4xl leading-tight text-cinema-text sm:text-5xl lg:text-6xl">
          BangHeroes
        </h1>

        <p className="animate-fade-in-up-delay mt-4 max-w-xl text-base text-cinema-muted sm:text-lg">
          Original stories. Intimate scale. Cinema without compromise.
        </p>

        <div className="animate-fade-in-up-delay-2 mt-8 max-w-xl">
          <p className="font-display text-2xl text-cinema-text sm:text-3xl">
            {film.title}
          </p>
          <p className="mt-2 text-sm text-cinema-muted">
            {film.year} &middot; {film.runtime} &middot; {film.genre}
          </p>
          <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-cinema-muted sm:line-clamp-none">
            {film.description}
          </p>

          <a
            href={filmWatchPath(film)}
            className="mt-6 inline-flex items-center gap-2 rounded-sm bg-cinema-accent px-8 py-3 text-sm font-medium uppercase tracking-widest text-cinema-black transition-all hover:bg-cinema-accent-hover hover:shadow-lg hover:shadow-cinema-accent/20"
          >
            Watch Now
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}
