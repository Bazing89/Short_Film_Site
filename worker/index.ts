/**
 * Cloudflare Worker: static site + public films API + /api/admin/* Bunny queue.
 *
 * Secrets: ADMIN_PASSWORD, BUNNY_API_KEY
 *   - Prefer Worker runtime secrets when available
 *   - Also accepts values baked in at build time via scripts/inject-build-env.mjs
 *     (Cloudflare Build environment variables)
 * Vars: BUNNY_LIBRARY_ID, BUNNY_COLLECTION_ID, BUNNY_CDN_HOSTNAME (optional)
 */

import { BUILD_SECRETS } from "./generated-secrets";

export interface Env {
  ASSETS: Fetcher;
  ADMIN_PASSWORD?: string;
  BUNNY_API_KEY?: string;
  BUNNY_LIBRARY_ID: string;
  BUNNY_COLLECTION_ID?: string;
  BUNNY_CDN_HOSTNAME?: string;
  /** Optional KV for live outbound catalog updates without redeploy */
  OUTBOUND?: KVNamespace;
}

type BunnyVideo = {
  guid: string;
  title: string;
  status: number;
  encodeProgress?: number;
  length?: number;
  dateUploaded?: string;
  views?: number;
  thumbnailFileName?: string;
  thumbnailUrl?: string;
  collectionId?: string;
};

type Film = {
  title: string;
  slug: string;
  description: string;
  synopsis: string;
  poster: string;
  streamId: string;
  embedUrl: string;
  runtime: string;
  year: number;
  genre: string;
  views: number;
  credits: [];
  dateUploaded?: string;
  kind?: "bunny" | "outbound";
  sourceUrl?: string;
};

type OutboundRecord = {
  id: string;
  title: string;
  sourceUrl: string;
  posterUrl?: string;
  actor?: string;
  site?: string;
  dateAdded?: string;
};

const SESSION_COOKIE = "admin_session";
const DEFAULT_COLLECTION = "98f0b8d8-336d-4ab9-9c2c-513c29815305";
const PLACEHOLDER_POSTER =
  "https://images.unsplash.com/photo-1485846234645-a62644f84728?w=800&q=80";
const OUTBOUND_KV_KEY = "outbound-films";

function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=60",
      ...headers,
    },
  });
}

function jsonFresh(data: unknown, status = 200): Response {
  return json(data, status, { "cache-control": "no-store" });
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sessionToken(password: string): Promise<string> {
  return sha256Hex(`admin-session:${password}`);
}

function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(";").map((part) => {
      const [k, ...rest] = part.trim().split("=");
      return [k, decodeURIComponent(rest.join("=") || "")];
    })
  );
}

async function isAuthed(request: Request, env: Env): Promise<boolean> {
  const expected = await sessionToken(getAdminPassword(env));
  const cookies = parseCookies(request.headers.get("cookie"));
  if (cookies[SESSION_COOKIE] === expected) return true;
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ") && auth.slice(7) === expected) return true;
  return false;
}

function getBunnyApiKey(env: Env): string {
  return (env.BUNNY_API_KEY || BUILD_SECRETS.BUNNY_API_KEY || "").trim();
}

function getAdminPassword(env: Env): string {
  return (env.ADMIN_PASSWORD || BUILD_SECRETS.ADMIN_PASSWORD || "7777").trim();
}

function requireConfig(env: Env): string | null {
  if (!env.BUNNY_LIBRARY_ID) return "BUNNY_LIBRARY_ID is not configured";
  if (!getBunnyApiKey(env)) {
    return "BUNNY_API_KEY is not configured. Set Cloudflare Build variable BUNNY_API_KEY (encrypted), then redeploy.";
  }
  return null;
}

function collectionId(env: Env): string {
  return env.BUNNY_COLLECTION_ID || DEFAULT_COLLECTION;
}

/** Filename → display title: strip .mp4 and trailing arbitrary numbers/IDs */
function cleanVideoTitle(raw: string): string {
  let title = (raw || "").trim();
  title = title.replace(/^.*[\\/]/, "");
  title = title.replace(/\.(mp4|mov|mkv|webm|m4v|avi)$/i, "");
  title = title.replace(/\s*\[[^\]]*\]\s*$/g, "");
  title = title.replace(/\s*\(\d+\)\s*$/g, "");
  title = title.replace(/[\s._-]+\d{3,}\s*$/g, "");
  title = title.replace(/\s+\d+\s*$/g, "");
  title = title.replace(/[\s._-]+$/g, "").replace(/\s{2,}/g, " ").trim();
  return title || raw.trim() || "Untitled";
}

function formatRuntime(seconds?: number): string {
  if (!seconds || seconds <= 0) return "";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function titleFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const name = decodeURIComponent(path.split("/").filter(Boolean).pop() || "");
    return cleanVideoTitle(name) || url;
  } catch {
    return url;
  }
}

function mapBunnyStatus(status?: number, encodeProgress?: number) {
  if (status === 4) return { status: "finished" as const, progress: 100 };
  if (status === 5 || status === 6) return { status: "failed" as const, progress: 0 };
  const progress =
    typeof encodeProgress === "number"
      ? Math.max(5, Math.min(99, encodeProgress))
      : status === 3
        ? 60
        : status === 2
          ? 35
          : status === 1
            ? 20
            : 10;
  return { status: "processing" as const, progress };
}

function posterFor(env: Env, video: BunnyVideo): string {
  // Served via Worker proxy so Bunny referrer/hotlink rules don't blank the cards
  return `/api/thumbnail/${video.guid}`;
}

function bunnyThumbnailSource(env: Env, video: BunnyVideo): string {
  if (video.thumbnailUrl) return video.thumbnailUrl;
  const host = (env.BUNNY_CDN_HOSTNAME || "")
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  const file = video.thumbnailFileName || "thumbnail.jpg";
  if (host) return `https://${host}/${video.guid}/${file}`;
  return "";
}

function toFilm(env: Env, video: BunnyVideo): Film {
  const title = cleanVideoTitle(video.title || video.guid);
  const year = video.dateUploaded
    ? new Date(video.dateUploaded).getFullYear()
    : new Date().getFullYear();
  return {
    title,
    slug: video.guid,
    description: title,
    synopsis: title,
    poster: posterFor(env, video) || PLACEHOLDER_POSTER,
    streamId: video.guid,
    embedUrl: `https://player.mediadelivery.net/embed/${env.BUNNY_LIBRARY_ID}/${video.guid}`,
    runtime: formatRuntime(video.length),
    year,
    genre: "",
    views: video.views ?? 0,
    credits: [],
    dateUploaded: video.dateUploaded,
    kind: "bunny",
  };
}

function outboundPoster(record: OutboundRecord): string {
  const raw = (record.posterUrl || "").trim();
  if (!raw) return PLACEHOLDER_POSTER;
  if (raw.startsWith("/api/")) return raw;
  return `/api/poster?u=${encodeURIComponent(raw)}`;
}

function toOutboundFilm(record: OutboundRecord): Film {
  const title = cleanVideoTitle(record.title || record.sourceUrl);
  const year = record.dateAdded
    ? new Date(record.dateAdded).getFullYear()
    : new Date().getFullYear();
  return {
    title,
    slug: record.id,
    description: record.actor
      ? `${title} — featuring ${record.actor}`
      : title,
    synopsis: record.actor
      ? `${title} — featuring ${record.actor}`
      : title,
    poster: outboundPoster(record),
    streamId: record.id,
    embedUrl: "",
    runtime: "",
    year,
    genre: record.site || "link",
    views: 0,
    credits: [],
    dateUploaded: record.dateAdded,
    kind: "outbound",
    sourceUrl: record.sourceUrl,
  };
}

async function loadOutboundFromAssets(request: Request, env: Env): Promise<OutboundRecord[]> {
  try {
    const assetUrl = new URL("/outbound-films.json", request.url);
    const res = await env.ASSETS.fetch(new Request(assetUrl.toString()));
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    return Array.isArray(data) ? (data as OutboundRecord[]) : [];
  } catch {
    return [];
  }
}

async function loadOutboundFilms(request: Request, env: Env): Promise<OutboundRecord[]> {
  if (env.OUTBOUND) {
    try {
      const raw = await env.OUTBOUND.get(OUTBOUND_KV_KEY);
      if (raw) {
        const data = JSON.parse(raw) as unknown;
        if (Array.isArray(data)) return data as OutboundRecord[];
      }
    } catch {
      // fall through to assets
    }
  }
  return loadOutboundFromAssets(request, env);
}

async function saveOutboundFilms(env: Env, records: OutboundRecord[]): Promise<boolean> {
  if (!env.OUTBOUND) return false;
  await env.OUTBOUND.put(OUTBOUND_KV_KEY, JSON.stringify(records));
  return true;
}

function outboundIdFromUrl(sourceUrl: string): string {
  // Stable short id from normalized URL
  let hash = 2166136261;
  for (let i = 0; i < sourceUrl.length; i++) {
    hash ^= sourceUrl.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `out_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function normalizeSourceUrl(url: string): string {
  const raw = (url || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return raw.replace(/\/+$/, "");
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

async function bunnyFetch(env: Env, url: string, title?: string) {
  const fetchUrl = new URL(
    `https://video.bunnycdn.com/library/${env.BUNNY_LIBRARY_ID}/videos/fetch`
  );
  fetchUrl.searchParams.set("collectionId", collectionId(env));

  const res = await fetch(fetchUrl.toString(), {
    method: "POST",
    headers: {
      AccessKey: getBunnyApiKey(env),
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({ url, ...(title ? { title } : {}) }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    message?: string;
    statusCode?: number;
    id?: string;
  };

  return {
    ok: res.ok && data.success !== false,
    id: data.id,
    message: data.message || (res.ok ? "OK" : `HTTP ${res.status}`),
    statusCode: data.statusCode ?? res.status,
  };
}

async function bunnyGetVideo(env: Env, videoId: string): Promise<BunnyVideo | null> {
  const res = await fetch(
    `https://video.bunnycdn.com/library/${env.BUNNY_LIBRARY_ID}/videos/${videoId}`,
    {
      headers: {
        AccessKey: getBunnyApiKey(env),
        accept: "application/json",
      },
    }
  );
  if (!res.ok) return null;
  return (await res.json()) as BunnyVideo;
}

/** Paginate through every video in the configured collection (no hard limit). */
async function bunnyListCollectionVideos(env: Env): Promise<BunnyVideo[]> {
  const items: BunnyVideo[] = [];
  let page = 1;
  const itemsPerPage = 100;
  const collection = collectionId(env);

  while (true) {
    const url = new URL(
      `https://video.bunnycdn.com/library/${env.BUNNY_LIBRARY_ID}/videos`
    );
    url.searchParams.set("page", String(page));
    url.searchParams.set("itemsPerPage", String(itemsPerPage));
    url.searchParams.set("orderBy", "date");
    url.searchParams.set("collection", collection);

    const res = await fetch(url.toString(), {
      headers: {
        AccessKey: getBunnyApiKey(env),
        accept: "application/json",
      },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `Bunny list failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`
      );
    }

    const data = (await res.json()) as {
      items?: BunnyVideo[];
      totalItems?: number;
      currentPage?: number;
    };
    const batch = data.items ?? [];
    items.push(...batch);

    if (batch.length < itemsPerPage) break;
    if (data.totalItems != null && items.length >= data.totalItems) break;
    page += 1;
    if (page > 200) break; // safety valve
  }

  return items;
}

async function handlePublicFilmsApi(
  request: Request,
  env: Env,
  pathname: string
): Promise<Response> {
  if (request.method !== "GET") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  const outboundRecords = await loadOutboundFilms(request, env);
  const outboundFilms = outboundRecords.map(toOutboundFilm);

  try {
    if (pathname === "/api/films") {
      let bunnyFilms: Film[] = [];
      const configError = requireConfig(env);
      if (!configError) {
        try {
          const videos = await bunnyListCollectionVideos(env);
          bunnyFilms = videos
            .filter((v) => v.status === 4)
            .map((v) => toFilm(env, v));
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Bunny list failed";
          // Still return outbound catalog if Bunny is down
          return jsonFresh({
            ok: true,
            count: outboundFilms.length,
            warning: message,
            collectionId: collectionId(env),
            films: outboundFilms,
          });
        }
      }

      const films = [...bunnyFilms, ...outboundFilms];
      return jsonFresh({
        ok: true,
        count: films.length,
        collectionId: collectionId(env),
        films,
      });
    }

    if (pathname.startsWith("/api/films/")) {
      const id = decodeURIComponent(pathname.replace("/api/films/", ""));

      const outbound = outboundRecords.find((r) => r.id === id);
      if (outbound) {
        return jsonFresh({ ok: true, film: toOutboundFilm(outbound) });
      }

      const configError = requireConfig(env);
      if (configError) {
        return jsonFresh({ ok: false, error: configError }, 500);
      }

      const video = await bunnyGetVideo(env, id);
      if (!video) return jsonFresh({ ok: false, error: "Not found" }, 404);

      const expectedCollection = collectionId(env);
      if (video.collectionId && video.collectionId !== expectedCollection) {
        return jsonFresh({ ok: false, error: "Not found" }, 404);
      }
      if (video.status !== 4) {
        return jsonFresh({ ok: false, error: "Video is still processing" }, 404);
      }

      return jsonFresh({ ok: true, film: toFilm(env, video) });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown films API error";
    return json({ ok: false, error: message, films: [] }, 500);
  }

  return json({ ok: false, error: "Not found" }, 404);
}

async function handleAdminApi(
  request: Request,
  env: Env,
  pathname: string
): Promise<Response> {
  if (pathname === "/api/admin/login" && request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as { password?: string };
    const password = getAdminPassword(env);
    if (body.password !== password) {
      return json({ ok: false, error: "Invalid password" }, 401);
    }
    const token = await sessionToken(password);
    return json(
      { ok: true, token },
      200,
      {
        "set-cookie": `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`,
      }
    );
  }

  if (pathname === "/api/admin/logout" && request.method === "POST") {
    return json(
      { ok: true },
      200,
      {
        "set-cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
      }
    );
  }

  if (pathname === "/api/admin/session" && request.method === "GET") {
    return json({ ok: true, authenticated: await isAuthed(request, env) });
  }

  if (!(await isAuthed(request, env))) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  const configError = requireConfig(env);

  if (pathname === "/api/admin/queue" && request.method === "POST") {
    if (configError) return json({ ok: false, error: configError }, 500);

    const body = (await request.json().catch(() => ({}))) as {
      urls?: string[];
      url?: string;
    };
    const urls = (body.urls ?? (body.url ? [body.url] : []))
      .map((u) => u.trim())
      .filter(Boolean);

    if (urls.length === 0) {
      return json({ ok: false, error: "Provide at least one URL" }, 400);
    }

    const jobs = [];
    for (const url of urls) {
      const title = titleFromUrl(url);
      const result = await bunnyFetch(env, url, title);
      jobs.push({
        id: crypto.randomUUID(),
        url,
        title,
        bunnyVideoId: result.id,
        status: result.ok && result.id ? "processing" : "failed",
        progress: result.ok && result.id ? 15 : 0,
        message: result.message,
        createdAt: new Date().toISOString(),
      });
    }

    return json({ ok: true, jobs });
  }

  if (pathname === "/api/admin/history" && request.method === "GET") {
    if (configError) return json({ ok: false, error: configError, library: [] }, 500);

    const items = await bunnyListCollectionVideos(env);
    const library = items.map((item) => {
      const mapped = mapBunnyStatus(item.status, item.encodeProgress);
      return {
        bunnyVideoId: item.guid,
        title: cleanVideoTitle(item.title),
        status: mapped.status,
        progress: mapped.progress,
        length: item.length,
        dateUploaded: item.dateUploaded,
        embedUrl: `https://player.mediadelivery.net/embed/${env.BUNNY_LIBRARY_ID}/${item.guid}`,
      };
    });

    return json({ ok: true, library });
  }

  if (pathname.startsWith("/api/admin/status/") && request.method === "GET") {
    if (configError) return json({ ok: false, error: configError }, 500);
    const videoId = pathname.replace("/api/admin/status/", "");
    const video = await bunnyGetVideo(env, videoId);
    if (!video) return json({ ok: false, error: "Video not found" }, 404);
    const mapped = mapBunnyStatus(video.status, video.encodeProgress);
    return json({
      ok: true,
      bunnyVideoId: videoId,
      title: cleanVideoTitle(video.title || ""),
      ...mapped,
      encodeProgress: video.encodeProgress ?? mapped.progress,
      bunnyStatus: video.status,
    });
  }

  if (pathname === "/api/admin/outbound" && request.method === "GET") {
    const records = await loadOutboundFilms(request, env);
    return json({ ok: true, films: records, kv: Boolean(env.OUTBOUND) });
  }

  if (pathname === "/api/admin/outbound" && request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as {
      films?: OutboundRecord[];
      replace?: boolean;
    };
    const incoming = Array.isArray(body.films) ? body.films : [];
    if (incoming.length === 0) {
      return json({ ok: false, error: "Provide films: []" }, 400);
    }

    const normalized: OutboundRecord[] = [];
    const seenIds = new Set<string>();
    const seenUrls = new Set<string>();
    for (const item of incoming) {
      const sourceUrl = normalizeSourceUrl(String(item.sourceUrl || ""));
      if (!sourceUrl || seenUrls.has(sourceUrl)) continue;
      const id =
        String(item.id || "").trim() || outboundIdFromUrl(sourceUrl);
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      seenUrls.add(sourceUrl);
      normalized.push({
        id,
        title: cleanVideoTitle(String(item.title || sourceUrl)),
        sourceUrl,
        posterUrl: String(item.posterUrl || "").trim() || undefined,
        actor: String(item.actor || "").trim() || undefined,
        site: String(item.site || "").trim() || undefined,
        dateAdded: item.dateAdded || new Date().toISOString(),
      });
    }

    const existing = await loadOutboundFilms(request, env);
    let merged: OutboundRecord[];
    if (body.replace) {
      merged = normalized;
    } else {
      const byId = new Map(existing.map((r) => [r.id, r]));
      const byUrl = new Map(
        existing.map((r) => [normalizeSourceUrl(r.sourceUrl), r.id])
      );
      for (const rec of normalized) {
        const existingId = byUrl.get(rec.sourceUrl);
        if (existingId && existingId !== rec.id) {
          // Same URL already stored under another id — keep existing, skip duplicate
          continue;
        }
        if (byId.has(rec.id)) {
          // Already present — do not overwrite on non-replace posts
          continue;
        }
        byId.set(rec.id, rec);
        byUrl.set(rec.sourceUrl, rec.id);
      }
      merged = [...byId.values()];
    }

    const saved = await saveOutboundFilms(env, merged);
    return json(
      {
        ok: true,
        count: merged.length,
        added: normalized.length,
        persisted: saved,
        kvBound: Boolean(env.OUTBOUND),
        message: saved
          ? "Saved to Cloudflare KV — site updates without rebuild"
          : "KV binding OUTBOUND is missing. In Cloudflare Dashboard → Worker → Settings → Bindings → Add KV namespace named OUTBOUND, then retry.",
        films: merged,
      },
      saved ? 200 : 503
    );
  }

  if (pathname.startsWith("/api/admin/outbound/") && request.method === "DELETE") {
    const id = decodeURIComponent(pathname.replace("/api/admin/outbound/", ""));
    const existing = await loadOutboundFilms(request, env);
    const merged = existing.filter((r) => r.id !== id);
    const saved = await saveOutboundFilms(env, merged);
    return json({
      ok: true,
      count: merged.length,
      persisted: saved,
      films: merged,
    });
  }

  return json({ ok: false, error: "Not found" }, 404);
}

async function handlePosterProxy(request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(request.url);
  const target = url.searchParams.get("u") || "";
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return new Response("Invalid poster URL", { status: 400 });
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return new Response("Invalid poster protocol", { status: 400 });
  }

  const upstream = await fetch(parsed.toString(), {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Referer: `${parsed.origin}/`,
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    },
  });

  if (!upstream.ok) {
    return new Response(`Poster upstream ${upstream.status}`, {
      status: upstream.status === 404 ? 404 : 502,
    });
  }

  const contentType = upstream.headers.get("content-type") || "image/jpeg";
  if (!contentType.startsWith("image/")) {
    return new Response("Not an image", { status: 502 });
  }

  const headers = new Headers();
  headers.set("content-type", contentType);
  headers.set("cache-control", "public, max-age=86400");
  headers.set("access-control-allow-origin", "*");

  if (request.method === "HEAD") {
    return new Response(null, { status: 200, headers });
  }
  return new Response(upstream.body, { status: 200, headers });
}

async function handleThumbnail(
  request: Request,
  env: Env,
  pathname: string
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  const configError = requireConfig(env);
  if (configError) return new Response(configError, { status: 500 });

  const videoId = decodeURIComponent(pathname.replace("/api/thumbnail/", ""));
  if (!videoId) return new Response("Missing video id", { status: 400 });

  const video = await bunnyGetVideo(env, videoId);
  if (!video) return new Response("Not found", { status: 404 });

  const source = bunnyThumbnailSource(env, video);
  if (!source) return new Response("No thumbnail", { status: 404 });

  const upstream = await fetch(source, {
    headers: {
      // Bunny pull zones often block empty/unknown referrers
      Referer: "https://player.mediadelivery.net/",
      "User-Agent":
        "Mozilla/5.0 (compatible; ShortFilmSite/1.0; +https://workers.dev)",
    },
  });

  if (!upstream.ok) {
    return new Response(`Thumbnail upstream ${upstream.status}`, {
      status: upstream.status === 404 ? 404 : 502,
    });
  }

  const headers = new Headers();
  headers.set(
    "content-type",
    upstream.headers.get("content-type") || "image/jpeg"
  );
  headers.set("cache-control", "public, max-age=86400");
  headers.set("access-control-allow-origin", "*");

  if (request.method === "HEAD") {
    return new Response(null, { status: 200, headers });
  }

  return new Response(upstream.body, { status: 200, headers });
}

function slugifyFilmTitle(title: string): string {
  const slug = (title || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "video";
}

function filmWatchPath(film: Pick<Film, "title" | "slug" | "streamId">): string {
  const id = film.streamId || film.slug;
  return `/watch/${slugifyFilmTitle(film.title)}/${encodeURIComponent(id)}`;
}

function escapeHtml(value: string): string {
  return (value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function absoluteUrl(origin: string, pathOrUrl: string): string {
  if (!pathOrUrl) return origin;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${origin}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

async function findFilmById(
  request: Request,
  env: Env,
  id: string
): Promise<Film | null> {
  const outboundRecords = await loadOutboundFilms(request, env);
  const outbound = outboundRecords.find((r) => r.id === id);
  if (outbound) return toOutboundFilm(outbound);

  const configError = requireConfig(env);
  if (configError) return null;

  const video = await bunnyGetVideo(env, id);
  if (!video || video.status !== 4) return null;
  const expectedCollection = collectionId(env);
  if (video.collectionId && video.collectionId !== expectedCollection) return null;
  return toFilm(env, video);
}

async function listAllFilms(request: Request, env: Env): Promise<Film[]> {
  const outboundFilms = (await loadOutboundFilms(request, env)).map(toOutboundFilm);
  let bunnyFilms: Film[] = [];
  if (!requireConfig(env)) {
    try {
      bunnyFilms = (await bunnyListCollectionVideos(env))
        .filter((v) => v.status === 4)
        .map((v) => toFilm(env, v));
    } catch {
      // sitemap can still list outbound
    }
  }
  return [...bunnyFilms, ...outboundFilms];
}

function renderWatchPageHtml(film: Film, origin: string): string {
  const id = film.streamId || film.slug;
  const path = filmWatchPath(film);
  const canonical = `${origin}${path}`;
  const title = film.title || "Video";
  const description =
    film.description ||
    film.synopsis ||
    `Watch ${title} on BangHeroes`;
  const poster = absoluteUrl(origin, film.poster || PLACEHOLDER_POSTER);
  const outbound = film.kind === "outbound" || Boolean(film.sourceUrl && !film.embedUrl);
  const watchHref = outbound
    ? `/go?id=${encodeURIComponent(id)}`
    : null;
  const embed = !outbound && film.embedUrl ? film.embedUrl : "";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: title,
    description,
    thumbnailUrl: [poster],
    uploadDate: film.dateUploaded || undefined,
    contentUrl: canonical,
    embedUrl: embed || undefined,
    url: canonical,
    publisher: {
      "@type": "Organization",
      name: "BangHeroes",
      url: origin,
    },
  };

  const playerBlock = embed
    ? `<div class="player"><iframe src="${escapeHtml(embed)}" title="${escapeHtml(title)}" allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`
    : `<div class="poster-wrap">
        <img src="${escapeHtml(poster)}" alt="${escapeHtml(title)}" width="1280" height="720" />
        <div class="cta">
          <p>This title streams on the original site. Continue through a short ad page to watch.</p>
          <a class="btn" href="${escapeHtml(watchHref || "#")}">Watch on source site</a>
        </div>
      </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} | BangHeroes</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="robots" content="index,follow,max-image-preview:large" />
  <link rel="canonical" href="${escapeHtml(canonical)}" />
  <meta property="og:type" content="video.other" />
  <meta property="og:site_name" content="BangHeroes" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(canonical)}" />
  <meta property="og:image" content="${escapeHtml(poster)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(poster)}" />
  <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Georgia, "Times New Roman", serif; background: #0a0a0a; color: #f2f2f0; }
    a { color: #e8c547; text-decoration: none; }
    a:hover { text-decoration: underline; }
    header, main, footer { max-width: 960px; margin: 0 auto; padding: 1rem 1.25rem; }
    header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid rgba(255,255,255,0.08); }
    .brand { font-size: 1.35rem; letter-spacing: 0.04em; color: #f2f2f0; }
    h1 { font-size: clamp(1.6rem, 4vw, 2.4rem); line-height: 1.15; margin: 1.25rem 0 0.5rem; }
    .meta { color: #9a9a94; font-size: 0.95rem; margin-bottom: 1.25rem; }
    .player, .poster-wrap { position: relative; aspect-ratio: 16/9; background: #141414; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; overflow: hidden; }
    .player iframe, .poster-wrap img { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; object-fit: cover; }
    .cta { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; padding: 1.5rem; text-align: center; background: rgba(0,0,0,0.55); }
    .btn { display: inline-block; background: #e8c547; color: #111; font-weight: 700; padding: 0.85rem 1.4rem; border-radius: 999px; }
    .btn:hover { text-decoration: none; filter: brightness(1.08); }
    .desc { margin-top: 1.25rem; color: #c8c8c2; line-height: 1.6; }
    footer { margin-top: 2rem; border-top: 1px solid rgba(255,255,255,0.08); color: #7a7a74; font-size: 0.85rem; }
  </style>
</head>
<body>
  <header>
    <a class="brand" href="/">BangHeroes</a>
    <a href="/films">All films</a>
  </header>
  <main>
    <article>
      <h1>${escapeHtml(title)}</h1>
      <p class="meta">${[film.year || "", film.runtime || "", outbound ? "External" : ""]
        .filter(Boolean)
        .map(escapeHtml)
        .join(" · ")}</p>
      ${playerBlock}
      <p class="desc">${escapeHtml(description)}</p>
    </article>
  </main>
  <footer>
    <p>&copy; ${new Date().getFullYear()} BangHeroes · <a href="/">Home</a> · <a href="/sitemap.xml">Sitemap</a></p>
  </footer>
</body>
</html>`;
}

function renderSitemapXml(films: Film[], origin: string): string {
  const urls = films
    .map((film) => {
      const loc = `${origin}${filmWatchPath(film)}`;
      const lastmod = film.dateUploaded
        ? new Date(film.dateUploaded).toISOString().slice(0, 10)
        : "";
      return `  <url>
    <loc>${escapeHtml(loc)}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ""}
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${escapeHtml(origin)}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${escapeHtml(origin)}/films</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
${urls}
</urlset>`;
}

function renderRobotsTxt(origin: string): string {
  return `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/

Sitemap: ${origin}/sitemap.xml
`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = url.origin;

    if (url.pathname === "/api/poster") {
      return handlePosterProxy(request);
    }

    if (url.pathname.startsWith("/api/thumbnail/")) {
      return handleThumbnail(request, env, url.pathname);
    }

    if (url.pathname === "/api/films" || url.pathname.startsWith("/api/films/")) {
      return handlePublicFilmsApi(request, env, url.pathname);
    }

    if (url.pathname.startsWith("/api/admin")) {
      return handleAdminApi(request, env, url.pathname);
    }

    if (url.pathname === "/robots.txt") {
      return new Response(renderRobotsTxt(origin), {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "public, max-age=3600",
        },
      });
    }

    if (url.pathname === "/sitemap.xml") {
      try {
        const films = await listAllFilms(request, env);
        return new Response(renderSitemapXml(films, origin), {
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=300",
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Sitemap error";
        return new Response(`Sitemap error: ${message}`, { status: 500 });
      }
    }

    // SEO watch pages: /watch/{title-slug}/{id} or /watch/{id}
    const watchMatch = url.pathname.match(/^\/watch\/(?:[^/]+\/)?([^/]+)\/?$/);
    if (watchMatch) {
      const id = decodeURIComponent(watchMatch[1] || "");
      if (!id) {
        return new Response("Not found", { status: 404 });
      }
      const film = await findFilmById(request, env, id);
      if (!film) {
        return new Response("Video not found", {
          status: 404,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }
      // Prefer canonical title slug in the URL
      const canonicalPath = filmWatchPath(film);
      if (url.pathname.replace(/\/$/, "") !== canonicalPath) {
        return Response.redirect(`${origin}${canonicalPath}`, 301);
      }
      return new Response(renderWatchPageHtml(film, origin), {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "public, max-age=120",
        },
      });
    }

    // Old share links: /play?id=… → canonical /watch/…
    if (url.pathname === "/play" && url.searchParams.get("id")) {
      const id = url.searchParams.get("id") || "";
      const film = await findFilmById(request, env, id);
      if (film) {
        return Response.redirect(`${origin}${filmWatchPath(film)}`, 301);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
