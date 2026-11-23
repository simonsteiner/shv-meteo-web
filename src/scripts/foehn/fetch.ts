// The three upstream calls behind /api/foehn: the measurements of the Swiss
// bbox, which holds all eight pair stations (0.84 MB rather than the Alps'
// 3.1 MB), and the requested pair's two series for its history. A failed
// measurements call fails the route (its 503); a failed series only empties
// the history.
import type { MeasurementFeature, TimeseriesResponse } from "../types.ts";
import { fetchUpstream } from "../upstream/fetch.ts";
import { pairConfig, historyParameter } from "./pairs.ts";
import { foehnReport } from "./report.ts";

const WEATHER = "https://weather-ws-prod.ubmeteo.io/v1";
export const SWISS_MEASUREMENTS_URL = `${WEATHER}/measurements/current?minLat=45.8&minLon=5.9&maxLat=47.8&maxLon=10.5`;

/** Each call's timeout. */
const TIMEOUT_MS = 8_000;

async function series(
  stationId: string,
  parameter: string,
  fetchFn: typeof fetch,
): Promise<TimeseriesResponse | null> {
  const url = `${WEATHER}/measurements/timeseries/${encodeURIComponent(stationId)}?parameters=${parameter}`;
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
  const [measurements, start, end] = await Promise.all([
    fetchUpstream(SWISS_MEASUREMENTS_URL, TIMEOUT_MS, fetchFn).then(
      async (res) => {
        if (!res.ok) throw new Error(`measurements answered ${res.status}`);
        const body = (await res.json()) as { features?: MeasurementFeature[] };
        return body.features ?? [];
      },
    ),
    series(cfg.startId, parameter, fetchFn),
    series(cfg.endId, parameter, fetchFn),
  ]);
  const report = foehnReport(
    measurements,
    { [cfg.startId]: start, [cfg.endId]: end },
    cfg.id,
    now(),
  );
  return Response.json(report);
}
