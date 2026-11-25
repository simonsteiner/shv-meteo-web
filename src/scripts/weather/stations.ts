// A station's latest values as the weather page shows them, converted
// through units.ts (upstream sends Kelvin and pascals at times; wind
// and gusts already arrive in km/h), and the station list's filters.

import type { MeasurementFeature } from "../types.ts";
import { round1, toCelsius, toHpa } from "../units.ts";

/** The provider filter's keys, in the order the pills show them. */
export const PROVIDERS = [
  "ALL",
  "meteo_swiss",
  "meteo_france",
  "mistral",
  "geosphere_austria",
  "dwd",
  "slf",
  "holfuy",
] as const;
export type Provider = (typeof PROVIDERS)[number];

export interface StationValues {
  /** km/h, rounded to 0.1 */
  windKmh: number | null;
  gustKmh: number | null;
  /** Degrees the wind comes from. */
  dirDeg: number | null;
  /** °C, rounded to 0.1 */
  tempC: number | null;
  dewC: number | null;
  /** %, rounded */
  humidity: number | null;
  /** Sea-level pressure (QNH), hPa, rounded */
  qnhHpa: number | null;
  /** Pressure at the station itself (QFE), hPa, rounded; not a QNH */
  surfaceHpa: number | null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function rounded(v: number | null): number | null {
  return v === null ? null : round1(v);
}

export function stationValues(st: MeasurementFeature): StationValues {
  const p = st.properties;
  const wind = num(p.windSpeedValue);
  const gust = num(p.windGustValue);
  const qnh = toHpa(num(p.pressureMslValue) ?? num(p.pressureStandardMslValue));
  const surface = toHpa(num(p.pressureSurfaceValue));
  const humidity =
    num(p.relativeHumidity2mValue) ?? num(p.relativeHumidityValue);
  return {
    windKmh: rounded(wind),
    gustKmh: rounded(gust),
    dirDeg: num(p.windDirectionValue),
    tempC: rounded(
      toCelsius(num(p.temperature2mValue) ?? num(p.temperatureValue)),
    ),
    dewC: rounded(toCelsius(num(p.dewPoint2mValue) ?? num(p.dewPointValue))),
    humidity: humidity === null ? null : Math.round(humidity),
    qnhHpa: qnh === null ? null : Math.round(qnh),
    surfaceHpa: surface === null ? null : Math.round(surface),
  };
}

/** The warning class for a wind speed: 30 km/h and more is danger, 20 is a
 * warning. */
export function windClass(kmh: number | null): string {
  if (kmh === null) return "";
  if (kmh >= 30) return "text-danger";
  if (kmh >= 20) return "text-warning";
  return "";
}

/** The stations of `provider` whose name or id holds `search`, ignoring
 * case. */
export function filterStations(
  stations: readonly MeasurementFeature[],
  provider: Provider,
  search: string,
): MeasurementFeature[] {
  const q = search.trim().toLowerCase();
  return stations.filter((st) => {
    const p = st.properties;
    if (provider !== "ALL" && (p.providerKey ?? "").toLowerCase() !== provider)
      return false;
    if (!q) return true;
    const name = (p.name ?? "").toLowerCase();
    const id = (p.stationIdentifier || st.id || "").toLowerCase();
    return name.includes(q) || id.includes(q);
  });
}
