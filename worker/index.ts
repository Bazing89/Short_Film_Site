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
  // Stable short id from URL (non-crypto hash for Worker sync context)
  let hash = 2166136261;
  for (let i = 0; i < sourceUrl.length; i++) {
    hash ^= sourceUrl.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `out_${(hash >>> 0).toString(16).padStart(8, "0")}`;
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
    for (const item of incoming) {
      const sourceUrl = String(item.sourceUrl || "").trim();
      if (!sourceUrl) continue;
      const id =
        String(item.id || "").trim() || outboundIdFromUrl(sourceUrl);
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
      for (const rec of normalized) byId.set(rec.id, rec);
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

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

    return env.ASSETS.fetch(request);
  },
};
