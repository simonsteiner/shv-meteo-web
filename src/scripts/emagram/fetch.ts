// /api/meteo/previtemps/forecast/<name>: a catalogue station's ICON point
// data for the newest usable run, passed on as upstream sent it inside a
// small envelope (`SoundingForecast`); the browser turns it into levels
// (sounding.ts). Two upstream calls, 8 s each: the model's runs list, then
// the point's six series in one answer (`?parameters=`, about 160 KB).
// Upstream lists its runs newest first (three on 2026-11-23); a run with a
// series missing (still being ingested) or a column that is no atmosphere
// (`pointProblem`) is passed over for the one before, as the official app
// uses only complete runs, but no further: when two runs in a row are
// unusable upstream is broken, and parsing a third costs CPU for nothing. An unknown name is a 404; no usable
// run is the route's 503, logged with the station (a station whose grid
// point moved shows the 503 until `npm run grid` runs again).
import type { Context, GridPoint, PrevitempsGrid } from "../types.ts";
import { fetchUpstream } from "../upstream/fetch.ts";
import { serve } from "../upstream/respond.ts";
import { ROUTES } from "../upstream/routes.ts";
import { gridPoint } from "./grid.ts";
import { SOUNDING_PARAMETERS } from "./levels.ts";
import {
  pointProblem,
  type PointAnswer,
  type SoundingForecast,
} from "./sounding.ts";

const POINT_DATA = "https://weather-ws-prod.ubmeteo.io/v1/point-data";
/** Each call's timeout. */
const TIMEOUT_MS = ROUTES.sounding.timeoutMs;

/** How many runs are tried, newest first: the newest and the one before. */
const RUNS_TRIED = 2;

/** The point's six series of `run` in one answer. */
export function soundingUrl(point: GridPoint, run: number): string {
  return `${POINT_DATA}/${point.modelKey}/${run}/${point.pointIndex}?parameters=${SOUNDING_PARAMETERS.join(",")}`;
}

/** `run`'s point data for the station, as upstream's text; rejects when
 * upstream fails or the data makes no sounding. */
async function pointOfRun(
  point: GridPoint,
  run: number,
  fetchFn: typeof fetch,
): Promise<string> {
  const url = soundingUrl(point, run);
  const res = await fetchUpstream(url, TIMEOUT_MS, fetchFn);
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  const text = await res.text();
  // a run still being ingested, or a broken one: upstream failures, so
  // neither replaces the last good copy
  const problem = pointProblem(JSON.parse(text) as PointAnswer);
  if (problem) throw new Error(`run ${run} of ${point.name}: ${problem}`);
  return text;
}

/** The station's forecast from the newest run that makes a sounding, as
 * the route's JSON text. */
export async function fetchForecast(
  point: GridPoint,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const url = `${POINT_DATA}/${point.modelKey}/runs`;
  const res = await fetchUpstream(url, TIMEOUT_MS, fetchFn);
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  const { runs } = (await res.json()) as { runs?: number[] };
  // newest first, whatever order upstream lists them in
  const list = [...(runs ?? [])].sort((a, b) => b - a).slice(0, RUNS_TRIED);
  if (list.length === 0) throw new Error(`no runs for ${point.modelKey}`);
  for (const [i, run] of list.entries()) {
    try {
      const text = await pointOfRun(point, run, fetchFn);
      const { name, model, elevation, latitude, longitude } = point;
      const envelope: Omit<SoundingForecast, "point"> = {
        station: { name, model, elevation, latitude, longitude },
        run,
      };
      // upstream's text goes in as it is: pointProblem has parsed it, but
      // building the levels and writing them back out is the CPU this
      // route has to save
      return `${JSON.stringify(envelope).slice(0, -1)},"point":${text}}`;
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
        return new Response(await fetchForecast(point, fetchFn), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (err) {
        console.error(`[sounding] ${point.name} failed:`, err);
        throw err;
      }
    },
    { check: ({ name }) => (gridPoint(name, grid) ? null : unknownStation()) },
  );
}
