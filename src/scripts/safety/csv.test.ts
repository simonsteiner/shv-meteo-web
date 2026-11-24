import assert from "node:assert/strict";
import { test } from "node:test";
import { csvFileName, flightsCsv } from "./csv.ts";
import type { Flight } from "./flights.ts";

const headings = {
  date: "Datum",
  site: "Startplatz",
  landing: "Landeplatz",
  duration: "Dauer (Minuten)",
  glider: "Schirm",
  distance: "XC Distanz (km)",
  notes: "Bemerkungen",
};

const flight: Flight = {
  id: "f-1",
  date: "2026-07-14",
  site: 'Fiesch, "Kühboden"',
  landing: "Fiesch",
  glider: "Mentor 7",
  duration: 95,
  distance: null,
  maxAlt: null,
  notes: "Thermik\nbis 3000 m",
  type: null,
};

test("flightsCsv quotes every cell and doubles inner quotes", () => {
  assert.equal(
    flightsCsv([flight], headings),
    '"Datum","Startplatz","Landeplatz","Dauer (Minuten)","Schirm","XC Distanz (km)","Bemerkungen"\r\n' +
      '"2026-07-14","Fiesch, ""Kühboden""","Fiesch","95","Mentor 7","","Thermik\nbis 3000 m"\r\n',
  );
});

test("flightsCsv with no flights is the heading row", () => {
  assert.equal(flightsCsv([], headings).split("\r\n").length, 2);
});

test("csvFileName names the day", () => {
  assert.equal(csvFileName("2026-07-14"), "shv_flugbuch_2026-07-14.csv");
});
