import Link from "next/link";
import Image from "next/image";
import type { Film } from "@/data/films";

interface VideoCardProps {
  film: Film;
}

export function VideoCard({ film }: VideoCardProps) {
  return (
    <Link
      href={`/films/${film.slug}`}
      className="group flex w-full flex-col gap-2"
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-md border border-cinema-border/50 bg-cinema-card transition-colors group-hover:border-cinema-accent/40">
        <Image
          src={film.poster}
          alt=""
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-cinema-black/20 opacity-0 transition-opacity group-hover:opacity-100">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-cinema-accent/90">
            <svg className="h-5 w-5 text-cinema-black" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </div>
      <p className="truncate text-sm text-cinema-text transition-colors group-hover:text-cinema-accent">
        xxx
      </p>
    </Link>
  );
}
