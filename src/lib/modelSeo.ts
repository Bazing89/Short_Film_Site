import fs from "fs";
import path from "path";
import { modelSlug } from "@/data/models";

export type ModelSeoEntry = {
  slug: string;
  name: string;
};

export function displayNameFromSlug(slug: string): string {
  return slug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function modelSearchPath(nameOrSlug: string): string {
  const slug = nameOrSlug.includes("-")
    ? nameOrSlug.toLowerCase()
    : modelSlug(nameOrSlug);
  return `/search/${encodeURIComponent(slug)}`;
}

let cachedBuildModelSlugs: ModelSeoEntry[] | null = null;

/** Collect model slugs for static generation (build time). */
export function collectBuildModelSlugs(): ModelSeoEntry[] {
  if (cachedBuildModelSlugs) return cachedBuildModelSlugs;
  const bySlug = new Map<string, string>();

  function remember(name: string, slug?: string) {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    const key = (slug || modelSlug(trimmed)).toLowerCase();
    if (!key || key === "model") return;
    if (!bySlug.has(key)) bySlug.set(key, trimmed);
  }

  const root = process.cwd();
  const candidates = [
    path.join(root, "public", "models.json"),
    path.join(root, "public", "outbound-films.json"),
    path.join(root, "out", "outbound-films.json"),
  ];

  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      if (!Array.isArray(data)) continue;
      for (const item of data) {
        if (item && typeof item === "object") {
          const record = item as Record<string, unknown>;
          if (typeof record.name === "string") {
            remember(record.name, String(record.slug || ""));
          }
          if (typeof record.actor === "string") {
            remember(record.actor);
          }
        }
      }
    } catch {
      /* ignore malformed JSON at build */
    }
  }

  cachedBuildModelSlugs = [...bySlug.entries()]
    .map(([slug, name]) => ({ slug, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return cachedBuildModelSlugs;
}

export function resolveModelSeoEntry(slug: string): ModelSeoEntry {
  const normalized = decodeURIComponent(slug || "")
    .trim()
    .toLowerCase();
  const fromBuild = collectBuildModelSlugs().find(
    (entry) => entry.slug === normalized
  );
  if (fromBuild) return fromBuild;
  return { slug: normalized, name: displayNameFromSlug(normalized) };
}

export function modelSearchTitle(name: string): string {
  return `Find ${name} Videos — Model Search & Import`;
}

export function modelSearchDescription(name: string): string {
  return `Search ${name} videos online across tube sites, browse titles already in the BangHeroes library, and import new links for others to watch.`;
}
