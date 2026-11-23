// The four station pairs of the official app (its
// PressureDifferenceGeoJsonTransformer), their difference and its 24-hour
// history. A pair id names its two stations: KLO_LUG is Kloten and Lugano.
// Pressure pairs are south minus north, except GVE_GUT, which is west minus
// east; the temperature pair is the first station minus the second.
import type { TimeseriesResponse } from "../types.ts";
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
  nameDe: string;
  nameEn: string;
  unit: "hPa" | "°C";
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
    nameDe: "Gotthard-Achse (Zürich/Kloten \u2013 Lugano)",
    nameEn: "Gotthard Axis (Zurich/Kloten \u2013 Lugano)",
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
    nameDe: "Ost-West Gradient / Bise (Genf \u2013 Güttingen)",
    nameEn: "East-West Gradient / Bise (Geneva \u2013 Guettingen)",
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
    nameDe: "Alpenkamm Temperatur (Pilatus 2105m \u2013 Matro 2171m)",
    nameEn: "Alpine Crest Temperature (Pilatus \u2013 Matro)",
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
    nameDe: "Jura-Querung (Delémont \u2013 Grenchen)",
    nameEn: "Jura Transect (Delemont \u2013 Grenchen)",
    unit: "hPa",
  },
];

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
  if (v1 === null || v2 === null) return null;
  if (cfg.isPressure && cfg.id !== "GVE_GUT") return round1(v2 - v1);
  return round1(v1 - v2);
}

/** The upstream series a pair's history reads. */
export function historyParameter(cfg: PairConfig): string {
  return cfg.isPressure ? "pressure_msl" : "temperature";
}

export interface HistoryPoint {
  /** HH:MM in Swiss time. */
  time: string;
  timestamp: number;
  /** The difference, in the pair's unit despite the name (the client reads it). */
  diffHpa: number;
  unit: PairConfig["unit"];
}

const SWISS_TIME = new Intl.DateTimeFormat("de-CH", {
  timeZone: "Europe/Zurich",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** HH:MM of `ms` in Europe/Zurich, whatever the runtime's own zone. */
export function swissTime(ms: number): string {
  return SWISS_TIME.format(new Date(ms));
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
