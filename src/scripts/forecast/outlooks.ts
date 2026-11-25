// The outlook animation ("Aussichten"): upstream's frames are greyscale
// WebP rasters whose green channel holds a percentage; the official app
// colours them through a palette (sunshine yellow to red, precipitation
// green). Pure: the pixels are a parameter.

import { naiveSwiss } from "../swiss-time.ts";
import { safeUrl } from "../escape.ts";

export const OUTLOOK_TYPES = [
  "RELATIVE_SUNSHINE",
  "PRECIPITATION_PROBABILITY_WEAK",
  "PRECIPITATION_PROBABILITY_STRONG",
] as const;
export type OutlookType = (typeof OUTLOOK_TYPES)[number];

/** Where the frames lie: lat 45.2 to 48.5, lon 4.5 to 11.8. */
export const OUTLOOK_BOUNDS: [[number, number], [number, number]] = [
  [45.2, 4.5],
  [48.5, 11.8],
];

const FRAME_BASE = "https://static-prod.ubmeteo.io/";

interface Stop {
  p: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

const stop = (p: number, hex: string, a: number): Stop => ({
  p,
  r: parseInt(hex.slice(1, 3), 16),
  g: parseInt(hex.slice(3, 5), 16),
  b: parseInt(hex.slice(5, 7), 16),
  a,
});

export const SUNSHINE_PALETTE: Stop[] = [
  stop(0, "#FFFFFF", 0),
  stop(5, "#FFF8DB", 160),
  stop(15, "#FFEDAA", 175),
  stop(25, "#FFE270", 190),
  stop(35, "#FFD052", 205),
  stop(45, "#FFBE33", 215),
  stop(55, "#FF971A", 225),
  stop(65, "#FF6F00", 235),
  stop(75, "#FF5500", 240),
  stop(85, "#EB0900", 245),
  stop(95, "#CC0044", 250),
  stop(100, "#B40032", 255),
];

export const PRECIP_PALETTE: Stop[] = [
  stop(0, "#FFFFFF", 0),
  stop(5, "#C7EDD2", 160),
  stop(15, "#ABE4BC", 175),
  stop(25, "#8EDCA6", 190),
  stop(35, "#72D38F", 205),
  stop(45, "#56CA79", 215),
  stop(55, "#3DCA74", 225),
  stop(65, "#2DC273", 235),
  stop(75, "#22B374", 240),
  stop(85, "#1AA373", 245),
  stop(95, "#129270", 250),
  stop(100, "#0A785A", 255),
];

/** RGBA for each green value 0 to 255, interpolated between the stops; 0
 * is transparent. */
export function colorLut(palette: readonly Stop[]): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 4);
  for (let g = 1; g < 256; g++) {
    const pct = (g / 255) * 100;
    let i = 0;
    while (i < palette.length - 1 && palette[i + 1].p <= pct) i++;
    const a = palette[i];
    const b = palette[Math.min(i + 1, palette.length - 1)];
    const t =
      b === a ? 0 : Math.max(0, Math.min(1, (pct - a.p) / (b.p - a.p || 1)));
    lut[g * 4] = Math.round(a.r + t * (b.r - a.r));
    lut[g * 4 + 1] = Math.round(a.g + t * (b.g - a.g));
    lut[g * 4 + 2] = Math.round(a.b + t * (b.b - a.b));
    lut[g * 4 + 3] = Math.round(a.a + t * (b.a - a.a));
  }
  return lut;
}

/** Recolours RGBA pixels in place by their green channel. */
export function colorize(
  pixels: Uint8ClampedArray,
  lut: Uint8ClampedArray,
): void {
  for (let i = 0; i < pixels.length; i += 4) {
    const o = pixels[i + 1] * 4;
    pixels[i] = lut[o];
    pixels[i + 1] = lut[o + 1];
    pixels[i + 2] = lut[o + 2];
    pixels[i + 3] = lut[o + 3];
  }
}

export interface OutlookFrame {
  /** Naive Zurich time, no offset, e.g. "2026-11-23T06:00": read as text
   * (naiveSwiss), never through new Date(). */
  start: string;
  end: string;
  url: string;
}

/** The frames of a type, from the 6-hour set when upstream has one (20 or
 * more frames), else the first set; a malformed frame is skipped. */
export function outlookFrames(
  answer: unknown,
  type: OutlookType,
): OutlookFrame[] {
  const data = (answer as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  const sets = data.filter(
    (d): d is { type: string; files: unknown[] } =>
      typeof d === "object" &&
      d !== null &&
      d.type === type &&
      Array.isArray(d.files),
  );
  const best = sets.find((s) => s.files.length >= 20) ?? sets[0];
  const frames: OutlookFrame[] = [];
  for (const f of best?.files ?? []) {
    const r = f as { start?: unknown; end?: unknown; file?: unknown };
    if (
      typeof r.file !== "string" ||
      typeof r.start !== "string" ||
      typeof r.end !== "string"
    )
      continue;
    // the path is appended to upstream's host, so it can't name another
    const url = safeUrl(FRAME_BASE + r.file);
    if (url) frames.push({ start: r.start, end: r.end, url });
  }
  return frames;
}

/** "Mo., 23.11. 06:00 \u2013 12:00" in the locale. The frames' times are
 * naive Zurich times, read as text (naiveSwiss), so the device's zone
 * never shifts them. */
export function intervalLabel(frame: OutlookFrame, locale: string): string {
  const start = naiveSwiss(frame.start, locale);
  const end = naiveSwiss(frame.end, locale);
  if (!start || !end) return `${frame.start} \u2013 ${frame.end}`;
  return `${start.day} ${start.time} \u2013 ${end.time}`;
}

/** The legend's CSS gradient per palette. */
export function legendGradient(type: OutlookType): string {
  return type === "RELATIVE_SUNSHINE"
    ? "linear-gradient(to right, #FFF8DB 0%, #FFE270 25%, #FFBE33 45%, #FF6F00 65%, #EB0900 85%, #CC0044 100%)"
    : "linear-gradient(to right, #C7EDD2 0%, #8EDCA6 25%, #56CA79 45%, #2DC273 65%, #1AA373 85%, #129270 100%)";
}
