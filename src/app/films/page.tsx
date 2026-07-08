import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { FilmCard } from "@/components/FilmCard";
import { films } from "@/data/films";

export const metadata: Metadata = {
  title: "Films",
  description: "Browse the complete collection of original short films.",
};

export default function FilmsPage() {
  return (
    <>
      <PageHeader
        title="Films"
        subtitle="A curated collection of original short films — each one a complete story, told with intention."
      />

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {films.map((film) => (
            <FilmCard key={film.slug} film={film} />
          ))}
        </div>
      </section>
    </>
  );
}
