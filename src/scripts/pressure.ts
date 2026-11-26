// Which pressures a station shows, the same on the weather page and the
// map: its sea-level pressure, labelled for what it is, and its own
// pressure at the station (QFE). The weather dialog and the map's sheet
// show both; a weather card shows the sea-level one, else QFE. Upstream has three fields:
// `pressureStandardMslValue` (QNH, what pilots set), `pressureMslValue`
// (QFF, the only one the 83 DWD and Météo-France stations send) and
// `pressureSurfaceValue` (QFE). Two quirks, measured on 2026-11-25:
// Holfuy's `pressureSurfaceValue` reads 1005 to 1023 hPa at every altitude
// (Vilan, 2376 m: 1023), a sea-level value under the surface name, so it is
// no QFE; and 111 GeoSphere stations above about 1300 m send 798 to 866 hPa
// as `pressureStandardMslValue`, which no sea-level pressure reads. Pure.
import { num } from "./coerce.ts";
import type { MeasurementFeature } from "./types.ts";
import { toHpa } from "./units.ts";

/** Below this a "sea-level" value is something else (the lowest sea-level
 * pressure measured in Europe is about 925 hPa). */
const SEA_LEVEL_MIN_HPA = 900;

/** Providers whose `pressureSurfaceValue` is not the station's pressure. */
const NO_QFE = ["holfuy"];

export interface StationPressures {
  /** QNH when the station sends one, else QFF; whole hPa. */
  sea: { kind: "QNH" | "QFF"; hpa: number } | null;
  /** The pressure at the station; whole hPa. */
  qfeHpa: number | null;
}

function seaLevel(v: unknown): number | null {
  const hpa = toHpa(num(v));
  return hpa !== null && hpa >= SEA_LEVEL_MIN_HPA ? Math.round(hpa) : null;
}

export function stationPressures(
  p: MeasurementFeature["properties"],
): StationPressures {
  const qnh = seaLevel(p.pressureStandardMslValue);
  const qff = seaLevel(p.pressureMslValue);
  const surface = NO_QFE.includes(String(p.providerKey))
    ? null
    : toHpa(num(p.pressureSurfaceValue));
  return {
    sea:
      qnh !== null
        ? { kind: "QNH", hpa: qnh }
        : qff !== null
          ? { kind: "QFF", hpa: qff }
          : null,
    qfeHpa: surface === null ? null : Math.round(surface),
  };
}
