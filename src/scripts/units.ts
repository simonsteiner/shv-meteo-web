// Upstream's weather units are quirky: a temperature above 200 is Kelvin,
// a pressure above 20,000 is in pascals (wind and gusts already arrive in
// km/h). On 2026-11-25 Holfuy and Mistral sent `pressureSurfaceValue` in
// pascals (258 stations, Pallanza 98730), every other provider and field in
// hPa, and no station tenths of hPa. 83 of those 258 sent a pressure no
// station can measure (82 Mistral stations 163820 Pa, Holfuy's Bälmeten at
// 2414 m 137000 Pa); outside 300 to 1100 hPa a pressure is missing. Unrounded;
// callers round as they need. A temperature of 0 is a value, not missing.

/** Degrees Celsius from Celsius or Kelvin. */
export function toCelsius(v: number | null | undefined): number | null {
  if (v == null || Number.isNaN(v)) return null;
  return v > 200 ? v - 273.15 : v;
}

/** The pressures a station can measure, in hPa: the summit of Mont Blanc
 * reads about 550, the highest sea-level pressure on record about 1084. */
const MIN_HPA = 300;
const MAX_HPA = 1100;

/** hPa from hPa or pascals; null outside MIN_HPA to MAX_HPA. */
export function toHpa(v: number | null | undefined): number | null {
  if (v == null || Number.isNaN(v)) return null;
  const hpa = v > 20000 ? v / 100 : v;
  return hpa >= MIN_HPA && hpa <= MAX_HPA ? hpa : null;
}

/** Rounded to one decimal, as every value the UI shows. */
export function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
