import type { Metadata } from "next";
import { WatchContent } from "@/components/WatchContent";

interface PageProps {
  params: Promise<{ parts?: string[] }>;
}

/** Resolve video id from /watch/{id} or /watch/{title-slug}/{id} */
function idFromParts(parts?: string[]): string {
  if (!parts?.length) return "";
  try {
    return decodeURIComponent(parts[parts.length - 1] || "");
  } catch {
    return parts[parts.length - 1] || "";
  }
}

export function generateStaticParams() {
  // One shell page; Cloudflare Worker serves per-video SEO HTML in production.
  // Local `next dev` still matches /watch/* via this optional catch-all.
  return [{ parts: [] }];
}

export const metadata: Metadata = {
  title: "Watch",
  description: "Watch short films on BangHeroes.",
  robots: { index: true, follow: true },
};

export default async function WatchPage({ params }: PageProps) {
  const { parts } = await params;
  const id = idFromParts(parts);

  return <WatchContent id={id} />;
}
