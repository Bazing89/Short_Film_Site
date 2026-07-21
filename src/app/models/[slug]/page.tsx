import type { Metadata } from "next";
import Link from "next/link";
import { ModelDetail } from "@/components/ModelDetail";
import {
  collectBuildModelSlugs,
  modelSearchPath,
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
  const title = `${entry.name} — Videos & Library`;
  const description = `Watch ${entry.name} videos in the BangHeroes library. Browse imported titles or search online to add more.`;
  const canonical = `/models/${encodeURIComponent(entry.slug)}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
    },
    keywords: [entry.name, `${entry.name} videos`, "model library", "BangHeroes"],
  };
}

export default async function ModelProfilePage({ params }: PageProps) {
  const { slug } = await params;
  const entry = resolveModelSeoEntry(slug);

  return (
    <>
      <section className="border-b border-cinema-border/40 bg-cinema-card/10 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-cinema-muted">
            Library page for{" "}
            <span className="font-medium text-cinema-text">{entry.name}</span>
          </p>
          <Link
            href={modelSearchPath(entry.slug)}
            className="text-cinema-accent transition-colors hover:text-cinema-accent-hover"
          >
            Search {entry.name} online →
          </Link>
        </div>
      </section>
      <ModelDetail slugFromRoute={entry.slug} />
    </>
  );
}
