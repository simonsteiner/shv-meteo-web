import assert from "node:assert/strict";
import { test } from "node:test";
import { locatePilot, type Geo } from "./locate.ts";

async function quiet<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; errors: number }> {
  const original = console.error;
  let errors = 0;
  console.error = () => {
    errors++;
  };
  try {
    return { result: await fn(), errors };
  } finally {
    console.error = original;
  }
}

test("locatePilot resolves the position", async () => {
  const geo: Geo = {
    getCurrentPosition: (ok) =>
      ok({ coords: { latitude: 46.8, longitude: 8.2 } } as GeolocationPosition),
  };
  assert.deepEqual(await locatePilot(geo), { lat: 46.8, lng: 8.2 });
});

test("locatePilot gives null and logs on failure or without geolocation", async () => {
  const denied: Geo = {
    getCurrentPosition: (_ok, fail) =>
      fail?.({ code: 1, message: "denied" } as GeolocationPositionError),
  };
  assert.deepEqual(await quiet(() => locatePilot(denied)), {
    result: null,
    errors: 1,
  });
  // an explicit undefined falls back to the global, which node lacks
  assert.deepEqual(await quiet(() => locatePilot(undefined)), {
    result: null,
    errors: 1,
  });
});
