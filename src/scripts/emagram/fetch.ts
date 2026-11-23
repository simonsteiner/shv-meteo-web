// /api/meteo/previtemps/forecast/<name>: a catalogue station's ICON
// sounding over every time step of the newest run. Seven upstream calls,
// 8 s each: the model's runs list, then six point-data series (about
// 180 KB). Upstream lists its runs newest first and soon drops the older
// one; a run with a series missing (still being ingested) is passed over
// for the one before, as the official app does. An unknown name is a 404;
// no usable run is the route's 503, logged with the station (a station
// whose grid point moved shows the 503 until `npm run grid` runs again).
import type { Context, GridPoint, PrevitempsGrid, Sounding } from "../types.ts";
import { fetchUpstream } from "../upstream/fetch.ts";
import { serve } from "../upstream/respond.ts";
import { gridPoint } from "./grid.ts";
import {
  parsePointData,
  pointValidTimes,
  soundingLevels,
  SOUNDING_PARAMETERS,
  valuesAt,
  type SoundingParameter,
} from "./levels.ts";

const POINT_DATA = "https://weather-ws-prod.ubmeteo.io/v1/point-data";
const TIMEOUT_MS = 8_000;

async function json(url: string, fetchFn: typeof fetch): Promise<unknown> {
  const res = await fetchUpstream(url, TIMEOUT_MS, fetchFn);
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.json();
}

/** The station's sounding from the newest run that has all of it, as the
 * Express route returned it. */
export async function fetchSounding(
  point: GridPoint,
  fetchFn: typeof fetch = fetch,
): Promise<Sounding> {
  const runs = (await json(
    `${POINT_DATA}/${point.modelKey}/runs`,
    fetchFn,
  )) as {
    runs?: number[];
  };
  // newest first, whatever order upstream lists them in
  const list = [...(runs.runs ?? [])].sort((a, b) => b - a);
  if (list.length === 0) throw new Error(`no runs for ${point.modelKey}`);
  for (const [i, run] of list.entries()) {
    try {
      return await soundingOfRun(point, run, fetchFn);
    } catch (err) {
      if (i === list.length - 1) throw err;
      console.error(
        `[sounding] ${point.name} run ${run} unusable, trying the one before:`,
        err,
      );
    }
  }
  throw new Error(`no runs for ${point.modelKey}`);
}

async function soundingOfRun(
  point: GridPoint,
  run: number,
  fetchFn: typeof fetch,
): Promise<Sounding> {
  const base = `${POINT_DATA}/${point.modelKey}/${run}`;
  const raws = await Promise.all(
    SOUNDING_PARAMETERS.map((p) =>
      json(`${base}/${p}/${point.pointIndex}`, fetchFn),
    ),
  );
  const matrices = Object.fromEntries(
    SOUNDING_PARAMETERS.map((p, i) => [p, parsePointData(raws[i])]),
  ) as Record<SoundingParameter, number[][]>;
  const validTimes = pointValidTimes(raws[0]);
  const timeSteps = validTimes.map((timestamp, t) => ({
    timestamp,
    timeIso: new Date(timestamp).toISOString(),
    levels: soundingLevels(valuesAt(matrices, t)),
  }));
  // a run still being ingested answers without data: an upstream failure,
  // so it never replaces the last good copy
  if (!timeSteps.some((step) => step.levels.length > 0))
    throw new Error(`no levels for ${point.name} in run ${run}`);
  return {
    stationName: point.name,
    model: point.model,
    run,
    elevation: Math.round(point.elevation),
    latitude: point.latitude,
    longitude: point.longitude,
    validTimes,
    timeSteps,
  };
}

function unknownStation(): Response {
  return Response.json(
    { error: "Unbekannte Sondierungsstation" },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

/** The whole route over `grid`: what the Function calls. */
export function soundingRoute(
  ctx: Context,
  grid: PrevitempsGrid,
  fetchFn: typeof fetch = fetch,
): Promise<Response> {
  return serve(
    "sounding",
    ctx,
    async ({ name }) => {
      // check() below has made sure the name is in the catalogue
      const point = gridPoint(name, grid) as GridPoint;
      try {
        return Response.json(await fetchSounding(point, fetchFn));
      } catch (err) {
        console.error(`[sounding] ${point.name} failed:`, err);
        throw err;
      }
    },
    { check: ({ name }) => (gridPoint(name, grid) ? null : unknownStation()) },
  );
}
