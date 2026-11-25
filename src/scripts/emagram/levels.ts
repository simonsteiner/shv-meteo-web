// The sounding at one time step from ICON point data: temperature, dew
// point, wind and lapse rate per model level, from the ground up to
// 550 hPa (about 5000 m, the top of a paragliding sounding chart). Ported
// from the Express sounding provider; pure.
import type { SoundingLevel } from "../types.ts";
import { obj } from "../coerce.ts";
import { round1 } from "../units.ts";

/** One parameter's point data as levels x time steps, from
 * `data.levels[l].ensembleMembers[0].timeSeries`; levels run from the top
 * of the atmosphere (0) down to the ground. A level without a series is [];
 * point data without a levels array throws, so a changed upstream shape is
 * an error and not an empty sounding. */
export function parsePointData(raw: unknown): number[][] {
  const levels = obj(obj(raw).data).levels;
  if (!Array.isArray(levels)) throw new Error("point data has no levels array");
  return levels.map((level) => {
    const members = obj(level).ensembleMembers;
    const series = obj(Array.isArray(members) ? members[0] : null).timeSeries;
    return Array.isArray(series) ? (series as number[]) : [];
  });
}

/** The point data's time steps, ms since the epoch. */
export function pointValidTimes(raw: unknown): number[] {
  const times = obj(raw).validTimes;
  return Array.isArray(times) ? (times as number[]) : [];
}

/** The parameters a sounding reads, as upstream names them. */
export const SOUNDING_PARAMETERS = [
  "temperature",
  "pressure",
  "specific_humidity",
  "height_half_level",
  "wind_u",
  "wind_v",
] as const;
export type SoundingParameter = (typeof SOUNDING_PARAMETERS)[number];

/** Dew point in °C from specific humidity (kg/kg) and pressure (hPa), by
 * Magnus-Tetens; -50 for no humidity, clamped to -60..45. */
export function dewPoint(qKg: number, pressHpa: number): number {
  if (!(qKg > 0) || !(pressHpa > 0)) return -50;
  const eHpa = (qKg * pressHpa) / (0.622 + 0.378 * qKg);
  const clamped = Math.max(1e-4, Math.min(eHpa, pressHpa * 0.99));
  const logE = Math.log(clamped / 6.112);
  return Math.max(-60, Math.min(45, (243.5 * logE) / (17.67 - logE)));
}

/** One time step's values per parameter, one per model level (top first).
 * The height is a constant field: a single value per level serves every
 * time step. */
export function valuesAt(
  matrices: Record<SoundingParameter, number[][]>,
  t: number,
): Record<SoundingParameter, (number | undefined)[]> {
  const at = (rows: number[][], constant = false) =>
    rows.map((row) => (constant && row.length === 1 ? row[0] : row[t]));
  return {
    temperature: at(matrices.temperature),
    pressure: at(matrices.pressure),
    specific_humidity: at(matrices.specific_humidity),
    height_half_level: at(matrices.height_half_level, true),
    wind_u: at(matrices.wind_u),
    wind_v: at(matrices.wind_v),
  };
}

const isNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

/** The sounding's levels at one time step, ground first, up to 550 hPa. A
 * level missing any value is left out rather than filled in. */
export function soundingLevels(
  byParam: Record<SoundingParameter, (number | undefined)[]>,
): SoundingLevel[] {
  const levels: SoundingLevel[] = [];
  for (let l = byParam.temperature.length - 1; l >= 0; l--) {
    const tempK = byParam.temperature[l];
    const pressPa = byParam.pressure[l];
    const q = byParam.specific_humidity[l];
    const heightM = byParam.height_half_level[l];
    const u = byParam.wind_u[l];
    const v = byParam.wind_v[l];
    if (
      !isNumber(tempK) ||
      !isNumber(pressPa) ||
      !isNumber(q) ||
      !isNumber(heightM) ||
      !isNumber(u) ||
      !isNumber(v)
    )
      continue;
    const pressHpa = pressPa / 100;
    if (pressHpa < 550) break;
    levels.push({
      heightM: Math.round(heightM),
      pressHpa: round1(pressHpa),
      tempC: round1(tempK - 273.15),
      dewC: round1(dewPoint(q, pressHpa)),
      speedKmH: round1(Math.hypot(u, v) * 3.6),
      // where the wind comes from, in degrees
      dirDeg: Math.round(((Math.atan2(-u, -v) * 180) / Math.PI + 360) % 360),
      lapseRate: 0,
    });
  }
  levels.sort((a, b) => a.heightM - b.heightM);
  for (let i = 1; i < levels.length; i++) {
    const dz = levels[i].heightM - levels[i - 1].heightM;
    const dt = levels[i].tempC - levels[i - 1].tempC;
    levels[i].lapseRate = dz > 10 ? round1(dt / (dz / 100)) : 0;
  }
  return levels;
}
