import assert from "node:assert/strict";
import { test } from "node:test";
import type { FoehnReport, StationPair } from "../foehn/report.ts";
import {
  chartDraw,
  chartView,
  choosePair,
  initialPairState,
  NOTHING_DRAWN,
  reportCame,
  retryButton,
  shownPair,
  type PairState,
} from "./pair-state.ts";

const IDS = ["KLO_LUG", "GVE_GUT", "PIL_MTR", "DEM_GRE"];

function report(points: number): FoehnReport {
  return {
    pairs: IDS.map((id) => ({ id }) as StationPair),
    history: Array.from({ length: points }, (_, i) => ({
      time: `0${i}:00`,
      timestamp: 1000 + i,
      diffHpa: i,
      unit: "hPa" as const,
    })),
  } as FoehnReport;
}

/** The state once `id` was chosen and its report came. */
function loaded(id: string, r = report(3)): PairState {
  return reportCame(initialPairState(id), id, r);
}

test("the first report fills the state; its pair's history is drawn", () => {
  const r = report(3);
  const s = loaded("GVE_GUT", r);
  assert.equal(shownPair(s)?.id, "GVE_GUT");
  assert.deepEqual(chartView(s, "GVE_GUT"), {
    kind: "chart",
    pairId: "GVE_GUT",
    history: r.history,
  });
});

test("choosing the shown pair does nothing; another fetches it", () => {
  const s = loaded("KLO_LUG");
  assert.deepEqual(choosePair(s, "KLO_LUG"), { state: s, fetch: false });
  const { state, fetch } = choosePair(s, "GVE_GUT");
  assert.equal(fetch, true);
  assert.equal(state.pairId, "GVE_GUT");
  assert.equal(shownPair(state)?.id, "GVE_GUT");
  // the old history isn't drawn under the new pair's name
  assert.deepEqual(chartView(state, "GVE_GUT"), { kind: "pending" });
});

test("an answer for a pair no longer chosen is dropped", () => {
  let s = choosePair(loaded("KLO_LUG"), "GVE_GUT").state;
  s = choosePair(s, "PIL_MTR").state;
  assert.equal(reportCame(s, "GVE_GUT", report(5)), s);
  assert.equal(reportCame(s, "GVE_GUT", null), s);
});

test("a failed pair shows the empty chart and retries on a click", () => {
  const before = choosePair(loaded("KLO_LUG"), "GVE_GUT").state;
  const failed = reportCame(before, "GVE_GUT", null);
  assert.equal(failed.failedPair, "GVE_GUT");
  // the current values of the old report still show
  assert.equal(shownPair(failed)?.id, "GVE_GUT");
  assert.deepEqual(chartView(failed, "GVE_GUT"), {
    kind: "empty",
    pairId: "GVE_GUT",
  });
  const retry = choosePair(failed, "GVE_GUT");
  assert.equal(retry.fetch, true);
  assert.equal(retry.state.failedPair, null);
});

test("a failed first report shows unavailable, its retry loading", () => {
  const failed = reportCame(initialPairState("KLO_LUG"), "KLO_LUG", null);
  assert.equal(failed.report, null);
  assert.equal(shownPair(failed), null);
  const retry = choosePair(failed, "KLO_LUG");
  assert.equal(retry.fetch, true);
  assert.equal(retry.state.report, undefined);
  const ok = reportCame(retry.state, "KLO_LUG", report(2));
  assert.equal(ok.reportPair, "KLO_LUG");
  assert.equal(ok.failedPair, null);
});

test("a report without history draws the empty chart", () => {
  assert.deepEqual(chartView(loaded("KLO_LUG", report(0)), "KLO_LUG"), {
    kind: "empty",
    pairId: "KLO_LUG",
  });
});

test("the chart redraws when the pair, history, theme or language change", () => {
  const draw = (
    s: PairState,
    theme = "dark",
    lang = "de",
    from = NOTHING_DRAWN,
  ) => chartDraw(chartView(s, "KLO_LUG"), theme, lang, from);
  const first = draw(loaded("KLO_LUG"));
  assert.equal(first.redraw, true);
  assert.equal(first.drawn.pairId, "KLO_LUG");
  assert.equal(
    draw(loaded("KLO_LUG"), "dark", "de", first.drawn).redraw,
    false,
  );
  assert.equal(
    draw(loaded("KLO_LUG"), "light", "de", first.drawn).redraw,
    true,
  );
  assert.equal(draw(loaded("KLO_LUG"), "dark", "fr", first.drawn).redraw, true);
  assert.equal(
    draw(loaded("KLO_LUG", report(4)), "dark", "de", first.drawn).redraw,
    true,
  );
  const empty = chartDraw(
    { kind: "empty", pairId: "KLO_LUG" },
    "dark",
    "de",
    first.drawn,
  );
  assert.equal(empty.redraw, true);
  assert.equal(empty.drawn.pairId, "KLO_LUG");
});

test("a pending view keeps the drawn pair and its title", () => {
  const first = chartDraw(
    chartView(loaded("KLO_LUG"), "KLO_LUG"),
    "dark",
    "de",
    NOTHING_DRAWN,
  );
  const next = choosePair(loaded("KLO_LUG"), "GVE_GUT").state;
  const pending = chartDraw(
    chartView(next, "GVE_GUT"),
    "dark",
    "de",
    first.drawn,
  );
  assert.deepEqual(pending, { redraw: false, drawn: first.drawn });
});

test("a report without the chosen pair shows its first pair's empty chart", () => {
  const r = report(3);
  r.pairs = r.pairs.filter((p) => p.id !== "GVE_GUT");
  const s = loaded("GVE_GUT", r);
  const shown = shownPair(s);
  assert.equal(shown?.id, "KLO_LUG");
  assert.deepEqual(chartView(s, "KLO_LUG"), {
    kind: "empty",
    pairId: "KLO_LUG",
  });
});

test("the retry button shows only for a failed report it can retry", () => {
  const start = initialPairState("KLO_LUG");
  assert.equal(retryButton(start), "hidden");
  const failed = reportCame(start, "KLO_LUG", null);
  assert.equal(retryButton(failed), "ready");
  const again = choosePair(failed, "KLO_LUG").state;
  assert.equal(retryButton(again), "busy");
  // a report with no pairs came: nothing to retry
  const empty = reportCame(start, "KLO_LUG", { ...report(0), pairs: [] });
  assert.equal(retryButton(empty), "hidden");
  assert.equal(retryButton(loaded("KLO_LUG")), "hidden");
});

test("a second retry while one loads fetches nothing", () => {
  const failed = reportCame(initialPairState("KLO_LUG"), "KLO_LUG", null);
  const again = choosePair(failed, "KLO_LUG").state;
  assert.equal(choosePair(again, "KLO_LUG").fetch, false);
  // its answer ends the retry
  assert.equal(retryButton(reportCame(again, "KLO_LUG", null)), "ready");
});
