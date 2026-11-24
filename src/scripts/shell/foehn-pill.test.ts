import assert from "node:assert/strict";
import { test } from "node:test";
import type { FoehnReport } from "../foehn/report.ts";
import { foehnPill } from "./foehn-pill.ts";

type Primary = NonNullable<FoehnReport["primaryPair"]>;

function report(pair: Partial<Primary> | null): FoehnReport {
  return {
    primaryPair: pair && {
      id: "KLO_LUG",
      name: "Lugano - Zürich/Kloten",
      northStation: { name: "Kloten", pressureHpa: 1020.1 },
      southStation: { name: "Lugano", pressureHpa: 1016.0 },
      diffHpa: 4.1,
      status: "MODERATE_SOUTH_FOEHN",
      alertLevel: "MODERATE",
      descriptionDe: "",
      descriptionEn: "",
      ...pair,
    },
    pairs: [],
    geoJson: { type: "FeatureCollection", features: [] },
    history: [],
    thresholds: { moderateThresholdHpa: 4, severeThresholdHpa: 8 },
    updatedAt: "2026-11-24T00:00:00Z",
  };
}

test("a positive difference gets a plus sign and its alert's badge", () => {
  assert.deepEqual(foehnPill(report({})), {
    badge: "badge-warning",
    label: "Föhn: +4.1 hPa",
    title: "Lugano - Zürich/Kloten",
  });
});

test("each alert level has its badge; a negative value keeps its sign", () => {
  assert.equal(
    foehnPill(report({ alertLevel: "DANGER", diffHpa: -9 }))?.badge,
    "badge-danger",
  );
  const calm = foehnPill(report({ alertLevel: "NONE", diffHpa: -0.5 }));
  assert.equal(calm?.badge, "badge-safe");
  assert.equal(calm?.label, "Föhn: -0.5 hPa");
});

test("no pill without a report, a primary pair or a difference", () => {
  assert.equal(foehnPill(null), null);
  assert.equal(foehnPill(report(null)), null);
  assert.equal(foehnPill(report({ diffHpa: null })), null);
});
