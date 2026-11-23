// The Foehn report /api/foehn answers: every pair's current difference and
// alert level, their GeoJSON for the map, and the 24-hour history of one
// pair. Pure: the measurements, the two stations' series and the clock are
// parameters (foehn/fetch.ts gathers them).
import type { MeasurementFeature, TimeseriesResponse } from "../types.ts";
import { round1, toCelsius, toHpa } from "../units.ts";
import {
  PAIRS,
  pairConfig,
  pairDelta,
  pairHistory,
  type HistoryPoint,
  type PairConfig,
} from "./pairs.ts";

type AlertLevel = "NONE" | "MODERATE" | "DANGER";

export interface PairStation {
  id: string;
  name: unknown;
  altitude: unknown;
  pressureHpa: number | null;
  temperatureC: number | null;
  coordinates: [number, number] | undefined;
}

export interface StationPair extends Omit<PairConfig, "startId" | "endId"> {
  delta: number | null;
  status: string;
  alertLevel: AlertLevel;
  descriptionDe: string;
  descriptionEn: string;
  station1: PairStation;
  station2: PairStation;
}

export interface FoehnReport {
  primaryPair: {
    id: string;
    name: string;
    northStation: { name: unknown; pressureHpa: number | null };
    southStation: { name: unknown; pressureHpa: number | null };
    diffHpa: number | null;
    status: string;
    alertLevel: AlertLevel;
    descriptionDe: string;
    descriptionEn: string;
  } | null;
  pairs: StationPair[];
  geoJson: { type: "FeatureCollection"; features: object[] };
  history: HistoryPoint[];
  thresholds: { moderateThresholdHpa: number; severeThresholdHpa: number };
  updatedAt: string;
}

function num(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}

/** MSL pressure in hPa, rounded; standard MSL or surface pressure when the
 * station reports no MSL value. */
export function stationPressure(st: MeasurementFeature): number | null {
  const p = st.properties;
  const v = toHpa(
    num(p.pressureMslValue) ??
      num(p.pressureStandardMslValue) ??
      num(p.pressureSurfaceValue),
  );
  return v === null ? null : round1(v);
}

export function stationTemperature(st: MeasurementFeature): number | null {
  const p = st.properties;
  const v = toCelsius(num(p.temperature2mValue) ?? num(p.temperatureValue));
  return v === null ? null : round1(v);
}

/** The status, alert level and texts for a pair's difference. */
export function assess(
  cfg: PairConfig,
  delta: number | null,
): Pick<
  StationPair,
  "status" | "alertLevel" | "descriptionDe" | "descriptionEn"
> {
  const calm = {
    status: "CALM",
    alertLevel: "NONE" as AlertLevel,
    descriptionDe: "Normale Druckverhältnisse. Sichere Bedingungen.",
    descriptionEn: "Normal pressure conditions. Safe flying conditions.",
  };
  if (delta === null) return calm;
  if (cfg.id === "KLO_LUG") {
    if (delta >= 8)
      return {
        status: "SEVERE_SOUTH_FOEHN",
        alertLevel: "DANGER",
        descriptionDe: `Starker Südföhn (+${delta} hPa)! Akute Lebensgefahr in den Föhntälern (starke Rotoren, schwere Sturmböen). Flugbetrieb einstellen!`,
        descriptionEn: `Severe South Foehn (+${delta} hPa)! Extreme hazard in alpine valleys (severe rotors, storm gusts). Cease flying!`,
      };
    if (delta >= 4)
      return {
        status: "MODERATE_SOUTH_FOEHN",
        alertLevel: "MODERATE",
        descriptionDe: `Mässiger Südföhn (+${delta} hPa). Zunehmende Turbulenz und Gefahr des Föhndurchbruchs in den Alpentälern.`,
        descriptionEn: `Moderate South Foehn (+${delta} hPa). Increasing turbulence and risk of Foehn breakthrough in valleys.`,
      };
    if (delta <= -8)
      return {
        status: "SEVERE_NORTH_FOEHN",
        alertLevel: "DANGER",
        descriptionDe: `Starker Nordföhn (${delta} hPa)! Gefährliche Turbulenzen und Lee-Rotoren auf der Alpensüdseite (Tessin).`,
        descriptionEn: `Severe North Foehn (${delta} hPa)! Dangerous turbulence and lee-wave rotors on the south side of the Alps.`,
      };
    if (delta <= -4)
      return {
        status: "MODERATE_NORTH_FOEHN",
        alertLevel: "MODERATE",
        descriptionDe: `Mässiger Nordföhn (${delta} hPa). Böig und turbulent im Tessin.`,
        descriptionEn: `Moderate North Foehn (${delta} hPa). Gusty and turbulent in Ticino.`,
      };
    return calm;
  }
  if (!cfg.isPressure) return calm;
  const signed = `${delta > 0 ? "+" : ""}${delta}`;
  if (Math.abs(delta) >= 6)
    return {
      ...calm,
      alertLevel: "DANGER",
      descriptionDe: `Starker Druckgradient (${signed} hPa). Starkwind und Turbulenzen im Transect.`,
    };
  if (Math.abs(delta) >= 3)
    return {
      ...calm,
      alertLevel: "MODERATE",
      descriptionDe: `Mässiger Gradient (${signed} hPa). Merkliche Ausgleichsströmung.`,
    };
  return calm;
}

function pairStation(st: MeasurementFeature): PairStation {
  return {
    id: st.id,
    name: st.properties.name,
    altitude: st.properties.altitude,
    pressureHpa: stationPressure(st),
    temperatureC: stationTemperature(st),
    // one station without a position drops only its pair's map features
    coordinates: st.geometry?.coordinates,
  };
}

function pairFeatures(pair: StationPair): object[] {
  const [c1, c2] = [pair.station1.coordinates, pair.station2.coordinates];
  if (!c1 || !c2) return [];
  const at = pair.midpointPosition;
  const common = {
    pairId: pair.id,
    delta: pair.delta,
    unit: pair.unit,
    alertLevel: pair.alertLevel,
  };
  return [
    {
      type: "Feature",
      id: `${pair.id}_line`,
      geometry: { type: "LineString", coordinates: [c1, c2] },
      properties: {
        ...common,
        isPressure: pair.isPressure,
        isNorthSouth: pair.isNorthSouth,
      },
    },
    {
      type: "Feature",
      id: `${pair.id}_midpoint`,
      geometry: {
        type: "Point",
        coordinates: [
          c1[0] + (c2[0] - c1[0]) * at,
          c1[1] + (c2[1] - c1[1]) * at,
        ],
      },
      properties: {
        ...common,
        nameDe: pair.nameDe,
        status: pair.status,
        station1_name: pair.station1.name,
        station2_name: pair.station2.name,
      },
    },
  ];
}

/** The report for `measurements`, with the history of `pairId` (unknown:
 * the Gotthard pair) from its two stations' series in `histories`, keyed by
 * station id; a missing or empty series gives `history: []`. */
export function foehnReport(
  measurements: MeasurementFeature[],
  histories: Record<string, TimeseriesResponse | null>,
  pairId: string,
  now: Date,
): FoehnReport {
  const byId = new Map(measurements.map((f) => [f.id, f]));
  const pairs: StationPair[] = [];
  for (const cfg of PAIRS) {
    const st1 = byId.get(cfg.startId);
    const st2 = byId.get(cfg.endId);
    if (!st1 || !st2) continue;
    const station1 = pairStation(st1);
    const station2 = pairStation(st2);
    const delta = cfg.isPressure
      ? pairDelta(cfg, station1.pressureHpa, station2.pressureHpa)
      : pairDelta(cfg, station1.temperatureC, station2.temperatureC);
    pairs.push({
      id: cfg.id,
      type: cfg.type,
      isPressure: cfg.isPressure,
      isNorthSouth: cfg.isNorthSouth,
      midpointPosition: cfg.midpointPosition,
      nameDe: cfg.nameDe,
      nameEn: cfg.nameEn,
      unit: cfg.unit,
      delta,
      ...assess(cfg, delta),
      station1,
      station2,
    });
  }
  const target = pairConfig(pairId);
  const gotthard = pairs.find((p) => p.id === "KLO_LUG");
  return {
    primaryPair: gotthard
      ? {
          id: gotthard.id,
          name: gotthard.nameDe,
          northStation: {
            name: gotthard.station1.name,
            pressureHpa: gotthard.station1.pressureHpa,
          },
          southStation: {
            name: gotthard.station2.name,
            pressureHpa: gotthard.station2.pressureHpa,
          },
          diffHpa: gotthard.delta,
          status: gotthard.status,
          alertLevel: gotthard.alertLevel,
          descriptionDe: gotthard.descriptionDe,
          descriptionEn: gotthard.descriptionEn,
        }
      : null,
    pairs,
    geoJson: {
      type: "FeatureCollection",
      features: pairs.flatMap(pairFeatures),
    },
    history: pairHistory(
      target,
      histories[target.startId] ?? null,
      histories[target.endId] ?? null,
      now,
    ),
    thresholds: { moderateThresholdHpa: 4, severeThresholdHpa: 8 },
    updatedAt: now.toISOString(),
  };
}
