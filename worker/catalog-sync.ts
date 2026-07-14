/**
 * Cloud-safe catalog sync: scrape FPO / Playvids newest listings → outbound KV.
 * Used by admin “Sync new” and Cloudflare Cron (runs without your computer on).
 */

export type OutboundRecord = {
  id: string;
  title: string;
  sourceUrl: string;
  posterUrl?: string;
  actor?: string;
  site?: string;
  dateAdded?: string;
};

export type ScrapedItem = {
  title: string;
  url: string;
  site: string;
  poster?: string;
};

export type SyncResult = {
  ok: boolean;
  added: number;
  skipped: number;
  pages: number;
  sites: string[];
  count: number;
  error?: string;
  log: string[];
  finishedAt: string;
  trigger: "cron" | "admin" | "manual";
};

export type SyncStatus = {
  enabled: boolean;
  lastRun?: SyncResult;
  updatedAt?: string;
};

export const SYNC_STATUS_KV_KEY = "catalog-sync-status";
export const SYNC_ENABLED_KV_KEY = "catalog-sync-enabled";
export const SYNC_STOP_KV_KEY = "catalog-sync-stop";

const PLAYVIDS_SKIP_PREFIXES = [
  "/account/",
  "/categories/",
  "/channels/",
  "/pornstars/",
  "/pornstar/",
  "/tags/",
  "/search",
  "/videos",
];

const USER_AGENT =
  "Mozilla/5.0 (compatible; BangHeroesCatalogBot/1.0; +https://bangheroes.com)";

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

function slugTitle(pathOrUrl: string): string {
  const path = pathOrUrl.replace(/\/+$/, "").split("/").pop() || "";
  const slug = decodeURIComponent(path.replace(/[_+]+/g, " "));
  return cleanVideoTitle(slug) || "Untitled";
}

export function normalizeSourceUrl(url: string): string {
  const raw = (url || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return raw.replace(/\/+$/, "");
    }
    let host = parsed.hostname.toLowerCase();
    if (host.startsWith("www.")) host = host.slice(4);
    let path = parsed.pathname || "/";
    path = path.replace(/\/{2,}/g, "/");
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    const drop = new Set([
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid",
    ]);
    const params = new URLSearchParams(parsed.search);
    for (const key of [...params.keys()]) {
      if (drop.has(key.toLowerCase())) params.delete(key);
    }
    const qs = params.toString();
    return `${parsed.protocol}//${host}${path}${qs ? `?${qs}` : ""}`;
  } catch {
    return raw.replace(/\/+$/, "");
  }
}

export function outboundIdFromUrl(sourceUrl: string): string {
  let hash = 2166136261;
  for (let i = 0; i < sourceUrl.length; i++) {
    hash ^= sourceUrl.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `out_${(hash >>> 0).toString(16).padStart(8, "0")}`;
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
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }
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

function playvidsPathOk(path: string): boolean {
  const clean = path.split("?")[0];
  if (PLAYVIDS_SKIP_PREFIXES.some((p) => clean.startsWith(p))) return false;
  const parts = clean.replace(/^\/+|\/+$/g, "").split("/");
  return parts.length >= 2 && parts[0].length >= 6;
}

export function parseFpo(html: string, limit = 100): ScrapedItem[] {
  let pairs: Array<[string, string]> = [];
  const titled = [
    ...html.matchAll(
      /href="(https?:\/\/(?:www\.)?fpo\.xxx\/video\/\d+\/[^"]+\/)"[^>]*title="([^"]+)"/gi
    ),
  ];
  if (titled.length) {
    pairs = titled.map((m) => [m[1], m[2]]);
  } else {
    const urls = [
      ...html.matchAll(
        /href="(https?:\/\/(?:www\.)?fpo\.xxx\/video\/\d+\/[^"]+\/)"/gi
      ),
    ];
    pairs = urls.map((m) => [m[1], slugTitle(m[1])]);
  }

  const thumbMap = new Map<string, string>();
  for (const m of html.matchAll(
    /href="(https?:\/\/(?:www\.)?fpo\.xxx\/video\/\d+\/[^"]+\/)"[^>]*>[\s\S]{0,600}?src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/gi
  )) {
    const key = m[1].split("?")[0];
    if (!thumbMap.has(key)) thumbMap.set(key, m[2]);
  }

  const out: ScrapedItem[] = [];
  const seen = new Set<string>();
  for (const [rawUrl, title] of pairs) {
    const url = rawUrl.split("?")[0];
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({
      title: cleanVideoTitle(decodeHtmlEntities(title)) || slugTitle(url),
      url,
      site: "fpo",
      poster: thumbMap.get(url) || "",
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function parsePlayvids(html: string, limit = 100): ScrapedItem[] {
  let pairs: Array<[string, string]> = [];
  const cardTitles = [
    ...html.matchAll(
      /<h5 class="card-title">\s*<a href="(\/[A-Za-z0-9]{8,14}\/[^"]+)">([^<]+)<\/a>/gi
    ),
  ];
  if (cardTitles.length) {
    pairs = cardTitles.map((m) => [m[1], m[2]]);
  } else {
    const altPairs = [
      ...html.matchAll(
        /href="(\/[A-Za-z0-9]{8,14}\/[^"]+)"[^>]*>[\s\S]*?alt="([^"]+)"/gi
      ),
    ];
    if (altPairs.length) {
      pairs = altPairs.map((m) => [m[1], m[2]]);
    } else {
      const paths = [
        ...html.matchAll(/href="(\/[A-Za-z0-9]{8,14}\/[^"]+)"/gi),
      ];
      pairs = paths.map((m) => [m[1], slugTitle(m[1])]);
    }
  }

  const thumbMap = new Map<string, string>();
  for (const m of html.matchAll(
    /href="(\/[A-Za-z0-9]{8,14}\/[^"]+)"[^>]*>\s*<img[^>]+src="(https?:\/\/[^"]+)"/gi
  )) {
    const key = m[1].split("?")[0];
    if (!thumbMap.has(key)) thumbMap.set(key, m[2]);
  }
  for (const m of html.matchAll(
    /href="(\/[A-Za-z0-9]{8,14}\/[^"]+)"[^>]*>[\s\S]*?src="(https?:\/\/[^"]+)"/gi
  )) {
    const key = m[1].split("?")[0];
    if (!thumbMap.has(key)) thumbMap.set(key, m[2]);
  }

  const out: ScrapedItem[] = [];
  const seen = new Set<string>();
  for (const [rawPath, title] of pairs) {
    const path = rawPath.split("?")[0];
    if (!playvidsPathOk(path)) continue;
    const full = `https://www.playvids.com${path}`;
    if (seen.has(full)) continue;
    seen.add(full);
    const cleaned = decodeHtmlEntities(title).trim();
    if (["playvids", "video"].includes(cleaned.toLowerCase())) continue;
    out.push({
      title: cleanVideoTitle(cleaned) || slugTitle(path),
      url: full,
      site: "playvids",
      poster: thumbMap.get(path) || "",
    });
    if (out.length >= limit) break;
  }
  return out;
}

async function scrapeFpoPage(page: number): Promise<ScrapedItem[]> {
  const url =
    page <= 1
      ? "https://www.fpo.xxx/new-1/"
      : `https://www.fpo.xxx/new-1/${page}/`;
  const html = await fetchHtml(url);
  return parseFpo(html, 100);
}

async function scrapePlayvidsPage(page: number): Promise<ScrapedItem[]> {
  const url = `https://www.playvids.com/?page=${Math.max(1, page)}`;
  const html = await fetchHtml(url);
  return parsePlayvids(html, 100);
}

const SCRAPERS: Record<string, (page: number) => Promise<ScrapedItem[]>> = {
  fpo: scrapeFpoPage,
  playvids: scrapePlayvidsPage,
};

const SITE_LABELS: Record<string, string> = {
  fpo: "MyFPO",
  playvids: "Playvids",
};

function mergeOutbound(
  existing: OutboundRecord[],
  items: ScrapedItem[]
): { merged: OutboundRecord[]; added: number; skipped: number } {
  const byId = new Map<string, OutboundRecord>();
  const existingUrls = new Set<string>();
  for (const r of existing) {
    byId.set(r.id, r);
    const u = normalizeSourceUrl(r.sourceUrl);
    if (u) existingUrls.add(u);
  }

  let added = 0;
  let skipped = 0;
  const batchSeen = new Set<string>();

  for (const item of items) {
    const sourceUrl = normalizeSourceUrl(item.url);
    if (!sourceUrl) continue;
    if (batchSeen.has(sourceUrl)) {
      skipped += 1;
      continue;
    }
    batchSeen.add(sourceUrl);

    const id = outboundIdFromUrl(sourceUrl);
    if (byId.has(id) || existingUrls.has(sourceUrl)) {
      skipped += 1;
      continue;
    }

    const record: OutboundRecord = {
      id,
      title: cleanVideoTitle(item.title || sourceUrl),
      sourceUrl,
      posterUrl: (item.poster || "").trim() || undefined,
      site: item.site || undefined,
      dateAdded: new Date().toISOString(),
    };
    byId.set(id, record);
    existingUrls.add(sourceUrl);
    added += 1;
  }

  return { merged: [...byId.values()], added, skipped };
}

export type CatalogSyncEnv = {
  OUTBOUND?: KVNamespace;
};

export async function runCatalogSync(
  env: CatalogSyncEnv,
  options: {
    sites?: string[];
    maxPages?: number;
    untilCaughtUp?: boolean;
    existing: OutboundRecord[];
    trigger: SyncResult["trigger"];
  }
): Promise<{ result: SyncResult; films: OutboundRecord[] }> {
  const log: string[] = [];
  const chosen = (options.sites?.length
    ? options.sites
    : ["fpo", "playvids"]
  ).filter((s) => s in SCRAPERS);
  const maxPages = Math.max(1, Math.min(20, options.maxPages ?? 5));
  const untilCaughtUp = options.untilCaughtUp !== false;

  if (env.OUTBOUND) {
    await env.OUTBOUND.delete(SYNC_STOP_KV_KEY);
  }

  if (!env.OUTBOUND) {
    const result: SyncResult = {
      ok: false,
      added: 0,
      skipped: 0,
      pages: 0,
      sites: chosen,
      count: options.existing.length,
      error: "OUTBOUND KV binding is missing",
      log: ["OUTBOUND KV binding is missing"],
      finishedAt: new Date().toISOString(),
      trigger: options.trigger,
    };
    return { result, films: options.existing };
  }

  if (chosen.length === 0) {
    const result: SyncResult = {
      ok: false,
      added: 0,
      skipped: 0,
      pages: 0,
      sites: [],
      count: options.existing.length,
      error: "No valid sites selected",
      log: ["No valid sites selected"],
      finishedAt: new Date().toISOString(),
      trigger: options.trigger,
    };
    return { result, films: options.existing };
  }

  const shouldStop = async () => {
    const v = await env.OUTBOUND!.get(SYNC_STOP_KV_KEY);
    return v === "1" || v === "true";
  };

  let films = options.existing;
  let totalAdded = 0;
  let totalSkipped = 0;
  let pagesDone = 0;
  let stopped = false;

  try {
    for (const site of chosen) {
      if (await shouldStop()) {
        log.push("Import stopped by user.");
        stopped = true;
        break;
      }
      const label = SITE_LABELS[site] || site;
      const mode = untilCaughtUp
        ? "until caught up"
        : `up to ${maxPages} pages`;
      log.push(`=== Importing ${label} (${mode}) ===`);

      let emptyStreak = 0;
      for (let page = 1; page <= maxPages; page++) {
        if (await shouldStop()) {
          log.push("Import stopped by user.");
          stopped = true;
          break;
        }
        log.push(`  [${label}] page ${page}/${maxPages}…`);
        let items: ScrapedItem[];
        try {
          items = await SCRAPERS[site](page);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          log.push(`  [${label}] page ${page} failed: ${msg}`);
          emptyStreak += 1;
          if (emptyStreak >= 3) break;
          continue;
        }

        if (!items.length) {
          emptyStreak += 1;
          log.push(`  [${label}] page ${page}: no videos`);
          if (emptyStreak >= 3) {
            log.push(`  [${label}] stopping after empty pages`);
            break;
          }
          continue;
        }

        emptyStreak = 0;
        pagesDone += 1;
        const { merged, added, skipped } = mergeOutbound(films, items);
        films = merged;
        totalAdded += added;
        totalSkipped += skipped;
        log.push(
          `  [${label}] page ${page}: +${added} new, ${skipped} duplicate(s)`
        );

        // Persist after each page so partial progress survives timeouts
        await env.OUTBOUND.put("outbound-films", JSON.stringify(films));

        if (untilCaughtUp && added === 0 && skipped > 0) {
          log.push(
            `  [${label}] caught up — page ${page} had no new links. Stopping.`
          );
          break;
        }
      }
      if (stopped) break;
    }

    log.push(
      `Import finished. Added ${totalAdded}, skipped ${totalSkipped}, pages ${pagesDone}. Catalog size: ${films.length}`
    );

    const result: SyncResult = {
      ok: true,
      added: totalAdded,
      skipped: totalSkipped,
      pages: pagesDone,
      sites: chosen,
      count: films.length,
      log,
      finishedAt: new Date().toISOString(),
      trigger: options.trigger,
    };
    return { result, films };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.push(`Sync failed: ${message}`);
    const result: SyncResult = {
      ok: false,
      added: totalAdded,
      skipped: totalSkipped,
      pages: pagesDone,
      sites: chosen,
      count: films.length,
      error: message,
      log,
      finishedAt: new Date().toISOString(),
      trigger: options.trigger,
    };
    return { result, films };
  }
}

export async function requestCatalogSyncStop(env: CatalogSyncEnv): Promise<void> {
  if (!env.OUTBOUND) return;
  await env.OUTBOUND.put(SYNC_STOP_KV_KEY, "1");
}

export async function loadSyncStatus(env: CatalogSyncEnv): Promise<SyncStatus> {
  if (!env.OUTBOUND) {
    return { enabled: false };
  }
  const enabledRaw = await env.OUTBOUND.get(SYNC_ENABLED_KV_KEY);
  // Default on when unset — cron is configured to run
  const enabled = enabledRaw == null ? true : enabledRaw === "1" || enabledRaw === "true";
  const raw = await env.OUTBOUND.get(SYNC_STATUS_KV_KEY);
  if (!raw) return { enabled };
  try {
    const parsed = JSON.parse(raw) as SyncStatus;
    return { ...parsed, enabled };
  } catch {
    return { enabled };
  }
}

export async function saveSyncStatus(
  env: CatalogSyncEnv,
  status: SyncStatus
): Promise<void> {
  if (!env.OUTBOUND) return;
  await env.OUTBOUND.put(
    SYNC_STATUS_KV_KEY,
    JSON.stringify({ ...status, updatedAt: new Date().toISOString() })
  );
  await env.OUTBOUND.put(
    SYNC_ENABLED_KV_KEY,
    status.enabled ? "1" : "0"
  );
}
