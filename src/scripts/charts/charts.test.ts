import assert from "node:assert/strict";
import { test } from "node:test";
import { foehnChartConfig } from "./foehn.ts";
import { stationChartConfig, stationSeries } from "./station.ts";
import { chartColors, signed } from "./theme.ts";
import { inZone } from "../test-zone.ts";

const colors = chartColors("dark");

test("chartColors and signed", () => {
  assert.notEqual(chartColors("light").text, colors.text);
  assert.equal(signed(1.5), "+1.5");
  assert.equal(signed(-2), "-2");
  assert.equal(signed(0), "0");
});

test("foehnChartConfig plots the history in the pair's unit and colour", () => {
  const history = [
    { time: "10:00", timestamp: 1, diffHpa: -4.2, unit: "hPa" as const },
    { time: "10:10", timestamp: 2, diffHpa: -3.9, unit: "hPa" as const },
  ];
  const pressure = foehnChartConfig(
    history,
    { isPressure: true, unit: "hPa" },
    colors,
    "Differenz",
  );
  assert.deepEqual(pressure.data.labels, ["10:00", "10:10"]);
  assert.deepEqual(pressure.data.datasets[0].data, [-4.2, -3.9]);
  assert.equal(pressure.data.datasets[0].borderColor, "#0089CF");
  assert.equal(pressure.data.datasets[0].label, "Differenz (hPa)");
  const temp = foehnChartConfig(
    [],
    { isPressure: false, unit: "°C" },
    colors,
    "D",
  );
  assert.equal(temp.data.datasets[0].borderColor, "#A855F7");
});

test("stationSeries joins temperature, dew point and wind on their timestamps", () => {
  // 09:00 in Zurich (CET)
  const t0 = Date.UTC(2026, 10, 23, 8, 0);
  const t1 = t0 + 600_000;
  const series = stationSeries({
    id: "meteo_swiss:PIL",
    timeseries: [
      {
        parameter: "temperature",
        measurements: [
          { time: t1, value: 279.65 },
          { time: t0, value: 6.04 },
        ],
      },
      { parameter: "dew_point", measurements: [{ time: t1, value: 270.15 }] },
      { parameter: "wind_speed", measurements: [{ time: t1, value: 12.34 }] },
      { parameter: "pressure_msl", measurements: [{ time: t0, value: 1020 }] },
    ],
  });
  assert.deepEqual(series, {
    labels: ["09:00", "09:10"],
    tempC: [6, 6.5],
    dewC: [null, -3],
    windKmh: [null, 12.3],
  });
  assert.deepEqual(stationSeries(null), {
    labels: [],
    tempC: [],
    dewC: [],
    windKmh: [],
  });
});

const labels = {
  temp: "Temperatur (°C)",
  dew: "Taupunkt (°C)",
  wind: "Wind (km/h)",
};

test("stationChartConfig puts temperature and dew point left, wind right", () => {
  const config = stationChartConfig(
    {
      labels: ["09:00", "09:10"],
      tempC: [6, 7],
      dewC: [-3, null],
      windKmh: [12, 9],
    },
    colors,
    labels,
  );
  const [temp, dew, wind] = config.data.datasets;
  assert.equal(temp.yAxisID, "yTemp");
  assert.equal(dew.yAxisID, "yTemp");
  assert.equal(dew.label, "Taupunkt (°C)");
  assert.deepEqual(dew.data, [-3, null]);
  assert.equal(wind.yAxisID, "yWind");
  assert.equal(wind.label, "Wind (km/h)");
});

test("stationChartConfig draws no dew point line for a station without one", () => {
  const config = stationChartConfig(
    { labels: ["09:00"], tempC: [6], dewC: [null], windKmh: [12] },
    colors,
    labels,
  );
  assert.deepEqual(
    config.data.datasets.map((d) => d.label),
    ["Temperatur (°C)", "Wind (km/h)"],
  );
});

test("the station chart's times are Swiss, wherever the browser is", () => {
  inZone("America/New_York", () => {
    const t = Date.UTC(2026, 10, 25, 17, 40);
    const series = stationSeries({
      id: "meteo_swiss:KLO",
      timeseries: [
        { parameter: "temperature", measurements: [{ time: t, value: 3 }] },
      ],
    });
    assert.deepEqual(series.labels, ["18:40"]);
  });
});
