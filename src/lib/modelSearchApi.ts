export interface ModelSearchResult {
  url: string;
  title: string;
  poster?: string;
  site?: string;
  actor?: string;
  error?: boolean;
}

export interface ModelSearchResponse {
  ok: boolean;
  model?: string;
  count?: number;
  results?: ModelSearchResult[];
  modelsCount?: number;
  error?: string;
  log?: string[];
}

export interface ModelImportResponse {
  ok: boolean;
  imported?: number;
  count?: number;
  persisted?: boolean;
  removedNoThumbnail?: number;
  error?: string;
}

const SEARCH_SOURCES = [
  "xvideos",
  "xnxx",
  "pornhub",
  "fpo",
  "eporner",
  "playvids",
] as const;

export { SEARCH_SOURCES };

export async function searchModelOnline(
  model: string,
  sources?: string[],
  limit = 20
): Promise<ModelSearchResponse> {
  const res = await fetch("/api/model-search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: model.trim(),
      sources: sources?.length ? sources : SEARCH_SOURCES,
      limit,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as ModelSearchResponse;
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Search failed (${res.status})`);
  }
  return data;
}

export async function importModelVideos(
  model: string,
  items: Array<{
    url: string;
    title: string;
    poster?: string;
    site?: string;
  }>
): Promise<ModelImportResponse> {
  const res = await fetch("/api/model-import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: model.trim(), items }),
  });
  const data = (await res.json().catch(() => ({}))) as ModelImportResponse;
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Import failed (${res.status})`);
  }
  return data;
}
