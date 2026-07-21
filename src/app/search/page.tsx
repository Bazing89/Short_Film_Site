import type { Metadata } from "next";
import Link from "next/link";
import { ModelSearchHome } from "@/components/ModelSearchHome";
import {
  collectBuildModelSlugs,
  modelSearchPath,
} from "@/lib/modelSeo";

export const metadata: Metadata = {
  title: "Model Search Tool — Find & Import Videos Online",
  description:
    "Search performers across tube sites, browse matches already in the BangHeroes library, and import new video links for everyone to watch.",
  alternates: { canonical: "/search" },
  openGraph: {
    title: "Model Search Tool — Find & Import Videos Online",
    description:
      "Search performers across tube sites, browse library matches, and import new videos on BangHeroes.",
    url: "/search",
  },
  keywords: [
    "model search",
    "performer search",
    "video import",
    "tube search",
    "BangHeroes",
  ],
};

export default function SearchToolPage() {
  const featuredModels = collectBuildModelSlugs().slice(0, 36);

  return (
    <>
      <section className="border-b border-cinema-border/40 bg-cinema-card/20 px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cinema-accent">
            Free model search tool
          </p>
          <h1 className="font-display mt-3 text-3xl leading-tight text-cinema-text sm:text-4xl">
            Search models online and import videos to the library
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-cinema-muted">
            BangHeroes lets you search performer names across popular tube sites,
            see what is already in the shared library, and import new links with
            thumbnails so others can browse and watch them here.
          </p>
          <ul className="mt-6 grid gap-3 text-sm text-cinema-muted sm:grid-cols-3">
            <li className="glass-card rounded-xl px-4 py-3">
              <strong className="block text-cinema-text">Multi-site search</strong>
              Query XVideos, Pornhub, XNXX, and more in one place.
            </li>
            <li className="glass-card rounded-xl px-4 py-3">
              <strong className="block text-cinema-text">Library matches</strong>
              Instantly see videos already imported for that model.
            </li>
            <li className="glass-card rounded-xl px-4 py-3">
              <strong className="block text-cinema-text">One-click import</strong>
              Add selected results to the catalog for everyone.
            </li>
          </ul>
        </div>
      </section>

      <ModelSearchHome />

      {featuredModels.length > 0 ? (
        <section className="border-t border-cinema-border/40 bg-cinema-black px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <h2 className="font-display text-2xl text-cinema-text sm:text-3xl">
              Popular model searches
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-cinema-muted">
              Dedicated search pages for performers in the catalog. Each page
              runs a live search and shows library matches.
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              {featuredModels.map((entry) => (
                <Link
                  key={entry.slug}
                  href={modelSearchPath(entry.slug)}
                  className="rounded-full bg-cinema-card/80 px-4 py-2 text-sm text-cinema-text ring-1 ring-cinema-border transition-colors hover:text-cinema-accent hover:ring-cinema-accent/40"
                >
                  {entry.name}
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
