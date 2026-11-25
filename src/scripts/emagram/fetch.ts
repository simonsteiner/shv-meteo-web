// /api/meteo/previtemps/forecast/<name>: a catalogue station's ICON point
// data for the newest usable run, passed on as upstream sent it inside a
// small envelope (`SoundingForecast`); the browser turns it into levels
// (sounding.ts). Up to `1 + RUNS_TRIED` upstream calls, 8 s each: the
// model's runs list, then per run tried the point's six series in one
// answer (`?parameters=`, about 160 KB). Upstream lists its runs newest
// first; a run with a series missing (still being ingested) or a column
// that is no atmosphere (`pointProblem`) is passed over for the one before,
// as the official app uses only complete runs, but no further: when two
// runs in a row are unusable upstream is broken, and parsing another costs
// CPU for nothing. An unknown name is a 404; no usable run is the route's
// 503, logged with the station (a station whose grid point moved shows the
// 503 until `npm run grid` runs again).
import type { Context, GridPoint } from "../types.ts";
import { fetchUpstream } from "../upstream/fetch.ts";
import { serve } from "../upstream/respond.ts";
import { gridPoint, GRID } from "./grid.ts";
import { SOUNDING_PARAMETERS } from "./levels.ts";
import {
  pointProblem,
  type PointAnswer,
  type SoundingForecast,
} from "./sounding.ts";

const POINT_DATA = "https://weather-ws-prod.ubmeteo.io/v1/point-data";
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
  timeoutMs: number,
  fetchFn: typeof fetch,
): Promise<string> {
  const url = soundingUrl(point, run);
  const res = await fetchUpstream(url, timeoutMs, fetchFn);
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
  timeoutMs: number,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const url = `${POINT_DATA}/${point.modelKey}/runs`;
  const res = await fetchUpstream(url, timeoutMs, fetchFn);
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  const { runs } = (await res.json()) as { runs?: number[] };
  // newest first, whatever order upstream lists them in
  const list = [...(runs ?? [])].sort((a, b) => b - a).slice(0, RUNS_TRIED);
  if (list.length === 0) throw new Error(`no runs for ${point.modelKey}`);
  for (const [i, run] of list.entries()) {
    try {
      const text = await pointOfRun(point, run, timeoutMs, fetchFn);
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

/** The whole route: what the Function calls. The route's `parse` has made
 * sure the name is in the catalogue. */
export function soundingRoute(
  ctx: Context,
  fetchFn: typeof fetch = fetch,
): Promise<Response> {
  return serve("sounding", ctx, async ({ name }, timeoutMs) => {
    // the route's `parse` has answered the 404 for a name not in the grid
    const point = gridPoint(name, GRID);
    if (!point) throw new Error(`no grid point for ${name}`);
    try {
      return new Response(await fetchForecast(point, timeoutMs, fetchFn), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error(`[sounding] ${point.name} failed:`, err);
      throw err;
    }
  });
}
