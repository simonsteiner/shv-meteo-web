// The four station pairs of the official app (its
// PressureDifferenceGeoJsonTransformer), their difference and its 24-hour
// history. A pair id names its two stations: KLO_LUG is Kloten and Lugano.
// Pressure pairs are south minus north, except GVE_GUT, which is west minus
// east, and read QNH (historyParameter); the temperature pair is the first
// station minus the second. The alert thresholds (assess in report.ts:
// 4/8 hPa for KLO_LUG, 3/6 hPa for the others) are this app's own, from the
// old Express server, not found in the official app.
import type { TimeseriesResponse } from "../types.ts";
import { swissTime } from "../swiss-time.ts";
import { round1, toCelsius, toHpa } from "../units.ts";

export interface PairConfig {
  id: string;
  type: string;
  isPressure: boolean;
  isNorthSouth: boolean;
  /** Where along the line the map's badge sits, 0 at the first station. */
  midpointPosition: number;
  startId: string;
  endId: string;
  unit: "hPa" | "°C";
}

/** The dictionary key of a pair's name, e.g. `weather.pairName.KLO_LUG`. */
export function pairNameKey(id: string): string {
  return `weather.pairName.${id}`;
}

export const PAIRS: PairConfig[] = [
  {
    id: "KLO_LUG",
    type: "PRESSURE_NORTH_SOUTH",
    isPressure: true,
    isNorthSouth: true,
    midpointPosition: 0.25,
    startId: "meteo_swiss:KLO",
    endId: "meteo_swiss:LUG",
    unit: "hPa",
  },
  {
    id: "GVE_GUT",
    type: "PRESSURE_EAST_WEST",
    isPressure: true,
    isNorthSouth: false,
    midpointPosition: 0.5,
    startId: "meteo_swiss:GVE",
    endId: "meteo_swiss:GUT",
    unit: "hPa",
  },
  {
    id: "PIL_MTR",
    type: "TEMPERATURE_NORTH_SOUTH",
    isPressure: false,
    isNorthSouth: true,
    midpointPosition: 0.4,
    startId: "meteo_swiss:PIL",
    endId: "meteo_swiss:MTR",
    unit: "°C",
  },
  {
    id: "DEM_GRE",
    type: "PRESSURE_NORTH_SOUTH",
    isPressure: true,
    isNorthSouth: true,
    midpointPosition: 0.5,
    startId: "meteo_swiss:DEM",
    endId: "meteo_swiss:GRE",
    unit: "hPa",
  },
];

/** Each pair station's position as upstream's measurements give it
 * (longitude, latitude; read on 2026-11-23). fetch.ts asks only for the box
 * around a parameter's stations, so the Function parses about 40 KB rather
 * than the whole of Switzerland's measurements. */
export const STATION_POSITIONS: Record<string, [number, number]> = {
  "meteo_swiss:KLO": [8.535961, 47.479611],
  "meteo_swiss:LUG": [8.960322, 46.004217],
  "meteo_swiss:GVE": [6.127742, 46.247519],
  "meteo_swiss:GUT": [9.279428, 47.601733],
  "meteo_swiss:PIL": [8.252256, 46.978869],
  "meteo_swiss:MTR": [8.924742, 46.410103],
  "meteo_swiss:DEM": [7.349567, 47.351706],
  "meteo_swiss:GRE": [7.415144, 47.179097],
};

export const DEFAULT_PAIR = "KLO_LUG";

/** The pair for `id`; an unknown id gets the Gotthard pair, as before. */
export function pairConfig(id: string | null | undefined): PairConfig {
  return PAIRS.find((p) => p.id === id) ?? PAIRS[0];
}

/** The pair's difference from its two stations' values (hPa or °C, already
 * converted), rounded; null when either is missing. */
export function pairDelta(
  cfg: PairConfig,
  v1: number | null,
  v2: number | null,
): number | null {
  if (v1 === null || v2 === null || !Number.isFinite(v1 + v2)) return null;
  if (cfg.isPressure && cfg.id !== "GVE_GUT") return round1(v2 - v1);
  return round1(v1 - v2);
}

/** The upstream parameter a pair reads, for its current values and its
 * history alike: QNH (`pressure_standard_msl`) for a pressure pair, as the
 * official app reads (APK `ch/shv_fsvl/feature/livemap/d.java`, `e.java`),
 * and the "QNH" the weather page labels it. */
export function historyParameter(cfg: PairConfig): string {
  return cfg.isPressure ? "pressure_standard_msl" : "temperature";
}

export interface HistoryPoint {
  /** HH:MM in Swiss time. */
  time: string;
  timestamp: number;
  /** The difference, in the pair's unit despite the name (the client reads it). */
  diffHpa: number;
  unit: PairConfig["unit"];
}

function series(ts: TimeseriesResponse | null, parameter: string) {
  return (
    ts?.timeseries?.find((t) => t.parameter === parameter)?.measurements ?? []
  );
}

/** The pair's difference over the last 24 hours, at the times both
 * stations report; [] when either series is missing or empty. */
export function pairHistory(
  cfg: PairConfig,
  start: TimeseriesResponse | null,
  end: TimeseriesResponse | null,
  now: Date,
): HistoryPoint[] {
  const parameter = historyParameter(cfg);
  const convert = cfg.isPressure ? toHpa : toCelsius;
  const first = new Map<number, number>();
  for (const m of series(start, parameter)) {
    const v = convert(m.value);
    if (m.time && v !== null) first.set(m.time, v);
  }
  const cutoff = now.getTime() - 24 * 3600 * 1000;
  const history: HistoryPoint[] = [];
  for (const m of series(end, parameter)) {
    if (m.time < cutoff || !first.has(m.time)) continue;
    const diff = pairDelta(cfg, first.get(m.time) ?? null, convert(m.value));
    if (diff === null) continue;
    history.push({
      time: swissTime(m.time),
      timestamp: m.time,
      diffHpa: diff,
      unit: cfg.unit,
    });
  }
  return history;
}
