import type { Metadata } from "next";
import Link from "next/link";
import { ModelSearchHome } from "@/components/ModelSearchHome";
import { modelDetailPath } from "@/data/models";
import {
  collectBuildModelSlugs,
  modelSearchDescription,
  modelSearchPath,
  modelSearchTitle,
  resolveModelSeoEntry,
} from "@/lib/modelSeo";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return collectBuildModelSlugs().map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const entry = resolveModelSeoEntry(slug);
  const title = modelSearchTitle(entry.name);
  const description = modelSearchDescription(entry.name);
  const canonical = modelSearchPath(entry.slug);

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
    },
    keywords: [
      entry.name,
      `${entry.name} videos`,
      "model search",
      "video import",
      "BangHeroes",
    ],
  };
}

export default async function ModelSearchSlugPage({ params }: PageProps) {
  const { slug } = await params;
  const entry = resolveModelSeoEntry(slug);

  return (
    <>
      <section className="border-b border-cinema-border/40 bg-cinema-card/20 px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cinema-accent">
            Model search tool
          </p>
          <h1 className="font-display mt-3 text-3xl leading-tight text-cinema-text sm:text-4xl">
            Find {entry.name} videos online
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-cinema-muted">
            {modelSearchDescription(entry.name)} Use the search below to scan
            tube sites, review library matches, and import new titles.
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            <Link href={`/?q=${encodeURIComponent(entry.name)}`} className="nav-pill">
              Open on home
            </Link>
            <Link href={modelDetailPath(entry.name)} className="nav-pill">
              {entry.name} library page
            </Link>
            <Link href="/search" className="nav-pill">
              All model searches
            </Link>
          </div>
        </div>
      </section>

      <ModelSearchHome initialQuery={entry.name} autoSearch />
    </>
  );
}
