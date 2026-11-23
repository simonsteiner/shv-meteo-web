// A forecast sounding from upstream's point data, in two halves. The
// Function only checks a run (`pointProblem`) and passes its answer on
// unparsed; the browser turns it into levels (`soundingFromForecast`). On
// Pages, doing the level maths and writing its JSON in the Function took 3
// to 21 ms CPU per sounding, over the Free plan's 10 ms
// (docs/architecture/data-queries.md). Pure.
import type { GridPoint, Sounding } from "../types.ts";
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

function matrices(point: PointAnswer): Record<SoundingParameter, number[][]> {
  const series = point.parameters ?? {};
  return Object.fromEntries(
    SOUNDING_PARAMETERS.map((p) => [p, parsePointData(series[p])]),
  ) as Record<SoundingParameter, number[][]>;
}

/** Why `point` makes no sounding (a series missing, no time steps), or
 * null when it is usable. */
export function pointProblem(point: PointAnswer): string | null {
  const m = matrices(point);
  for (const p of SOUNDING_PARAMETERS)
    if (!m[p].some((row) => row.length > 0)) return `no ${p}`;
  const steps = pointValidTimes(point.parameters?.temperature).length;
  if (steps === 0) return "no time steps";
  return null;
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
