import assert from "node:assert/strict";
import { test } from "node:test";
import type { ObstacleFeature } from "../types.ts";
import {
  obstacleIconUrl,
  obstacleKey,
  obstaclePathStyle,
  obstaclePointStyle,
} from "./obstacles.ts";

function obstacle(
  props: ObstacleFeature["properties"],
  type = "Point",
): ObstacleFeature {
  return {
    type: "Feature",
    geometry: { type, coordinates: [8, 46] },
    properties: props,
  };
}

test("the draw key is the uid, else the feature key", () => {
  assert.equal(obstacleKey(obstacle({ _uid: "u1", sourceId: "s" })), "u1");
  assert.equal(
    obstacleKey(obstacle({ sourceId: "s", partIndex: 2 })),
    "s_Point_2",
  );
});

test("icon names come only from plain style ids", () => {
  assert.equal(obstacleIconUrl("ms_crane"), "/assets/obstacles/ms_crane.svg");
  assert.equal(obstacleIconUrl("../x"), "/assets/obstacles/ms_pole.svg");
  assert.equal(
    obstacleIconUrl('"><img>', "red_circle"),
    "/assets/obstacles/red_circle.svg",
  );
  assert.equal(obstacleIconUrl(undefined), "/assets/obstacles/ms_pole.svg");
});

test("cable ends are dots: marked yellow, power lines red, others blue", () => {
  const marked = obstaclePointStyle(
    { obstacleType: "CABLE_CAR", marking: "MARKED" },
    10,
  );
  assert.deepEqual(
    marked.kind === "circle" && [marked.fillColor, marked.radius],
    ["#FFD700", 4.5],
  );
  const power = obstaclePointStyle({ obstacleType: "TRANSMISSION_LINE" }, 15);
  assert.equal(power.kind === "circle" && power.fillColor, "#CC0000");
  const cable = obstaclePointStyle({ obstacleType: "CABLE_CAR" }, 15);
  assert.equal(cable.kind === "circle" && cable.fillColor, "#0054FF");
});

test("point symbols are coloured dots below z13 and icons from z13", () => {
  const crane = obstaclePointStyle(
    { obstacleType: "CRANE", styleId: "ms_crane" },
    12,
  );
  assert.equal(crane.kind === "circle" && crane.fillColor, "#EF4444");
  const marked = obstaclePointStyle(
    { obstacleType: "POLE", marking: "MARKED" },
    12,
  );
  assert.equal(marked.kind === "circle" && marked.radius, 5);
  const icon = obstaclePointStyle(
    { obstacleType: "CRANE", styleId: "ms_crane" },
    13,
  );
  assert.deepEqual(icon, {
    kind: "icon",
    url: "/assets/obstacles/ms_crane.svg",
    size: [28, 28],
    anchor: [14, 26],
  });
  const pole = obstaclePointStyle({ obstacleType: "POLE" }, 14);
  assert.equal(
    pole.kind === "icon" && pole.url,
    "/assets/obstacles/ms_pole.svg",
  );
});

test("paths: power lines blue unless marked, airports orange", () => {
  assert.equal(
    obstaclePathStyle(
      obstacle({ obstacleType: "TRANSMISSION_LINE" }, "LineString"),
    )?.color,
    "#0054FF",
  );
  assert.equal(
    obstaclePathStyle(
      obstacle(
        { obstacleType: "TRANSMISSION_LINE", marking: "MARKED" },
        "MultiLineString",
      ),
    )?.color,
    "#CC0000",
  );
  assert.equal(
    obstaclePathStyle(obstacle({ airport: "LSZH" }, "Polygon"))?.color,
    "#FF841B",
  );
  assert.equal(obstaclePathStyle(obstacle({}, "Point")), null);
});
