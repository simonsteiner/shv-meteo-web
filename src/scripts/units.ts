// Upstream's weather units are quirky: a temperature above 200 is Kelvin,
// a pressure above 5000 is in tenths of hPa (wind and gusts already arrive
// in km/h). Unrounded; callers round as they need. 0 is a value, not
// missing.

/** Degrees Celsius from Celsius or Kelvin. */
export function toCelsius(v: number | null | undefined): number | null {
  if (v == null || Number.isNaN(v)) return null;
  return v > 200 ? v - 273.15 : v;
}

/** hPa from hPa or tenths of hPa. */
export function toHpa(v: number | null | undefined): number | null {
  if (v == null || Number.isNaN(v)) return null;
  return v > 5000 ? v / 10 : v;
}

/** Rounded to one decimal, as every value the UI shows. */
export function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
