/**
 * Cloudflare Worker: static site + /api/admin/* Bunny URL-fetch queue.
 *
 * Secrets: ADMIN_PASSWORD, BUNNY_API_KEY
 * Vars: BUNNY_LIBRARY_ID
 */

export interface Env {
  ASSETS: Fetcher;
  ADMIN_PASSWORD: string;
  BUNNY_API_KEY: string;
  BUNNY_LIBRARY_ID: string;
}

const SESSION_COOKIE = "admin_session";

function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
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
  const expected = await sessionToken(env.ADMIN_PASSWORD || "7777");
  const cookies = parseCookies(request.headers.get("cookie"));
  if (cookies[SESSION_COOKIE] === expected) return true;
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ") && auth.slice(7) === expected) return true;
  return false;
}

function requireConfig(env: Env): string | null {
  if (!env.BUNNY_LIBRARY_ID) return "BUNNY_LIBRARY_ID is not configured";
  if (!env.BUNNY_API_KEY) return "BUNNY_API_KEY is not configured";
  return null;
}

function titleFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const name = decodeURIComponent(path.split("/").filter(Boolean).pop() || "");
    return name.replace(/\.[a-z0-9]+$/i, "") || url;
  } catch {
    return url;
  }
}

/** VideoModelStatus → UI progress */
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

async function bunnyFetch(env: Env, url: string, title?: string) {
  const res = await fetch(
    `https://video.bunnycdn.com/library/${env.BUNNY_LIBRARY_ID}/videos/fetch`,
    {
      method: "POST",
      headers: {
        AccessKey: env.BUNNY_API_KEY,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ url, ...(title ? { title } : {}) }),
    }
  );

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

async function bunnyGetVideo(env: Env, videoId: string) {
  const res = await fetch(
    `https://video.bunnycdn.com/library/${env.BUNNY_LIBRARY_ID}/videos/${videoId}`,
    {
      headers: {
        AccessKey: env.BUNNY_API_KEY,
        accept: "application/json",
      },
    }
  );
  if (!res.ok) return null;
  return (await res.json()) as {
    guid?: string;
    status?: number;
    encodeProgress?: number;
    title?: string;
    length?: number;
    dateUploaded?: string;
  };
}

async function bunnyListVideos(env: Env) {
  const res = await fetch(
    `https://video.bunnycdn.com/library/${env.BUNNY_LIBRARY_ID}/videos?page=1&itemsPerPage=100&orderBy=date`,
    {
      headers: {
        AccessKey: env.BUNNY_API_KEY,
        accept: "application/json",
      },
    }
  );
  if (!res.ok) return [];
  const data = (await res.json()) as {
    items?: Array<{
      guid: string;
      title: string;
      status: number;
      encodeProgress?: number;
      length?: number;
      dateUploaded?: string;
    }>;
  };
  return data.items ?? [];
}

async function handleAdminApi(
  request: Request,
  env: Env,
  pathname: string
): Promise<Response> {
  if (pathname === "/api/admin/login" && request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as { password?: string };
    const password = env.ADMIN_PASSWORD || "7777";
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

    const items = await bunnyListVideos(env);
    const library = items.map((item) => {
      const mapped = mapBunnyStatus(item.status, item.encodeProgress);
      return {
        bunnyVideoId: item.guid,
        title: item.title,
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
      title: video.title,
      ...mapped,
      encodeProgress: video.encodeProgress ?? mapped.progress,
      bunnyStatus: video.status,
    });
  }

  return json({ ok: false, error: "Not found" }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/admin")) {
      return handleAdminApi(request, env, url.pathname);
    }

    return env.ASSETS.fetch(request);
  },
};
