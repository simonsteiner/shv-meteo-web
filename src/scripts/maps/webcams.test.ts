import assert from "node:assert/strict";
import { test } from "node:test";
import type { Webcam } from "../types.ts";
import {
  webcamImages,
  webcamLatLng,
  webcamMarkerHtml,
  webcamSubtitle,
} from "./webcams.ts";

function cam(extra: Record<string, unknown> = {}): Webcam {
  return {
    identifier: "abufdalp:bielen-startplatz",
    name: "Bielen Startplatz",
    latitude: 46.88,
    longitude: 8.36,
    ...extra,
  };
}

test("a webcam's position, or null when invalid", () => {
  assert.deepEqual(webcamLatLng(cam()), [46.88, 8.36]);
  assert.equal(webcamLatLng(cam({ latitude: Number.NaN })), null);
  assert.equal(webcamLatLng(cam({ longitude: "8" })), null);
});

test("the latest image comes first, the thumbnail is its fallback", () => {
  const images = webcamImages(
    cam({
      latestImageUrl: "https://x/latest.jpg",
      thumbnailUrl: "https://x/thumb.jpg",
      currentDayTimelapseUrl: "https://x/day.mp4",
      providerUrl: "https://provider/",
    }),
  );
  assert.deepEqual(images, {
    latest: "https://x/latest.jpg",
    fallback: "https://x/thumb.jpg",
    timelapse: "https://x/day.mp4",
    source: "https://provider/",
  });
});

test("only the thumbnail: no fallback, and the image is the source", () => {
  assert.deepEqual(webcamImages(cam({ thumbnailUrl: "https://x/t.jpg" })), {
    latest: "https://x/t.jpg",
    fallback: null,
    timelapse: null,
    source: "https://x/t.jpg",
  });
  assert.deepEqual(webcamImages(cam()), {
    latest: null,
    fallback: null,
    timelapse: null,
    source: null,
  });
});

test("URLs that aren't http(s) are dropped", () => {
  const images = webcamImages(
    cam({
      latestImageUrl: "javascript:alert(1)",
      thumbnailUrl: "https://x/t.jpg",
      providerUrl: "data:text/html,<script>",
    }),
  );
  assert.equal(images.latest, "https://x/t.jpg");
  assert.equal(images.source, "https://x/t.jpg");
});

test("the subtitle joins place, altitude and provider", () => {
  assert.equal(
    webcamSubtitle(
      cam({
        location: "Bielen",
        altitudeM: 1499.6,
        providerDisplayName: "Abufdalp",
      }),
    ),
    "Bielen • 1500 m • Abufdalp",
  );
  assert.equal(webcamSubtitle(cam()), "");
});

test("the name lands in the marker as text", () => {
  assert.ok(
    !webcamMarkerHtml(cam({ name: "<img src=x onerror=alert(1)>" })).includes(
      "<img",
    ),
  );
});
