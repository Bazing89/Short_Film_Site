import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = {
  title: "About",
  description:
    "Learn about the filmmaker behind GirlCumXXX and the vision behind these original short films.",
};

export default function AboutPage() {
  return (
    <>
      <PageHeader
        title="About"
        subtitle="Stories told with intention, at the scale where every frame matters."
      />

      <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="prose-cinema space-y-6 text-base leading-relaxed text-cinema-muted">
          <p>
            GirlCumXXX is a personal showcase for original short films —
            intimate stories crafted with care, shot on real schedules, and made
            for audiences who appreciate cinema that takes its time.
          </p>

          <p>
            Each film on this site is a complete narrative experience: a world
            built in minutes, characters you can believe in, and endings that
            stay with you. No algorithms, no ads — just the work.
          </p>

          <h2 className="font-display text-xl text-cinema-text sm:text-2xl">
            The Filmmaker
          </h2>

          <p>
            Replace this section with your own bio. Talk about your background,
            what draws you to short-form storytelling, and what themes recur in
            your work. A few paragraphs is plenty — let the films speak for
            themselves.
          </p>

          <p>
            You might mention your process, the collaborators you work with, or
            festivals where your films have screened. Keep it personal and
            authentic.
          </p>

          <h2 className="font-display text-xl text-cinema-text sm:text-2xl">
            Watch Free
          </h2>

          <p>
            Every film on this site is available to stream at no cost. If
            something resonates with you, share it with someone who might need
            to see it.
          </p>

          <div className="pt-4">
            <Link
              href="/films"
              className="inline-flex items-center gap-2 text-sm uppercase tracking-widest text-cinema-accent transition-colors hover:text-cinema-accent-hover"
            >
              Browse the collection
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
                  d="M17 8l4 4m0 0l-4 4m4-4H3"
                />
              </svg>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
