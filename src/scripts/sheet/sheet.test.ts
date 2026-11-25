import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  FlyingSiteFeature,
  MeasurementFeature,
  ObstacleFeature,
  Webcam,
} from "../types.ts";
import { obstacleSheetHtml, obstacleTypeLabel } from "./obstacle.ts";
import { coordinatesText, paragraphs } from "./parts.ts";
import { siteKind, siteSheetHtml } from "./site.ts";
import { stationSheetHtml } from "./station.ts";
import { webcamSheetHtml } from "./webcam.ts";

const EVIL = '<img src=x onerror="alert(1)">';
// fills placeholders so the formatted strings show their values
const say = (key: string) =>
  ({
    "map.sheet.coordinates": "{lat}° N, {lng}° E",
    "map.sheet.elevation": "{m} m",
    "map.sheet.gusts": "gusts {v}",
    "map.sheet.airport": "airport {name}",
    "map.sheet.amsl": "{m} m amsl",
  })[key] ?? `[${key}]`;

/** No element from upstream text: every `<` it held is now `&lt;`. */
function inert(html: string): void {
  assert.ok(!html.includes("<img src=x"), html);
  assert.ok(
    html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"),
    html,
  );
}

function site(
  props: FlyingSiteFeature["properties"],
  coordinates: unknown = [8.5856, 47.0136],
): FlyingSiteFeature {
  return { geometry: { type: "Point", coordinates }, properties: props };
}

test("paragraphs escapes and keeps line breaks", () => {
  assert.equal(paragraphs("a <b>\r\nc"), "a &lt;b&gt;<br/>c");
});

test("coordinates read lat N, lng E with four decimals", () => {
  assert.equal(
    coordinatesText([47.01356, 8.58562], say),
    "47.0136° N, 8.5856° E",
  );
});

test("siteKind counts areas and patterns with their take-off or landing", () => {
  assert.equal(siteKind("launch"), "launch");
  assert.equal(siteKind("LaunchArea"), "launch");
  assert.equal(siteKind("landingpattern"), "landing");
  assert.equal(siteKind("parking"), "general");
  assert.equal(siteKind(null), "general");
});

test("a site sheet shows badges, suits, wind and sections", () => {
  const html = siteSheetHtml(
    site({
      siteName: "Alp Schwand",
      type: "launch",
      difficulty: "easy",
      openingStatus: "open",
      elevation: 1233,
      launchDirections: ["N", "NE"],
      paraglider: true,
      hangglider: false,
      hazards: "Bise",
      fees: "CHF 5",
      feePaymentLink: "https://pay.example/x",
      feeQrCodeUrl: "https://qr.example/x.png",
      responsible: "Club",
      clubLink: "https://club.example/",
    }),
    say,
  );
  for (const part of [
    "[map.sheet.launchBadge]",
    "[map.sheet.difficulty.easy]",
    "[map.sheet.open]",
    "1233 m",
    "47.0136° N, 8.5856° E",
    "[map.sheet.suit.paraglider]",
    '<span class="wind-tag wind-ok">NE</span>',
    '<span class="wind-tag wind-no">S</span>',
    "section-warning",
    'href="https://pay.example/x"',
    'src="https://qr.example/x.png"',
    'href="https://club.example/"',
    "maps.apple.com/?daddr=47.0136,8.5856",
    "tel:1414",
  ])
    assert.ok(html.includes(part), part);
  assert.ok(!html.includes("[map.sheet.suit.hangglider]"));
});

test("a site sheet escapes upstream text and drops non-http links", () => {
  const html = siteSheetHtml(
    site({
      siteName: EVIL,
      type: "landing",
      difficulty: EVIL,
      siteDescription: EVIL,
      hazards: EVIL,
      access: EVIL,
      openingInfo: EVIL,
      fees: EVIL,
      responsible: EVIL,
      feePaymentLink: "javascript:alert(1)",
      feeQrCodeUrl: '"><script>',
      clubLink: "javascript:alert(1)",
    }),
    say,
  );
  inert(html);
  assert.ok(!html.includes("javascript:"), html);
  assert.ok(!html.includes("<script"), html);
});

test("a site without a position shows no coordinates and no directions", () => {
  const html = siteSheetHtml(
    site({ siteName: "X", type: "launch" }, "bad"),
    say,
  );
  assert.ok(!html.includes("° N"));
  assert.ok(!html.includes("maps.apple.com"));
  assert.ok(html.includes("[map.sheet.noElevation]"));
});

test("a site without a name takes its site's, else its kind's", () => {
  const names = new Map([["s1", "Goldau"]]);
  assert.ok(
    siteSheetHtml(site({ siteId: "s1", type: "landing" }), say, names).includes(
      ">Goldau<",
    ),
  );
  assert.ok(
    siteSheetHtml(site({ type: "landing" }), say).includes(
      ">[map.sheet.landing]<",
    ),
  );
});

function station(
  props: Record<string, unknown>,
  coordinates: [number, number] = [8.25, 46.98],
): MeasurementFeature {
  return {
    id: "meteo_swiss:PIL",
    geometry: { type: "Point", coordinates },
    properties: props,
  };
}

test("a station sheet shows converted measurements", () => {
  const html = stationSheetHtml(
    station({
      name: "Pilatus",
      providerKey: "meteo_swiss",
      altitude: 2106,
      windSpeedValue: 22.04,
      windGustValue: 40,
      temperature2mValue: 270.15,
      pressureStandardMslValue: 1018.1,
    }),
    say,
  );
  for (const part of [
    "MeteoSchweiz (CH)",
    "2106 m",
    "22 km/h",
    "gusts 40",
    "-3 °C",
    "1018 hPa",
    "46.9800° N",
  ])
    assert.ok(html.includes(part), part);
});

test("a station without values or a position says so instead of inventing them", () => {
  const html = stationSheetHtml(station({ name: EVIL }, [Number.NaN, 0]), say);
  inert(html);
  assert.ok(html.includes("[map.sheet.noMeasurements]"));
  assert.ok(html.includes("[map.sheet.liveStation]"));
  assert.ok(!html.includes("° N"));
  assert.ok(!html.includes("maps.apple.com"));
});

function cam(extra: Record<string, unknown>): Webcam {
  return {
    identifier: "a:b",
    name: "Bielen",
    latitude: 46.9,
    longitude: 8.4,
    ...extra,
  };
}

test("a webcam sheet carries its image swaps in data attributes", () => {
  const html = webcamSheetHtml(
    cam({
      latestImageUrl: "https://x/l.jpg",
      thumbnailUrl: "https://x/t.jpg",
      currentHourTimelapseUrl: "https://x/h.webp",
      location: "Stans",
    }),
    say,
  );
  for (const part of [
    'src="https://x/l.jpg"',
    'data-fallback="https://x/t.jpg"',
    'data-timelapse="https://x/h.webp"',
    'data-action="timelapse"',
    ">Stans<",
    "sheet-webcam-content",
  ])
    assert.ok(html.includes(part), part);
  assert.ok(!html.includes("onerror"), html);
});

test("a webcam without images shows the notice, and escapes its name", () => {
  const html = webcamSheetHtml(
    cam({ name: EVIL, latestImageUrl: "javascript:x" }),
    say,
  );
  inert(html);
  assert.ok(html.includes("[map.sheet.noImage]"));
  assert.ok(!html.includes("data-action"));
  assert.ok(!html.includes("javascript:"));
});

function obstacle(
  props: ObstacleFeature["properties"],
  type = "Point",
  coordinates: unknown = [8, 46],
): ObstacleFeature {
  return {
    type: "Feature",
    geometry: { type, coordinates },
    properties: props,
  };
}

test("an obstacle sheet hides upstream's 1950-01-01 placeholder date", () => {
  for (const effectiveDate of ["1950-01-01", "", "soon"]) {
    const html = obstacleSheetHtml(
      obstacle({ obstacleType: "POLE", effectiveDate }),
      say,
    );
    assert.ok(!html.includes("[map.sheet.effective]"), effectiveDate);
  }
});

test("obstacleTypeLabel names known types and keeps unknown codes", () => {
  assert.equal(
    obstacleTypeLabel("CRANE", say),
    "[map.sheet.obstacleType.CRANE]",
  );
  assert.equal(obstacleTypeLabel("SILO", say), "SILO");
  assert.equal(obstacleTypeLabel(undefined, say), "[map.sheet.obstacle]");
});

test("an obstacle sheet shows heights, marking and lighting", () => {
  const html = obstacleSheetHtml(
    obstacle({
      obstacleType: "CABLE_CAR",
      marking: "MARKED",
      lighting: "DAY",
      maxHeightAgl: 80,
      topElevationAmsl: 1500,
      sourceId: "CH-123",
      airport: "LSZH",
      effectiveDate: "2025-12-18",
    }),
    say,
  );
  for (const part of [
    "[map.sheet.effective]",
    "2025-12-18",
    "airport LSZH",
    "[map.sheet.marked]",
    "[map.sheet.lit]",
    "1500 m amsl",
    "80 m",
    "CH-123",
    "[map.sheet.markingName.MARKED]",
    "💡 DAY",
    "/assets/obstacles/ms_pole.svg",
    "46.0000° N, 8.0000° E",
  ])
    assert.ok(html.includes(part), part);
});

test("an obstacle sheet names a cable warner's marking, never Keine beside Markiert", () => {
  const html = obstacleSheetHtml(
    obstacle(
      { obstacleType: "CABLE_CAR", marking: "CABLE_WARNER" },
      "LineString",
    ),
    say,
  );
  assert.ok(html.includes("[map.sheet.marked]"));
  assert.ok(html.includes("[map.sheet.markingName.CABLE_WARNER]"));
  // the marking row, not the lighting row, which says none for this one
  assert.ok(!html.includes("[map.sheet.marking]</span><span>[map.sheet.none]"));
});

test("an obstacle sheet escapes upstream text and needs no position", () => {
  const html = obstacleSheetHtml(
    obstacle(
      {
        obstacleType: EVIL,
        sourceId: EVIL,
        airport: EVIL,
        lighting: EVIL,
        styleId: EVIL,
      },
      "GeometryCollection",
    ),
    say,
  );
  inert(html);
  assert.ok(html.includes("/assets/obstacles/red_circle.svg"));
  assert.ok(!html.includes("maps.apple.com"));
});
