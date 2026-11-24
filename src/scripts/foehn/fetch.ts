// The upstream calls behind /api/foehn: the current values the pairs read,
// in one call per parameter (pressure_msl for the pressure pairs,
// temperature for the Pilatus/Matro pair), each limited to that parameter
// and to the box around its stations (about 20 KB each), and the requested
// pair's two series for its history, from 25 hours ago (about 6 KB each).
// Parsing the unfiltered Swiss bbox and 14-day series instead (0.98 MB) took
// 8 to 29 ms CPU per report on Pages, over the Free plan's 10 ms
// (docs/architecture/data-queries.md). A failed measurements call fails the
// route (its 503); a failed series only empties the history.
import type { MeasurementFeature, TimeseriesResponse } from "../types.ts";
import { fetchUpstream } from "../upstream/fetch.ts";
import { ROUTES, startBefore, WEATHER } from "../upstream/routes.ts";
import {
  historyParameter,
  PAIRS,
  pairConfig,
  STATION_POSITIONS,
} from "./pairs.ts";
import { foehnReport } from "./report.ts";

/** Degrees a box reaches past its outermost stations, about 2 km: room for
 * upstream's rounding of a position. */
const BOX_MARGIN = 0.02;

/** What each measurements call asks upstream for: a pressure station
 * without an MSL value falls back to its standard MSL or surface pressure
 * (`stationPressure` in report.ts), and `parameters=` drops every field it
 * doesn't name. */
const CURRENT_PARAMETERS: Record<string, string> = {
  pressure_msl: "pressure_msl,pressure_standard_msl,pressure_surface",
};

/** Each call's timeout. */
const TIMEOUT_MS = ROUTES.foehn.timeoutMs;

/** The pair stations by the upstream parameter their pairs read. */
export function stationsByParameter(): Map<string, string[]> {
  const byParameter = new Map<string, string[]>();
  for (const cfg of PAIRS) {
    const ids = byParameter.get(historyParameter(cfg)) ?? [];
    for (const id of [cfg.startId, cfg.endId])
      if (!ids.includes(id)) ids.push(id);
    byParameter.set(historyParameter(cfg), ids);
  }
  return byParameter;
}

/** The current values of `parameter` (with its fallbacks) in the box around
 * `stationIds`. */
export function measurementsUrl(
  parameter: string,
  stationIds: string[],
): string {
  const lons = stationIds.map((id) => STATION_POSITIONS[id][0]);
  const lats = stationIds.map((id) => STATION_POSITIONS[id][1]);
  const d = BOX_MARGIN;
  const box = [
    `minLat=${Math.min(...lats) - d}`,
    `minLon=${Math.min(...lons) - d}`,
    `maxLat=${Math.max(...lats) + d}`,
    `maxLon=${Math.max(...lons) + d}`,
  ].join("&");
  return `${WEATHER}/measurements/current?${box}&parameters=${CURRENT_PARAMETERS[parameter] ?? parameter}`;
}

/** The pair stations' current measurements; rejects when any call fails. A
 * station missing from its answer is logged and left out, which drops its
 * pair from the report. */
async function measurements(
  fetchFn: typeof fetch,
): Promise<MeasurementFeature[]> {
  const answers = await Promise.all(
    [...stationsByParameter()].map(async ([parameter, ids]) => {
      const res = await fetchUpstream(
        measurementsUrl(parameter, ids),
        TIMEOUT_MS,
        fetchFn,
      );
      if (!res.ok)
        throw new Error(`${parameter} measurements answered ${res.status}`);
      const body = (await res.json()) as { features?: MeasurementFeature[] };
      const byId = new Map((body.features ?? []).map((f) => [f.id, f]));
      return ids.flatMap((id) => {
        const station = byId.get(id);
        if (station) return [station];
        console.error(
          `[foehn] No ${parameter} for ${id}, its pair is left out`,
        );
        return [];
      });
    }),
  );
  return answers.flat();
}

/** How far back a series is asked for: the history's 24 hours and one more,
 * so the Function's and upstream's clocks never cut its first point.
 * Without `start` upstream sends 14 days (about 76 KB rather than 6 KB). */
const SERIES_SPAN_MS = 25 * 3600 * 1000;

/** When a series asked for at `at` (epoch ms) starts, rounded down to the
 * minute (`startBefore`). */
export function seriesStart(at: number): number {
  return startBefore(at, SERIES_SPAN_MS);
}

/** `stationId`'s series of `parameter` since `since` (epoch ms). */
export function seriesUrl(
  stationId: string,
  parameter: string,
  since: number,
): string {
  return `${WEATHER}/measurements/timeseries/${encodeURIComponent(stationId)}?parameters=${parameter}&start=${since}`;
}

async function series(
  stationId: string,
  parameter: string,
  since: number,
  fetchFn: typeof fetch,
): Promise<TimeseriesResponse | null> {
  const url = seriesUrl(stationId, parameter, since);
  try {
    const res = await fetchUpstream(url, TIMEOUT_MS, fetchFn);
    if (!res.ok) throw new Error(`upstream answered ${res.status}`);
    return (await res.json()) as TimeseriesResponse;
  } catch (err) {
    console.error(
      `[foehn] Series ${stationId} failed, history left empty:`,
      err,
    );
    return null;
  }
}

/** The report as a JSON Response; rejects when the measurements fail. */
export async function foehnResponse(
  pairId: string,
  fetchFn: typeof fetch = fetch,
  now: () => Date = () => new Date(),
): Promise<Response> {
  const cfg = pairConfig(pairId);
  const parameter = historyParameter(cfg);
  const at = now();
  const since = seriesStart(at.getTime());
  const [stations, start, end] = await Promise.all([
    measurements(fetchFn),
    series(cfg.startId, parameter, since, fetchFn),
    series(cfg.endId, parameter, since, fetchFn),
  ]);
  const report = foehnReport(
    stations,
    { [cfg.startId]: start, [cfg.endId]: end },
    cfg.id,
    at,
  );
  return Response.json(report);
}
