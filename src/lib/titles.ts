/** Clean a video filename/title for display on the site. */
export function cleanVideoTitle(raw: string): string {
  let title = (raw || "").trim();

  // Strip path if a full path/URL slipped in
  title = title.replace(/^.*[\\/]/, "");

  // Remove common video extensions
  title = title.replace(/\.(mp4|mov|mkv|webm|m4v|avi)$/i, "");

  // Remove trailing bracket tags like [RBmw0pLlgWI] or [7072336]
  title = title.replace(/\s*\[[^\]]*\]\s*$/g, "");

  // Remove trailing parenthetical numbers like (12345)
  title = title.replace(/\s*\(\d+\)\s*$/g, "");

  // Remove trailing arbitrary number groups (IDs), not mid-title words like 100mph
  title = title.replace(/[\s._-]+\d{3,}\s*$/g, "");
  title = title.replace(/\s+\d+\s*$/g, "");

  // Collapse leftover separators
  title = title.replace(/[\s._-]+$/g, "").replace(/\s{2,}/g, " ").trim();

  return title || raw.trim() || "Untitled";
}

export function formatRuntime(seconds?: number): string {
  if (!seconds || seconds <= 0) return "";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
