// The webcam list's search and the image a card shows.

import { safeUrl } from "../escape.ts";
import type { Webcam } from "../types.ts";

function text(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** The webcams whose name or location holds `search`, ignoring case. */
export function filterWebcams(
  webcams: readonly Webcam[],
  search: string,
): Webcam[] {
  const q = search.trim().toLowerCase();
  if (!q) return webcams.slice();
  return webcams.filter(
    (w) =>
      text(w.name).toLowerCase().includes(q) ||
      text(w.location).toLowerCase().includes(q),
  );
}

/** The thumbnail to show first and the full image to fall back to when it
 * fails to load; each an http(s) URL or null. */
export function webcamImages(w: Webcam): {
  src: string | null;
  fallback: string | null;
} {
  const latest = safeUrl(w.latestImageUrl);
  const src = safeUrl(w.thumbnailUrl) ?? latest;
  return { src, fallback: latest !== src ? latest : null };
}
