// The emagram's drawing: a skew-T of temperature (segments coloured by
// lapse rate) and dew point over log pressure from 1000 to 600 hPa, a wind
// speed column with direction ticks, and the time ruler under it. Pure:
// every function returns numbers or SVG markup built from numbers.

import { escapeHtml } from "../escape.ts";
import { round1 } from "../units.ts";
import type { Sounding, SoundingLevel } from "../types.ts";

export const SVG_W = 520;
export const SVG_H = 620;
export const PAD_L = 46;
const PAD_R = 18;
export const PAD_T = 32;
export const PAD_B = 60;
export const PLOT_W = 340;
export const PLOT_H = SVG_H - PAD_T - PAD_B;
const P_MIN = 600;
const P_MAX = 1000;
const T_MIN = -15;
const T_MAX = 35;
const SKEW = 0.32;
/** The wind column's full scale in km/h. */
const WIND_MAX = 45;

export const PRESSURE_TICKS = [1000, 900, 800, 700, 600];
export const TEMP_TICKS = [-10, 0, 10, 20, 30];
export const ALTITUDE_TICKS = [1000, 2000, 3000, 4000];

/** A pressure's height on the chart, unclamped: past 600 or 1000 hPa it
 * leaves the plot, where the clip paths cut it off. */
function yOf(p: number): number {
  return (
    PAD_T + PLOT_H - (Math.log(P_MAX / p) / Math.log(P_MAX / P_MIN)) * PLOT_H
  );
}

/** A pressure's height on the chart, clamped to the plot. */
export function pToY(p: number): number {
  return yOf(Math.max(P_MIN, Math.min(P_MAX, p)));
}

const inRange = (p: number) => p >= P_MIN && p <= P_MAX;

/** Where the wind column draws `kmh`: from 20 px right of the plot, 75 px
 * for the full scale. The curve and its axis labels both use it. */
function windX(kmh: number): number {
  return PAD_L + PLOT_W + 20 + Math.min(1, Math.max(0, kmh / WIND_MAX)) * 75;
}

/** The wind axis's labels, placed where the curve draws their speeds. */
export const WIND_LABELS = [15, 30, 45].map((kmh) => ({ kmh, x: windX(kmh) }));

/** The ids of the clip paths EmagramCard.astro defines from PLOT_CLIP and
 * WIND_CLIP. */
export const PLOT_CLIP_ID = "emagram-plot-clip";
export const WIND_CLIP_ID = "emagram-wind-clip";

/** The plot's area and the wind column's, for the clip paths that keep the
 * curves and the isotherms inside them (EmagramCard.astro). */
export const PLOT_CLIP = { x: PAD_L, y: PAD_T, width: PLOT_W, height: PLOT_H };
export const WIND_CLIP = {
  x: PAD_L + PLOT_W,
  y: PAD_T,
  width: SVG_W - PAD_R - PAD_L - PLOT_W,
  height: PLOT_H,
};

export function tToX(t: number, y: number): number {
  return (
    PAD_L +
    ((t - T_MIN) / (T_MAX - T_MIN)) * PLOT_W +
    (PAD_T + PLOT_H - y) * SKEW
  );
}

/** The temperature segment's colour for a lapse rate in °C per 100 m:
 * inversion yellow through dry adiabatic red to superadiabatic purple. */
export function lapseColor(gamma: number): string {
  if (gamma >= 0) return "#EAB308";
  if (gamma >= -0.3) return "#84CC16";
  if (gamma >= -0.6) return "#22C55E";
  if (gamma >= -0.8) return "#0EA5E9";
  if (gamma >= -1) return "#EF4444";
  return "#A855F7";
}

const f1 = (v: number) => v.toFixed(1);
const GRID = 'stroke="var(--border-color, #E2E8F0)" stroke-width="1"';
const LABEL = 'fill="#94A3B8" font-size="11" font-weight="600"';

/** The isobars and skewed isotherms, the same for every sounding. */
export function gridSvg(): string {
  const isobars = PRESSURE_TICKS.map((p) => {
    const y = f1(pToY(p));
    return `<line x1="${PAD_L}" y1="${y}" x2="${PAD_L + PLOT_W}" y2="${y}" ${GRID} stroke-dasharray="3,3"/><text x="${PAD_L - 6}" y="${f1(pToY(p) + 4)}" ${LABEL} text-anchor="end">${p}</text>`;
  });
  const y1 = PAD_T + PLOT_H;
  // the skewed isotherms run past the plot's right edge: clipped to it
  const isotherms = TEMP_TICKS.map(
    (t) =>
      `<line x1="${f1(tToX(t, y1))}" y1="${y1}" x2="${f1(tToX(t, PAD_T))}" y2="${PAD_T}" ${GRID} opacity="0.75"/>`,
  );
  const labels = TEMP_TICKS.map(
    (t) =>
      `<text x="${f1(tToX(t, y1))}" y="${y1 + 18}" ${LABEL} text-anchor="middle">${t}</text>`,
  );
  return `${isobars.join("")}<g clip-path="url(#${PLOT_CLIP_ID})">${isotherms.join("")}</g>${labels.join("")}`;
}

/** Where an altitude lies: between the two levels around it, linear in
 * height and so in log pressure. Null below the lowest level, above the
 * highest, or off the plot: there the sounding gives it no pressure, and a
 * scale of its own would put it on the wrong side of a level. */
export function altitudeY(
  alt: number,
  levels: readonly SoundingLevel[],
): number | null {
  const sorted = [...levels].sort((a, b) => a.heightM - b.heightM);
  for (let i = 1; i < sorted.length; i++) {
    const lo = sorted[i - 1];
    const hi = sorted[i];
    if (alt < lo.heightM || alt > hi.heightM) continue;
    const t =
      hi.heightM === lo.heightM
        ? 0
        : (alt - lo.heightM) / (hi.heightM - lo.heightM);
    const y = yOf(lo.pressHpa) + (yOf(hi.pressHpa) - yOf(lo.pressHpa)) * t;
    return y >= PAD_T && y <= PAD_T + PLOT_H ? y : null;
  }
  return null;
}

/** The altitude lines in the wind column, for the altitudes the sounding
 * spans inside the plot. */
export function altitudeSvg(levels: readonly SoundingLevel[]): string {
  return ALTITUDE_TICKS.map((alt) => {
    const at = altitudeY(alt, levels);
    if (at === null) return "";
    const y = f1(at);
    return `<line x1="${PAD_L + PLOT_W}" y1="${y}" x2="${SVG_W - PAD_R}" y2="${y}" ${GRID} stroke-dasharray="3,3"/><text x="${PAD_L + PLOT_W + 6}" y="${f1(Number(y) - 4)}" ${LABEL}>${alt} m</text>`;
  }).join("");
}

export interface Curves {
  /** polyline points */
  dew: string;
  wind: string;
  /** SVG lines, one per level pair */
  temp: string;
  barbs: string;
}

export function soundingCurves(levels: readonly SoundingLevel[]): Curves {
  const dew: string[] = [];
  const wind: string[] = [];
  let temp = "";
  let barbs = "";
  // the top level is past the plot (levels run to 550 hPa): tick the
  // highest one inside it instead
  let lastInRange = -1;
  levels.forEach((l, i) => {
    if (inRange(l.pressHpa)) lastInRange = i;
  });
  levels.forEach((l, i) => {
    const y = yOf(l.pressHpa);
    dew.push(`${f1(tToX(l.dewC, y))},${f1(y)}`);
    if (i > 0) {
      const prev = levels[i - 1];
      const py = yOf(prev.pressHpa);
      temp += `<line x1="${f1(tToX(prev.tempC, py))}" y1="${f1(py)}" x2="${f1(tToX(l.tempC, y))}" y2="${f1(y)}" stroke="${lapseColor(l.lapseRate)}" stroke-width="3.6" stroke-linecap="round"/>`;
    }
    wind.push(`${f1(windX(l.speedKmH))},${f1(y)}`);
    if ((i % 3 === 0 || i === lastInRange) && inRange(l.pressHpa)) {
      const rad = ((l.dirDeg - 90) * Math.PI) / 180;
      barbs += `<g transform="translate(${PAD_L + PLOT_W + 12}, ${f1(y)})"><circle cx="0" cy="0" r="2.5" fill="#0284C7"/><line x1="0" y1="0" x2="${f1(Math.cos(rad) * 16)}" y2="${f1(Math.sin(rad) * 16)}" stroke="#0284C7" stroke-width="1.8"/></g>`;
    }
  });
  return { dew: dew.join(" "), wind: wind.join(" "), temp, barbs };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The sounding between two time steps, for a fractional index; the
 * wind direction turns the short way round. Null with no time steps. */
export function interpolateStep(
  steps: Sounding["timeSteps"],
  index: number,
): Sounding["timeSteps"][number] | null {
  if (steps.length === 0) return null;
  const c = Math.max(0, Math.min(steps.length - 1, index));
  const i = Math.floor(c);
  const j = Math.min(steps.length - 1, i + 1);
  const t = c - i;
  const a = steps[i];
  const b = steps[j];
  if (t <= 0.001 || i === j) return a;
  const n = Math.min(a.levels.length, b.levels.length);
  const levels: SoundingLevel[] = [];
  for (let k = 0; k < n; k++) {
    const la = a.levels[k];
    const lb = b.levels[k];
    let turn = (lb.dirDeg - la.dirDeg) % 360;
    if (turn > 180) turn -= 360;
    if (turn < -180) turn += 360;
    levels.push({
      pressHpa: round1(lerp(la.pressHpa, lb.pressHpa, t)),
      tempC: round1(lerp(la.tempC, lb.tempC, t)),
      dewC: round1(lerp(la.dewC, lb.dewC, t)),
      speedKmH: round1(lerp(la.speedKmH, lb.speedKmH, t)),
      heightM: Math.round(lerp(la.heightM, lb.heightM, t)),
      lapseRate: round1(lerp(la.lapseRate, lb.lapseRate, t)),
      dirDeg: Math.round((la.dirDeg + turn * t + 360) % 360),
    });
  }
  return { timestamp: Math.round(lerp(a.timestamp, b.timestamp, t)), levels };
}

/** The index of the time closest to `now`; 0 with none. */
export function closestIndex(times: readonly number[], now: number): number {
  let best = 0;
  times.forEach((t, i) => {
    if (Math.abs(t - now) < Math.abs(times[best] - now)) best = i;
  });
  return best;
}

/** The time ruler under the slider, 1000 units wide: a label every two
 * hours, ticks every hour and half hour, and a dashed "now" line. */
export function rulerSvg(
  steps: Sounding["timeSteps"],
  now: number,
  nowLabel: string,
  hourOf: (ms: number) => number,
): string {
  if (steps.length === 0) return "";
  const t0 = steps[0].timestamp;
  const span = Math.max(1, steps[steps.length - 1].timestamp - t0);
  const x = (ms: number) => f1(((ms - t0) / span) * 1000);
  let svg = `<line x1="0" y1="34" x2="1000" y2="34" stroke="var(--border-color, #CBD5E1)" stroke-width="1.5"/>`;
  steps.forEach((s, i) => {
    const hour = hourOf(s.timestamp);
    if (hour % 2 === 0)
      svg += `<text x="${x(s.timestamp)}" y="12" font-size="10.5" font-weight="700" fill="var(--text-muted, #64748B)" text-anchor="middle">${String(hour).padStart(2, "0")}:00</text><line x1="${x(s.timestamp)}" y1="18" x2="${x(s.timestamp)}" y2="34" stroke="var(--border-color, #94A3B8)" stroke-width="1.6"/>`;
    else
      svg += `<line x1="${x(s.timestamp)}" y1="23" x2="${x(s.timestamp)}" y2="34" stroke="var(--border-color, #CBD5E1)" stroke-width="1.2"/>`;
    if (i < steps.length - 1)
      svg += `<line x1="${x(s.timestamp + 1800000)}" y1="27" x2="${x(s.timestamp + 1800000)}" y2="34" stroke="var(--border-color, #E2E8F0)" stroke-width="1"/>`;
  });
  if (now >= t0 && now <= t0 + span)
    svg += `<line x1="${x(now)}" y1="2" x2="${x(now)}" y2="44" stroke="#64748B" stroke-width="1.5" stroke-dasharray="3,3"/><text x="${x(now)}" y="44" font-size="8.5" font-weight="800" fill="#64748B" text-anchor="middle">${escapeHtml(nowLabel)}</text>`;
  return svg;
}
