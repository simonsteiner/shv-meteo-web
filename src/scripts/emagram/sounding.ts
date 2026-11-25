// A forecast sounding from upstream's point data, in two halves. The
// Function only checks a run (`pointProblem`) and passes its text on
// without re-serialising it; the browser turns it into levels
// (`soundingFromForecast`). On
// Pages, doing the level maths and writing its JSON in the Function took 3
// to 21 ms CPU per sounding, over the Free plan's 10 ms
// (docs/architecture/data-queries.md). Pure.
import type { GridPoint, Sounding } from "../types.ts";
import { round1 } from "../units.ts";
import {
  parsePointData,
  pointValidTimes,
  soundingLevels,
  SOUNDING_PARAMETERS,
  valuesAt,
  type SoundingParameter,
} from "./levels.ts";

/** Upstream's answer for one point and run with all six series
 * (`/v1/point-data/<model>/<run>/<point>?parameters=...`). */
export interface PointAnswer {
  parameters?: Partial<Record<SoundingParameter, unknown>>;
}

/** What the sounding Function answers: the station's grid point and run,
 * and upstream's point data as it came. */
export interface SoundingForecast {
  station: Pick<
    GridPoint,
    "name" | "model" | "elevation" | "latitude" | "longitude"
  >;
  run: number;
  point: PointAnswer;
}

/** A series upstream left out is [] (`pointProblem` names it); one that is
 * there but misshapen throws. */
function matrices(point: PointAnswer): Record<SoundingParameter, number[][]> {
  const series = point.parameters ?? {};
  return Object.fromEntries(
    SOUNDING_PARAMETERS.map((p) => [
      p,
      series[p] === undefined ? [] : parsePointData(series[p]),
    ]),
  ) as Record<SoundingParameter, number[][]>;
}

/** Pressure must fall at least this much (hPa) from the ground to the
 * model top (22 km): a real column spans 700 hPa or more. On 2026-11-23
 * upstream sent ICON columns whose 80 levels all held about one pressure
 * (786.7 to 787.0 hPa at Interlaken, 526 to 562 at Scuol). */
const MIN_COLUMN_SPAN_HPA = 300;

/** Why `point` makes no sounding (a series missing, no time steps, a
 * column whose pressure barely falls with height, or no time step with one
 * complete level), or null when it is usable. Levels are stored top first,
 * so the ground is the last. */
export function pointProblem(point: PointAnswer): string | null {
  const m = matrices(point);
  for (const p of SOUNDING_PARAMETERS)
    if (!m[p].some((row) => row.length > 0)) return `no ${p}`;
  const steps = pointValidTimes(point.parameters?.temperature).length;
  if (steps === 0) return "no time steps";
  const top = m.pressure[0];
  const ground = m.pressure[m.pressure.length - 1];
  for (let t = 0; t < steps; t++) {
    const span = (ground[t] - top[t]) / 100;
    if (!(span >= MIN_COLUMN_SPAN_HPA))
      return `pressure falls ${round1(span)} hPa from the ground to the top at step ${t}`;
  }
  // a series still being written holds only nulls: no level is complete
  // (soundingLevels leaves such levels out), so there is nothing to draw;
  // a usable run stops at step 0
  for (let t = 0; t < steps; t++)
    if (soundingLevels(valuesAt(m, t)).length > 0) return null;
  return "no complete level";
}

/** The sounding the forecast view draws, as the Function used to answer
 * it: every time step's levels from the ground up to 550 hPa. */
export function soundingFromForecast(forecast: SoundingForecast): Sounding {
  const { station, run, point } = forecast;
  const m = matrices(point);
  const validTimes = pointValidTimes(point.parameters?.temperature);
  return {
    stationName: station.name,
    model: station.model,
    run,
    elevation: Math.round(station.elevation),
    latitude: station.latitude,
    longitude: station.longitude,
    validTimes,
    timeSteps: validTimes.map((timestamp, t) => ({
      timestamp,
      levels: soundingLevels(valuesAt(m, t)),
    })),
  };
}
