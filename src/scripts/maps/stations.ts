// The weather stations on the map: an arrow coloured by wind speed or a
// temperature pin, and the values a station's sheet shows. Wind and gusts
// already arrive in km/h; temperature and pressure go through units.ts.

import { num } from "../coerce.ts";
import { escapeHtml } from "../escape.ts";
import type { MeasurementFeature } from "../types.ts";
import { downwindRotation } from "../wind-arrow.ts";
import { stationPressures, type StationPressures } from "../pressure.ts";
import { round1, toCelsius } from "../units.ts";
import type { LatLngTuple } from "./centroid.ts";

/** The official app's wind colour scale: each bucket's upper bound in
 * km/h, exclusive. */
const WIND_BUCKETS: [max: number, color: string][] = [
  [3, "#FFFFFF"],
  [6, "#D2FFFE"],
  [10, "#8DF0EB"],
  [15, "#43DE5D"],
  [20, "#8CDF17"],
  [25, "#F5DA01"],
  [30, "#FDA700"],
  [35, "#FE6700"],
  [40, "#EA3400"],
  [50, "#D20000"],
  [60, "#A90404"],
  [70, "#DC00DC"],
  [80, "#B000B0"],
  [100, "#8301B2"],
];

/** The colour of a wind speed in km/h. */
export function windColor(kmh: number): string {
  for (const [max, color] of WIND_BUCKETS) if (kmh < max) return color;
  return "#550273";
}

/** The colour of a temperature pin in °C. */
export function temperatureColor(c: number): string {
  if (c >= 22) return "#EF4444";
  if (c >= 15) return "#F59E0B";
  if (c >= 8) return "#10B981";
  if (c >= 0) return "#06B6D4";
  return "#3B82F6";
}

/** A station's position, [lat, lng], else null. */
export function stationLatLng(f: MeasurementFeature): LatLngTuple | null {
  const c = f.geometry?.coordinates;
  if (!Array.isArray(c)) return null;
  const lng = num(c[0]);
  const lat = num(c[1]);
  return lat === null || lng === null ? null : [lat, lng];
}

export interface StationMeasurements {
  windKmh: number | null;
  gustKmh: number | null;
  dirDeg: number | null;
  tempC: number | null;
  /** QNH or QFF, and QFE (pressure.ts). */
  pressure: StationPressures;
}

/** A station's latest values, rounded to one decimal (pressures to whole
 * hPa). */
export function stationMeasurements(
  f: MeasurementFeature,
): StationMeasurements {
  const p = f.properties ?? {};
  const one = (v: number | null) => (v === null ? null : round1(v));
  return {
    windKmh: one(num(p.windSpeedValue)),
    gustKmh: one(num(p.windGustValue)),
    dirDeg: num(p.windDirectionValue),
    tempC: one(toCelsius(num(p.temperature2mValue) ?? num(p.temperatureValue))),
    pressure: stationPressures(p),
  };
}

/** A temperature with its sign, as the pin shows it: `+5.2°`. */
export function signedDegrees(c: number): string {
  return `${c > 0 ? "+" : ""}${c}°`;
}

export interface MarkerSpec {
  html: string;
  className: string;
  size: [number, number];
}

const ARROW_PATH =
  "M17.0385 7.68871C17.0204 7.59093 17.1322 7.5226 17.2109 7.58342L24.0393 12.8592C24.0948 12.9023 24.0951 12.9864 24.0401 13.0301L17.2612 18.3763C17.1831 18.4379 17.0707 18.3706 17.0879 18.2726L17.75 14.5068L2.07201 13.6463C1.95761 13.64 1.86757 13.546 1.86691 13.4314L1.86339 12.6785C1.86299 12.564 1.95215 12.4691 2.06649 12.4618L17.7368 11.4541L17.0385 7.68871Z";

/** A station's marker in the wind or temperature mode, else null when it
 * lacks the mode's value (or, for a wind arrow, its direction). Below 3
 * km/h the wind is a white dot. */
export function stationMarker(
  f: MeasurementFeature,
  mode: "WIND" | "TEMPERATURE",
): MarkerSpec | null {
  const name = escapeHtml(f.properties?.name ?? "");
  const r = stationMeasurements(f);
  if (mode === "TEMPERATURE") {
    if (r.tempC === null) return null;
    return {
      className: "station-temp-div-icon",
      size: [36, 22],
      html: `<div class="station-temp-pin" style="background-color: ${temperatureColor(r.tempC)};" title="${name}: ${r.tempC}°C"><span>${signedDegrees(r.tempC)}</span></div>`,
    };
  }
  const wind = num(f.properties?.windSpeedValue);
  if (wind === null) return null;
  const kmh = Math.round(wind);
  const spec = {
    className: "station-div-icon",
    size: [24, 24] as [number, number],
  };
  if (kmh < 3)
    return {
      ...spec,
      html: `<div class="station-wind-arrow-box" title="${name}: ${kmh} km/h"><svg class="wind-arrow-svg wind-dot-svg" width="18" height="18" viewBox="0 0 26 26" fill="none"><circle cx="13" cy="13" r="6" fill="#FFFFFF" stroke="#1e293b" stroke-width="1.8"/></svg></div>`,
    };
  const turn = downwindRotation(r.dirDeg);
  if (r.dirDeg === null || turn === null) return null;
  const dir = Math.round(r.dirDeg);
  // ARROW_PATH points east; the inner rotation makes it point north, the
  // outer one downwind
  return {
    ...spec,
    html: `<div class="station-wind-arrow-box" style="transform: rotate(${turn}deg);" title="${name}: ${kmh} km/h (${dir}°)"><svg class="wind-arrow-svg" width="24" height="24" viewBox="0 0 26 26" fill="none"><g transform="rotate(-90 13 13)"><path d="${ARROW_PATH}" fill="${windColor(kmh)}" stroke="#1e293b" stroke-width="1.2" stroke-linejoin="round"/></g></svg></div>`,
  };
}

/** The data providers' names, by the key in a station id. */
const PROVIDERS: Record<string, string> = {
  meteo_swiss: "MeteoSchweiz (CH)",
  meteo_france: "Météo-France (FR)",
  geosphere_austria: "GeoSphere Austria (AT)",
  dwd: "Deutscher Wetterdienst (DE)",
  mistral: "MISTRAL / ARPA (IT)",
  slf: "WSL-SLF (CH)",
  holfuy: "Holfuy",
  aviation_weather: "Aviation METAR",
  windline: "Windline",
  gx_air_com: "GXAirCom",
  open_wind_map: "OpenWindMap",
  meteo_oberwallis: "Meteo Oberwallis (CH)",
};

/** The provider's name for a station's badge, its key in capitals when
 * unknown, else null. */
export function providerLabel(f: MeasurementFeature): string | null {
  const p = f.properties ?? {};
  const raw = p.providerKey || p.providerDisplayName;
  const key = typeof raw === "string" ? raw.toLowerCase() : "";
  if (!key) return null;
  return Object.prototype.hasOwnProperty.call(PROVIDERS, key)
    ? PROVIDERS[key]
    : key.toUpperCase();
}
