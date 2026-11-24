// The webcams on the map: a camera marker at each, and which of its images
// the sheet shows. Every upstream URL goes through safeUrl.

import { escapeHtml, safeUrl } from "../escape.ts";
import type { Webcam } from "../types.ts";
import type { LatLngTuple } from "./centroid.ts";

/** A webcam's position, [lat, lng], else null. */
export function webcamLatLng(w: Webcam): LatLngTuple | null {
  return Number.isFinite(w.latitude) && Number.isFinite(w.longitude)
    ? [w.latitude, w.longitude]
    : null;
}

/** A webcam's marker. */
export function webcamMarkerHtml(w: Webcam): string {
  return `<div class="webcam-map-marker" title="${escapeHtml(w.name)}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></div>`;
}

export interface WebcamImages {
  /** The latest image, else null. */
  latest: string | null;
  /** The thumbnail to fall back to when the latest image fails, else null. */
  fallback: string | null;
  /** The current hour's (else day's) time-lapse, else null. */
  timelapse: string | null;
  /** The provider's page, else the latest image, else null. */
  source: string | null;
}

/** The first http(s) URL among `values`, else null. */
function firstUrl(...values: unknown[]): string | null {
  for (const v of values) {
    const url = safeUrl(v);
    if (url) return url;
  }
  return null;
}

/** The images and links a webcam's sheet shows. */
export function webcamImages(w: Webcam): WebcamImages {
  const latest = firstUrl(
    w.latestImageUrl,
    w.mediumResolutionImageUrl,
    w.highResolutionImageUrl,
    w.thumbnailUrl,
  );
  const thumb = safeUrl(w.thumbnailUrl);
  return {
    latest,
    fallback: thumb !== latest ? thumb : null,
    timelapse: firstUrl(w.currentHourTimelapseUrl, w.currentDayTimelapseUrl),
    source: firstUrl(w.attributionUrl, w.providerUrl, w.liveUrl) ?? latest,
  };
}

/** The line under a webcam's name: place, altitude and provider. */
export function webcamSubtitle(w: Webcam): string {
  const alt =
    typeof w.altitudeM === "number" && w.altitudeM
      ? `${Math.round(w.altitudeM)} m`
      : null;
  return [w.location, alt, w.providerDisplayName]
    .filter((v): v is string => typeof v === "string" && v !== "")
    .join(" • ");
}
