/**
 * Actor video search across tube sites → outbound link candidates.
 */

import { parseFpo, parsePlayvids, type ScrapedItem } from "./catalog-sync";

export type SearchResult = ScrapedItem & {
  id?: string;
  actor?: string;
  error?: boolean;
};

const USER_AGENT =
  "Mozilla/5.0 (compatible; BangHeroesCatalogBot/1.0; +https://bangheroes.com)";

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) =>
      String.fromCharCode(parseInt(h, 16))
    );
}

function cleanVideoTitle(raw: string): string {
  let title = (raw || "").trim();
  title = title.replace(/^.*[\\/]/, "");
  title = title.replace(/\.(mp4|mov|mkv|webm|m4v|avi)$/i, "");
  title = title.replace(/\s*\[[^\]]*\]\s*$/g, "");
  title = title.replace(/\s*\(\d+\)\s*$/g, "");
  title = title.replace(/[\s._-]+\d{3,}\s*$/g, "");
  title = title.replace(/\s+\d+\s*$/g, "");
  title = title.replace(/[\s._-]+$/g, "").replace(/\s{2,}/g, " ").trim();
  return title || (raw || "").trim() || "Untitled";
}

function slugTitle(pathOrUrl: string): string {
  const path = pathOrUrl.replace(/\/+$/, "").split("/").pop() || "";
  const slug = decodeURIComponent(path.replace(/[_+]+/g, " "));
  return cleanVideoTitle(slug) || "Untitled";
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "text/html,application/xhtml+xml",
      "accept-language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const html = await res.text();
  if (
    /cf-browser-verification|just a moment|challenge-platform|cf-challenge/i.test(
      html
    )
  ) {
    throw new Error(`Cloudflare challenge blocked ${url}`);
  }
  return html;
}

function parseXvideos(html: string, limit: number): SearchResult[] {
  let pairs: Array<[string, string]> = [];
  const titled = [
    ...html.matchAll(/href="(\/video\.[^"]+)"[^>]*title="([^"]+)"/gi),
  ];
  if (titled.length) {
    pairs = titled.map((m) => [m[1], m[2]]);
  } else {
    pairs = [...html.matchAll(/href="(\/video\.[^"]+)"/gi)].map((m) => [
      m[1],
      slugTitle(m[1]),
    ]);
  }
  const thumbMap = new Map<string, string>();
  for (const m of html.matchAll(
    /href="(\/video\.[^"]+)"[^>]*>[\s\S]{0,500}?data-src="(https?:\/\/[^"]+)"/gi
  )) {
    if (!thumbMap.has(m[1])) thumbMap.set(m[1], m[2]);
  }
  for (const m of html.matchAll(
    /data-src="(https?:\/\/[^"]+)"[^>]*>[\s\S]{0,500}?href="(\/video\.[^"]+)"/gi
  )) {
    if (!thumbMap.has(m[2])) thumbMap.set(m[2], m[1]);
  }
  const out: SearchResult[] = [];
  const seen = new Set<string>();
  for (const [path, title] of pairs) {
    const url = `https://www.xvideos.com${path}`;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({
      id: path,
      title: decodeHtmlEntities(title).trim() || slugTitle(path),
      url,
      site: "xvideos",
      poster: thumbMap.get(path) || "",
    });
    if (out.length >= limit) break;
  }
  return out;
}

function parseXnxx(html: string, limit: number): SearchResult[] {
  let pairs: Array<[string, string]> = [];
  const titled = [
    ...html.matchAll(/href="(\/video-[^"]+)"[^>]*title="([^"]+)"/gi),
  ];
  if (titled.length) {
    pairs = titled.map((m) => [m[1], m[2]]);
  } else {
    pairs = [...html.matchAll(/href="(\/video-[^"]+)"/gi)].map((m) => [
      m[1],
      slugTitle(m[1]),
    ]);
  }
  const thumbMap = new Map<string, string>();
  for (const m of html.matchAll(
    /href="(\/video-[^"]+)"[^>]*>[\s\S]{0,500}?data-src="(https?:\/\/[^"]+)"/gi
  )) {
    if (!thumbMap.has(m[1])) thumbMap.set(m[1], m[2]);
  }
  const out: SearchResult[] = [];
  const seen = new Set<string>();
  for (const [path, title] of pairs) {
    const url = `https://www.xnxx.com${path}`;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({
      id: path,
      title: decodeHtmlEntities(title).trim() || slugTitle(path),
      url,
      site: "xnxx",
      poster: thumbMap.get(path) || "",
    });
    if (out.length >= limit) break;
  }
  return out;
}

function parsePornhub(html: string, limit: number): SearchResult[] {
  const pairs = [
    ...html.matchAll(
      /href="(\/view_video\.php\?viewkey=[^"&]+)"[^>]*title="([^"]+)"/gi
    ),
  ].map((m) => [m[1], m[2]] as [string, string]);
  const thumbMap = new Map<string, string>();
  for (const m of html.matchAll(
    /href="(\/view_video\.php\?viewkey=[^"&]+)"[^>]*>[\s\S]{0,800}?data-mediumthumb="(https?:\/\/[^"]+)"/gi
  )) {
    const key = m[1].split("&")[0];
    if (!thumbMap.has(key)) thumbMap.set(key, m[2]);
  }
  const out: SearchResult[] = [];
  const seen = new Set<string>();
  for (const [rawPath, title] of pairs) {
    const path = rawPath.split("&")[0];
    const url = `https://www.pornhub.com${path}`;
    if (seen.has(url)) continue;
    seen.add(url);
    const cleaned = decodeHtmlEntities(title).trim();
    if (["pornhub", "video"].includes(cleaned.toLowerCase())) continue;
    out.push({
      id: path,
      title: cleaned || path,
      url,
      site: "pornhub",
      poster: thumbMap.get(path) || "",
    });
    if (out.length >= limit) break;
  }
  return out;
}

function parseEporner(html: string, limit: number): SearchResult[] {
  let pairs: Array<[string, string]> = [];
  const titled = [
    ...html.matchAll(
      /<p class="mbtit"><a href="(\/video-[^"]+)">([^<]+)<\/a>/gi
    ),
  ];
  if (titled.length) {
    pairs = titled.map((m) => [m[1], m[2]]);
  } else {
    pairs = [...html.matchAll(/href="(\/video-[^"]+)"/gi)].map((m) => [
      m[1],
      slugTitle(m[1]),
    ]);
  }
  const thumbMap = new Map<string, string>();
  for (const m of html.matchAll(
    /href="(\/video-[^"]+)"[^>]*><img src="(https?:\/\/[^"]+)"/gi
  )) {
    const key = m[1].split("?")[0];
    if (!thumbMap.has(key)) thumbMap.set(key, m[2]);
  }
  const out: SearchResult[] = [];
  const seen = new Set<string>();
  for (const [rawPath, title] of pairs) {
    const path = rawPath.split("?")[0];
    const url = `https://www.eporner.com${path}`;
    if (seen.has(url)) continue;
    seen.add(url);
    const cleaned = decodeHtmlEntities(title).trim();
    if (["eporner", "video"].includes(cleaned.toLowerCase())) continue;
    out.push({
      id: path,
      title: cleaned || slugTitle(path),
      url,
      site: "eporner",
      poster: thumbMap.get(path) || "",
    });
    if (out.length >= limit) break;
  }
  return out;
}

const SEARCH_SOURCES: Record<
  string,
  { label: string; url: (q: string) => string; parse: (html: string, limit: number) => SearchResult[] }
> = {
  xvideos: {
    label: "XVideos",
    url: (q) => `https://www.xvideos.com/?k=${encodeURIComponent(q)}`,
    parse: parseXvideos,
  },
  xnxx: {
    label: "XNXX",
    url: (q) => `https://www.xnxx.com/search/${encodeURIComponent(q)}`,
    parse: parseXnxx,
  },
  pornhub: {
    label: "Pornhub",
    url: (q) =>
      `https://www.pornhub.com/video/search?search=${encodeURIComponent(q)}`,
    parse: parsePornhub,
  },
  fpo: {
    label: "MyFPO",
    url: (q) => `https://www.fpo.xxx/search/${encodeURIComponent(q)}/`,
    parse: (html, limit) => parseFpo(html, limit),
  },
  eporner: {
    label: "Eporner",
    url: (q) => `https://www.eporner.com/search/${encodeURIComponent(q)}/`,
    parse: parseEporner,
  },
  playvids: {
    label: "Playvids",
    url: (q) => `https://www.playvids.com/search?q=${encodeURIComponent(q)}`,
    parse: (html, limit) => parsePlayvids(html, limit),
  },
};

export const SEARCH_SOURCE_KEYS = Object.keys(SEARCH_SOURCES);

export async function searchActorVideos(
  actorName: string,
  sources?: string[],
  limitPerSource = 24
): Promise<{ results: SearchResult[]; log: string[] }> {
  const actor = (actorName || "").trim();
  const log: string[] = [];
  if (!actor) throw new Error("Actor name is required");

  const limit = Math.max(1, Math.min(60, limitPerSource));
  const chosen = (sources?.length ? sources : SEARCH_SOURCE_KEYS).filter(
    (k) => k in SEARCH_SOURCES
  );

  const results: SearchResult[] = [];
  const seen = new Set<string>();

  for (const key of chosen) {
    const source = SEARCH_SOURCES[key];
    const searchUrl = source.url(actor);
    log.push(`Searching ${source.label}…`);
    try {
      const html = await fetchHtml(searchUrl);
      const found = source.parse(html, limit);
      let added = 0;
      for (const item of found) {
        if (!item.url || seen.has(item.url)) continue;
        seen.add(item.url);
        results.push({ ...item, actor });
        added += 1;
      }
      log.push(`  ${source.label}: ${added} result(s)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.push(`  ${source.label} failed: ${msg}`);
      results.push({
        id: `error:${key}`,
        title: `Search failed on ${source.label}: ${msg}`,
        url: "",
        site: key,
        error: true,
      });
    }
  }

  const ok = results.filter((r) => !r.error);
  const errors = results.filter((r) => r.error);
  return { results: [...ok, ...errors], log };
}
