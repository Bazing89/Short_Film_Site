/**
 * Import model names + posters into Cloudflare KV (site-models).
 */

export type SiteModelRecord = {
  id: string;
  name: string;
  slug: string;
  poster: string;
  profileUrl?: string;
  sourceSite?: string;
  dateAdded?: string;
};

export type ScrapedModel = {
  name: string;
  poster?: string;
  profileUrl?: string;
  sourceSite?: string;
};

export const MODELS_KV_KEY = "site-models";
export const MODELS_STOP_KV_KEY = "models-import-stop";

export const INDEXXX_GIRLCUM_MODELS =
  "https://www.indexxx.com/websites/10182/girlcum.com/models";

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

export function modelSlugFromName(name: string): string {
  const slug = (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "model";
}

export function modelIdForProfile(profileUrl: string, name = ""): string {
  try {
    const parts = new URL(profileUrl).pathname
      .replace(/\/+$/, "")
      .split("/")
      .filter(Boolean);
    if (parts.length) return parts[parts.length - 1].slice(0, 80);
  } catch {
    /* ignore */
  }
  return modelSlugFromName(name) || "model";
}

function normalizeModelName(name: string): string {
  return (name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function modelRecordKeys(record: SiteModelRecord): Set<string> {
  const keys = new Set<string>();
  const profile = (record.profileUrl || "").replace(/\/+$/, "");
  if (profile) keys.add(`url:${profile}`);
  const slug = record.slug || modelSlugFromName(record.name || "");
  if (slug) keys.add(`slug:${slug.toLowerCase()}`);
  const name = normalizeModelName(record.name || "");
  if (name) keys.add(`name:${name}`);
  const id = (record.id || "").trim().toLowerCase();
  if (id) keys.add(`id:${id}`);
  return keys;
}

function modelItemDedupeKeys(item: ScrapedModel): Set<string> {
  const name = (item.name || "").trim();
  const profile = (item.profileUrl || "").replace(/\/+$/, "");
  const slug = modelSlugFromName(name);
  const keys = new Set<string>();
  if (profile) keys.add(`url:${profile}`);
  if (slug) keys.add(`slug:${slug.toLowerCase()}`);
  const norm = normalizeModelName(name);
  if (norm) keys.add(`name:${norm}`);
  return keys;
}

export function mergeModelRecords(
  existing: SiteModelRecord[],
  scraped: ScrapedModel[],
  now: string
): { merged: SiteModelRecord[]; added: number; skipped: number } {
  const seenKeys = new Set<string>();
  const merged: SiteModelRecord[] = [];

  for (const record of existing) {
    for (const k of modelRecordKeys(record)) seenKeys.add(k);
    merged.push(record);
  }

  let added = 0;
  let skipped = 0;
  for (const item of scraped) {
    const name = (item.name || "").trim();
    if (!name) continue;
    const profileRaw = (item.profileUrl || "").trim();
    const profileUrl = profileRaw
      ? profileRaw.replace(/\/+$/, "") + "/"
      : "";
    const record: SiteModelRecord = {
      id: profileUrl
        ? modelIdForProfile(profileUrl, name)
        : modelSlugFromName(name),
      name,
      slug: modelSlugFromName(name),
      poster: (item.poster || "").trim(),
      profileUrl: profileUrl || undefined,
      sourceSite: (item.sourceSite || "").trim() || undefined,
      dateAdded: now,
    };
    const keys = modelRecordKeys(record);
    let overlap = false;
    for (const k of keys) {
      if (seenKeys.has(k)) {
        overlap = true;
        break;
      }
    }
    if (overlap) {
      skipped += 1;
      for (let i = 0; i < merged.length; i++) {
        const existingKeys = modelRecordKeys(merged[i]);
        let hit = false;
        for (const k of keys) {
          if (existingKeys.has(k)) {
            hit = true;
            break;
          }
        }
        if (!hit) continue;
        const updated = { ...merged[i] };
        if (record.poster) updated.poster = record.poster;
        if (record.sourceSite && !updated.sourceSite) {
          updated.sourceSite = record.sourceSite;
        }
        merged[i] = updated;
        break;
      }
      continue;
    }
    for (const k of keys) seenKeys.add(k);
    merged.push(record);
    added += 1;
  }

  merged.sort((a, b) =>
    (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase())
  );
  return { merged, added, skipped };
}

export function normalizeModelsListUrl(listUrl: string): string {
  const raw = (listUrl || "").trim();
  if (!raw) return raw;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = parsed.pathname.toLowerCase().replace(/\/+$/, "");
    if (
      host.endsWith("girlcum.com") &&
      (path.endsWith("/models") || path.endsWith("/model") || path === "")
    ) {
      return INDEXXX_GIRLCUM_MODELS;
    }
  } catch {
    /* ignore */
  }
  return raw;
}

function indexxxSourceSiteFromUrl(listUrl: string): string {
  const match = listUrl.match(/\/websites\/\d+\/([^/]+)\//i);
  return match ? match[1].toLowerCase() : "indexxx.com";
}

function indexxxCompanionListUrl(listUrl: string): string | null {
  try {
    const parsed = new URL(listUrl);
    if (!parsed.hostname.toLowerCase().includes("indexxx.com")) return null;
    const path = parsed.pathname.replace(/\/+$/, "");
    if (/\/models2$/i.test(path)) return null;
    if (/\/models$/i.test(path)) {
      return `${parsed.origin}${path}2/`;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function modelsListingPageUrl(listUrl: string, page: number): string | null {
  try {
    const parsed = new URL(listUrl.trim());
    const path = parsed.pathname.replace(/\/+$/, "");
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");

    if (page <= 1) return listUrl.trim();

    if (host.includes("indexxx.com")) {
      if (/\/models2$/i.test(path)) return null;
      if (/\/models$/i.test(path)) {
        return `${parsed.origin}${path}/${page}/`;
      }
    }

    if (host.includes("fpo.xxx")) {
      // /models/ → /models/2/
      if (/\/models$/i.test(path)) {
        return `${parsed.origin}${path}/${page}/`;
      }
    }

    parsed.searchParams.set("page", String(page));
    return parsed.toString();
  } catch {
    return null;
  }
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

function isCloudflareChallenge(html: string): boolean {
  return /cf-browser-verification|just a moment|challenge-platform|cf-challenge/i.test(
    html
  );
}

function indexxxModelNameFromPath(path: string): string {
  const slug = decodeURIComponent(
    path.replace(/\/+$/, "").split("/").pop() || ""
  );
  return slug.replace(/[_+]+/g, " ").replace(/\s{2,}/g, " ").trim();
}

export function parseIndexxxModelsPage(
  html: string,
  baseUrl: string,
  limit: number,
  sourceSite = "girlcum.com"
): ScrapedModel[] {
  let origin = "";
  try {
    const parsed = new URL(baseUrl);
    origin = parsed.origin;
  } catch {
    origin = "https://www.indexxx.com";
  }

  const thumbMap = new Map<string, string>();
  for (const m of html.matchAll(
    /href="([^"]*\/models\/[^"#?]+)"[^>]*>[\s\S]{0,1200}?<img[^>]+(?:src|data-src)="([^"]+)"/gi
  )) {
    let key = m[1].startsWith("http") ? m[1] : origin + m[1];
    key = key.split("?")[0].split("#")[0].replace(/\/+$/, "");
    if (!key.toLowerCase().includes("/models/")) continue;
    if (!thumbMap.has(key)) thumbMap.set(key, decodeHtmlEntities(m[2].trim()));
  }
  for (const m of html.matchAll(
    /<img[^>]+(?:src|data-src)="([^"]+)"[^>]*>[\s\S]{0,400}?href="([^"]*\/models\/[^"#?]+)"/gi
  )) {
    let key = m[2].startsWith("http") ? m[2] : origin + m[2];
    key = key.split("?")[0].split("#")[0].replace(/\/+$/, "");
    if (!thumbMap.has(key)) thumbMap.set(key, decodeHtmlEntities(m[1].trim()));
  }

  const pairs: Array<[string, string]> = [];
  for (const m of html.matchAll(
    /href="([^"]*\/models\/[^"#?]+)"[^>]*>([^<]{2,100})</gi
  )) {
    pairs.push([m[1], decodeHtmlEntities(m[2].trim())]);
  }
  for (const m of html.matchAll(/href="([^"]*\/models\/[^"#?]+)"/gi)) {
    pairs.push([m[1], ""]);
  }

  const skipSlugs = new Set([
    "models",
    "models2",
    "top",
    "new",
    "popular",
    "search",
    "websites",
    "sets",
  ]);

  const out: ScrapedModel[] = [];
  const seen = new Set<string>();
  for (const [href, label] of pairs) {
    let profileUrl = href.startsWith("http") ? href : origin + href;
    profileUrl = profileUrl.split("?")[0].split("#")[0];
    const lower = profileUrl.toLowerCase();
    if (lower.includes("/websites/")) continue;
    if (!/\/models\/[^/]+\/?$/i.test(lower)) continue;
    const slug = profileUrl.replace(/\/+$/, "").split("/").pop() || "";
    if (skipSlugs.has(slug.toLowerCase()) || /^\d+$/.test(slug)) continue;
    profileUrl = profileUrl.replace(/\/+$/, "") + "/";
    if (seen.has(profileUrl)) continue;
    seen.add(profileUrl);

    let name = label.replace(/\s*\(\d+\)\s*$/, "").trim();
    if (!name) name = indexxxModelNameFromPath(profileUrl);
    if (!name || skipSlugs.has(name.toLowerCase())) continue;

    out.push({
      name,
      poster: thumbMap.get(profileUrl.replace(/\/+$/, "")) || "",
      profileUrl,
      sourceSite,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function parseFpoModelsPage(html: string, limit: number): ScrapedModel[] {
  const pairs = [
    ...html.matchAll(
      /<a class="item" href="(https?:\/\/[^"]+\/models\/[^"]+)"[^>]*title="([^"]+)"/gi
    ),
  ];
  const thumbMap = new Map<string, string>();
  for (const m of html.matchAll(
    /<a class="item" href="(https?:\/\/[^"]+\/models\/[^"]+)"[^>]*>[\s\S]*?<img class="thumb" src="([^"]+)"/gi
  )) {
    const key = m[1].split("?")[0].replace(/\/+$/, "");
    if (!thumbMap.has(key)) thumbMap.set(key, m[2]);
  }

  const out: ScrapedModel[] = [];
  const seen = new Set<string>();
  for (const m of pairs) {
    let profileUrl = m[1].split("?")[0].replace(/\/+$/, "") + "/";
    if (seen.has(profileUrl)) continue;
    seen.add(profileUrl);
    const name = decodeHtmlEntities(m[2]).trim();
    if (!name) continue;
    out.push({
      name,
      poster: thumbMap.get(profileUrl.replace(/\/+$/, "")) || "",
      profileUrl,
      sourceSite: "fpo.xxx",
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function parseGenericModelsPage(
  html: string,
  baseUrl: string,
  limit: number
): ScrapedModel[] {
  let origin = "";
  let host = "";
  try {
    const parsed = new URL(baseUrl);
    origin = parsed.origin;
    host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return [];
  }

  const pairs: Array<[string, string]> = [];
  for (const m of html.matchAll(
    /href="((?:https?:\/\/[^"]+)?\/(?:models|model|pornstars|pornstar|actress)\/[^"#?]+\/?)"/gi
  )) {
    const path = m[1].startsWith("http") ? m[1] : origin + m[1];
    pairs.push([path, ""]);
  }

  const thumbMap = new Map<string, string>();
  for (const m of html.matchAll(
    /href="([^"]+\/(?:models|model|pornstars|pornstar|actress)\/[^"]+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/gi
  )) {
    let key = m[1].split("?")[0].replace(/\/+$/, "");
    if (!key.startsWith("http")) key = origin + key;
    if (!thumbMap.has(key)) thumbMap.set(key, m[2]);
  }

  const out: ScrapedModel[] = [];
  const seen = new Set<string>();
  for (const [raw, ] of pairs) {
    let profileUrl = raw.split("?")[0].replace(/\/+$/, "") + "/";
    if (seen.has(profileUrl)) continue;
    const slug = profileUrl.replace(/\/+$/, "").split("/").pop() || "";
    if (
      ["models", "model", "pornstars", "pornstar", "actress", "top", "new"].includes(
        slug.toLowerCase()
      )
    ) {
      continue;
    }
    seen.add(profileUrl);
    const name = indexxxModelNameFromPath(profileUrl);
    if (!name) continue;
    out.push({
      name,
      poster: thumbMap.get(profileUrl.replace(/\/+$/, "")) || "",
      profileUrl,
      sourceSite: host,
    });
    if (out.length >= limit) break;
  }
  return out;
}

type KvEnv = { OUTBOUND?: KVNamespace };

export async function loadSiteModelsFromKv(
  env: KvEnv
): Promise<SiteModelRecord[]> {
  if (!env.OUTBOUND) return [];
  try {
    const raw = await env.OUTBOUND.get(MODELS_KV_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as unknown;
    return Array.isArray(data) ? (data as SiteModelRecord[]) : [];
  } catch {
    return [];
  }
}

export async function saveSiteModels(
  env: KvEnv,
  records: SiteModelRecord[]
): Promise<boolean> {
  if (!env.OUTBOUND) return false;
  await env.OUTBOUND.put(MODELS_KV_KEY, JSON.stringify(records));
  return true;
}

export async function setModelsImportStop(
  env: KvEnv,
  stop: boolean
): Promise<void> {
  if (!env.OUTBOUND) return;
  if (stop) await env.OUTBOUND.put(MODELS_STOP_KV_KEY, "1");
  else await env.OUTBOUND.delete(MODELS_STOP_KV_KEY);
}

async function shouldStop(env: KvEnv): Promise<boolean> {
  if (!env.OUTBOUND) return false;
  const v = await env.OUTBOUND.get(MODELS_STOP_KV_KEY);
  return v === "1" || v === "true";
}

export async function scrapeModelsListing(
  env: KvEnv,
  listUrl: string,
  maxPages: number,
  log: string[]
): Promise<ScrapedModel[]> {
  listUrl = normalizeModelsListUrl(listUrl);
  if (!listUrl) throw new Error("Models listing URL is required");
  let parsed: URL;
  try {
    parsed = new URL(listUrl);
  } catch {
    throw new Error("Enter a valid http(s) models listing URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Enter a valid http(s) models listing URL");
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const pages = Math.max(1, Math.min(20, maxPages));
  const found: ScrapedModel[] = [];
  const seenKeys = new Set<string>();

  const remember = (item: ScrapedModel): boolean => {
    const keys = modelItemDedupeKeys(item);
    for (const k of keys) {
      if (seenKeys.has(k)) {
        if (item.poster) {
          for (const existing of found) {
            const ek = modelItemDedupeKeys(existing);
            let hit = false;
            for (const kk of keys) {
              if (ek.has(kk)) {
                hit = true;
                break;
              }
            }
            if (hit && !existing.poster) {
              existing.poster = item.poster;
              break;
            }
          }
        }
        return false;
      }
    }
    for (const k of keys) seenKeys.add(k);
    found.push(item);
    return true;
  };

  if (host.includes("indexxx.com")) {
    const sourceSite = indexxxSourceSiteFromUrl(listUrl);
    const urlsToCrawl = [listUrl];
    const companion = indexxxCompanionListUrl(listUrl);
    if (companion) {
      urlsToCrawl.push(companion);
      log.push("  Also crawling Indexxx models2 roster for complete names…");
    }

    for (const crawlUrl of urlsToCrawl) {
      if (await shouldStop(env)) {
        log.push("Model import stopped by user.");
        return found;
      }
      const isModels2 = /\/models2/i.test(new URL(crawlUrl).pathname);
      const pageLimit = isModels2 ? 1 : pages;
      for (let page = 1; page <= pageLimit; page++) {
        if (await shouldStop(env)) {
          log.push("Model import stopped by user.");
          return found;
        }
        const pageUrl = modelsListingPageUrl(crawlUrl, page);
        if (!pageUrl) break;
        log.push(`  Fetching Indexxx page ${page}: ${pageUrl}`);
        try {
          const html = await fetchHtml(pageUrl);
          const batch = parseIndexxxModelsPage(
            html,
            pageUrl,
            2000,
            sourceSite
          );
          if (!batch.length) {
            log.push(`  Page ${page}: no models found`);
            break;
          }
          let added = 0;
          for (const item of batch) {
            if (remember(item)) added += 1;
          }
          log.push(`  Page ${page}: found ${added} new model(s)`);
          if (added === 0) break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          log.push(`  Page ${page} failed: ${msg}`);
          if (page === 1 && crawlUrl === listUrl) throw err;
          break;
        }
      }
    }
    return found;
  }

  for (let page = 1; page <= pages; page++) {
    if (await shouldStop(env)) {
      log.push("Model import stopped by user.");
      break;
    }
    const pageUrl = modelsListingPageUrl(listUrl, page);
    if (!pageUrl) break;
    log.push(`  Fetching models page ${page}: ${pageUrl}`);
    try {
      const html = await fetchHtml(pageUrl);
      const batch = host.includes("fpo.xxx")
        ? parseFpoModelsPage(html, 500)
        : parseGenericModelsPage(html, listUrl, 500);
      if (!batch.length) {
        log.push(`  Page ${page}: no models found`);
        break;
      }
      let added = 0;
      for (const item of batch) {
        if (remember(item)) added += 1;
      }
      log.push(`  Page ${page}: found ${added} new model(s)`);
      if (added === 0) break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.push(`  Page ${page} failed: ${msg}`);
      if (page === 1) throw err;
      break;
    }
  }

  return found;
}

export async function importModelsFromUrl(
  env: KvEnv,
  listUrl: string,
  maxPages: number,
  existing: SiteModelRecord[]
): Promise<{
  added: number;
  skipped: number;
  scraped: number;
  total: number;
  synced: boolean;
  sourceUrl: string;
  models: SiteModelRecord[];
  log: string[];
}> {
  const log: string[] = [];
  await setModelsImportStop(env, false);
  const normalized = normalizeModelsListUrl(listUrl);
  const scraped = await scrapeModelsListing(env, normalized, maxPages, log);
  if (!scraped.length) {
    return {
      added: 0,
      skipped: 0,
      scraped: 0,
      total: existing.length,
      synced: false,
      sourceUrl: normalized,
      models: existing,
      log,
    };
  }
  const now = new Date().toISOString();
  const { merged, added, skipped } = mergeModelRecords(existing, scraped, now);
  const synced = await saveSiteModels(env, merged);
  log.push(`Saved ${merged.length} model(s) to KV`);
  return {
    added,
    skipped,
    scraped: scraped.length,
    total: merged.length,
    synced,
    sourceUrl: normalized,
    models: merged,
    log,
  };
}

export async function importModelsFromHtml(
  env: KvEnv,
  html: string,
  listUrl: string,
  existing: SiteModelRecord[]
): Promise<{
  added: number;
  skipped: number;
  scraped: number;
  total: number;
  synced: boolean;
  sourceUrl: string;
  models: SiteModelRecord[];
  log: string[];
}> {
  const log: string[] = [];
  const trimmed = (html || "").trim();
  if (!trimmed) throw new Error("Paste the models page HTML first");
  if (isCloudflareChallenge(trimmed)) {
    throw new Error(
      "That HTML is still the Cloudflare challenge page. Wait until the real models list loads, then paste again."
    );
  }

  const normalized = normalizeModelsListUrl(listUrl || INDEXXX_GIRLCUM_MODELS);
  let host = "";
  try {
    host = new URL(normalized).hostname.toLowerCase();
  } catch {
    host = "";
  }

  let scraped: ScrapedModel[];
  if (host.includes("indexxx.com")) {
    scraped = parseIndexxxModelsPage(
      trimmed,
      normalized,
      5000,
      indexxxSourceSiteFromUrl(normalized)
    );
  } else if (host.includes("fpo.xxx")) {
    scraped = parseFpoModelsPage(trimmed, 5000);
  } else {
    scraped = parseGenericModelsPage(trimmed, normalized, 5000);
  }

  if (!scraped.length) {
    return {
      added: 0,
      skipped: 0,
      scraped: 0,
      total: existing.length,
      synced: false,
      sourceUrl: normalized,
      models: existing,
      log: ["No models found in pasted HTML"],
    };
  }

  const now = new Date().toISOString();
  const { merged, added, skipped } = mergeModelRecords(existing, scraped, now);
  const synced = await saveSiteModels(env, merged);
  log.push(`Parsed ${scraped.length} model(s) from pasted HTML`);
  log.push(`Saved ${merged.length} model(s) to KV`);
  return {
    added,
    skipped,
    scraped: scraped.length,
    total: merged.length,
    synced,
    sourceUrl: normalized,
    models: merged,
    log,
  };
}

export async function upsertModelFromActorSearch(
  env: KvEnv,
  actorName: string,
  results: Array<{ url?: string; poster?: string; site?: string; error?: boolean }>,
  existing: SiteModelRecord[]
): Promise<{ added: number; skipped: number; total: number; models: SiteModelRecord[]; log: string[] }> {
  const log: string[] = [];
  const actor = (actorName || "").trim();
  const valid = results.filter((r) => r.url && !r.error);
  if (!actor || !valid.length) {
    return { added: 0, skipped: 0, total: existing.length, models: existing, log };
  }

  let poster = "";
  for (const r of valid) {
    if (r.poster) {
      poster = r.poster;
      break;
    }
  }
  const sites = [
    ...new Set(
      valid.map((r) => (r.site || "").trim()).filter(Boolean)
    ),
  ].sort();
  const item: ScrapedModel = {
    name: actor,
    poster,
    profileUrl: "",
    sourceSite: sites.length === 1 ? sites[0] : sites.join(","),
  };

  const now = new Date().toISOString();
  const { merged, added, skipped } = mergeModelRecords(existing, [item], now);
  await saveSiteModels(env, merged);
  if (added) {
    log.push(
      poster
        ? `Added model “${actor}” with thumbnail to site Models page.`
        : `Added model “${actor}” to site Models page (no thumbnail found).`
    );
  } else if (skipped) {
    log.push(`Model “${actor}” already on site Models page.`);
  }
  return { added, skipped, total: merged.length, models: merged, log };
}
