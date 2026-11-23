// /api/meteo/previtemps/forecast/<name>: a catalogue station's ICON
// sounding over every time step of the latest run. Seven upstream calls,
// 8 s each: the model's runs list, then six point-data series (about
// 180 KB). An unknown name is a 404; any failed call is the route's 503,
// logged with the station (a station whose grid point moved shows the 503
// until `npm run grid` runs again).
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

/** The station's sounding, as the Express route returned it. */
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
  const list = runs.runs ?? [];
  const run = list[list.length - 1];
  if (run === undefined) throw new Error(`no runs for ${point.modelKey}`);
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
  return {
    stationName: point.name,
    model: point.model,
    run,
    elevation: Math.round(point.elevation),
    latitude: point.latitude,
    longitude: point.longitude,
    validTimes,
    timeSteps: validTimes.map((timestamp, t) => ({
      timestamp,
      timeIso: new Date(timestamp).toISOString(),
      levels: soundingLevels(valuesAt(matrices, t)),
    })),
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
