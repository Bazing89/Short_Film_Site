import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { BackLink } from "@/components/PageHeader";
import { VideoPlayer } from "@/components/VideoPlayer";
import { CreditsList } from "@/components/CreditsList";
import { FilmCard } from "@/components/FilmCard";
import {
  films,
  getFilmBySlug,
  getRelatedFilms,
} from "@/data/films";

interface FilmPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return films.map((film) => ({ slug: film.slug }));
}

export async function generateMetadata({
  params,
}: FilmPageProps): Promise<Metadata> {
  const { slug } = await params;
  const film = getFilmBySlug(slug);

  if (!film) {
    return { title: "Film Not Found" };
  }

  return {
    title: film.title,
    description: film.description,
    openGraph: {
      title: film.title,
      description: film.description,
      images: [{ url: film.poster }],
    },
  };
}

export default async function FilmPage({ params }: FilmPageProps) {
  const { slug } = await params;
  const film = getFilmBySlug(slug);

  if (!film) {
    notFound();
  }

  const relatedFilms = getRelatedFilms(slug);

  return (
    <>
      <div className="relative h-48 overflow-hidden sm:h-64 lg:h-80">
        <Image
          src={film.poster}
          alt=""
          fill
          className="object-cover"
          priority
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-cinema-black via-cinema-black/60 to-cinema-black/30" />
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative -mt-16 sm:-mt-20">
          <BackLink href="/films" label="Back to films" />
        </div>

        <div className="mt-6 grid gap-10 lg:grid-cols-3 lg:gap-12">
          <div className="lg:col-span-2">
            <VideoPlayer film={film} />

            <div className="mt-8">
              <h1 className="font-display text-3xl text-cinema-text sm:text-4xl lg:text-5xl">
                {film.title}
              </h1>

              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-cinema-muted">
                <span>{film.year}</span>
                <span className="text-cinema-border">|</span>
                <span>{film.runtime}</span>
                <span className="text-cinema-border">|</span>
                <span className="rounded-full border border-cinema-border/60 px-3 py-1 text-cinema-accent">
                  {film.genre}
                </span>
              </div>

              <div className="mt-8">
                <h2 className="text-xs font-medium uppercase tracking-[0.2em] text-cinema-accent">
                  Synopsis
                </h2>
                <p className="mt-3 text-base leading-relaxed text-cinema-muted sm:text-lg">
                  {film.synopsis}
                </p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="sticky top-24">
              <h2 className="text-xs font-medium uppercase tracking-[0.2em] text-cinema-accent">
                Credits
              </h2>
              <div className="mt-4">
                <CreditsList credits={film.credits} />
              </div>
            </div>
          </div>
        </div>

        {relatedFilms.length > 0 && (
          <section className="mt-16 border-t border-cinema-border/50 py-16 sm:mt-20 sm:py-20">
            <h2 className="font-display text-2xl text-cinema-text sm:text-3xl">
              Related Films
            </h2>
            <p className="mt-2 text-sm text-cinema-muted">
              More films you might enjoy
            </p>

            <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {relatedFilms.map((related) => (
                <FilmCard key={related.slug} film={related} />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
