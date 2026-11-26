import assert from "node:assert/strict";
import { test } from "node:test";
import { stationPressures } from "./pressure.ts";

// values as upstream sent them on 2026-11-25
test("QNH first, with the station's own pressure beside it", () => {
  // Kloten: QFF, QNH and QFE
  assert.deepEqual(
    stationPressures({
      providerKey: "meteo_swiss",
      pressureMslValue: 1013.2,
      pressureStandardMslValue: 1011.7,
      pressureSurfaceValue: 961.4,
    }),
    { sea: { kind: "QNH", hpa: 1012 }, qfeHpa: 961 },
  );
});

test("a station with only an MSL value shows it as QFF, not QNH", () => {
  // the 83 DWD and Météo-France stations send no pressure_standard_msl
  assert.deepEqual(
    stationPressures({
      providerKey: "dwd",
      pressureMslValue: 1013.4,
      pressureSurfaceValue: 990.1,
    }),
    { sea: { kind: "QFF", hpa: 1013 }, qfeHpa: 990 },
  );
});

test("Mistral's pascals are its QFE; Holfuy's surface value is no QFE", () => {
  assert.deepEqual(
    stationPressures({ providerKey: "mistral", pressureSurfaceValue: 98680 }),
    { sea: null, qfeHpa: 987 },
  );
  // Vilan, 2376 m: 1023 hPa is a sea-level value under the surface name
  assert.deepEqual(
    stationPressures({ providerKey: "holfuy", pressureSurfaceValue: 102300 }),
    { sea: null, qfeHpa: null },
  );
});

test("a sea-level value below 900 hPa is no sea-level pressure", () => {
  // GeoSphere's Sonnblick (3109 m) sends 799 as pressure_standard_msl
  assert.deepEqual(
    stationPressures({
      providerKey: "geosphere_austria",
      pressureStandardMslValue: 799,
      pressureSurfaceValue: 688.9,
    }),
    { sea: null, qfeHpa: 689 },
  );
  assert.deepEqual(stationPressures({}), { sea: null, qfeHpa: null });
});
