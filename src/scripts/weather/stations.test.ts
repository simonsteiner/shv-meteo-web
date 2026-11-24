import assert from "node:assert/strict";
import { test } from "node:test";
import type { MeasurementFeature } from "../types.ts";
import { filterStations, stationValues, windClass } from "./stations.ts";

function station(
  id: string,
  properties: MeasurementFeature["properties"],
): MeasurementFeature {
  return {
    id,
    geometry: { type: "Point", coordinates: [8, 47] },
    properties,
  };
}

test("stationValues converts Kelvin and tenths of hPa, keeps km/h", () => {
  assert.deepEqual(
    stationValues(
      station("meteo_swiss:PIL", {
        windSpeedValue: 23.44,
        windGustValue: 41.06,
        windDirectionValue: 270,
        temperature2mValue: 279.65,
        dewPoint2mValue: 270.15,
        relativeHumidity2mValue: 81.6,
        pressureMslValue: 10213,
      }),
    ),
    {
      windKmh: 23.4,
      gustKmh: 41.1,
      dirDeg: 270,
      tempC: 6.5,
      dewC: -3,
      humidity: 82,
      qnhHpa: 1021,
      surfaceHpa: null,
    },
  );
});

test("stationValues keeps 0 and falls back to the other fields", () => {
  const v = stationValues(
    station("slf:X", {
      windSpeedValue: 0,
      temperatureValue: 0,
      relativeHumidityValue: 40,
      pressureSurfaceValue: 850.4,
    }),
  );
  assert.equal(v.windKmh, 0);
  assert.equal(v.tempC, 0);
  assert.equal(v.humidity, 40);
  // station pressure is no QNH; it stays in its own field
  assert.equal(v.qnhHpa, null);
  assert.equal(v.surfaceHpa, 850);
  assert.equal(v.gustKmh, null);
  assert.equal(v.dewC, null);
});

test("stationValues falls back from the 2 m dew point to the plain one", () => {
  // Bantiger and the Windline stations send only `dewPointValue`
  const plain = stationValues(
    station("meteo_swiss:BAN", { dewPointValue: 273.15 }),
  );
  assert.equal(plain.dewC, 0);
  const both = stationValues(
    station("meteo_swiss:KLO", {
      dewPoint2mValue: 271.15,
      dewPointValue: 273.15,
    }),
  );
  assert.equal(both.dewC, -2);
});

test("windClass warns from 20 km/h and alarms from 30", () => {
  assert.equal(windClass(null), "");
  assert.equal(windClass(19.9), "");
  assert.equal(windClass(20), "text-warning");
  assert.equal(windClass(30), "text-danger");
});

test("filterStations filters by provider and by name or id", () => {
  const list = [
    station("meteo_swiss:PIL", { providerKey: "meteo_swiss", name: "Pilatus" }),
    station("meteo_swiss:KLO", {
      providerKey: "meteo_swiss",
      name: "Zürich / Kloten",
      stationIdentifier: "KLO",
    }),
    station("slf:AMD2", { providerKey: "SLF", name: "Amden" }),
  ];
  const ids = (l: MeasurementFeature[]) => l.map((s) => s.id);
  assert.deepEqual(ids(filterStations(list, "ALL", "")), ids(list));
  assert.deepEqual(ids(filterStations(list, "slf", "")), ["slf:AMD2"]);
  assert.deepEqual(ids(filterStations(list, "ALL", " pil")), [
    "meteo_swiss:PIL",
  ]);
  assert.deepEqual(ids(filterStations(list, "meteo_swiss", "klo")), [
    "meteo_swiss:KLO",
  ]);
  assert.deepEqual(ids(filterStations(list, "slf", "pilatus")), []);
});
