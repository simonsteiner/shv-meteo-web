// The weather page's station pairs as state: the pair shown, the last Foehn
// report and which pair's history it holds, and the pair whose report
// failed. Every report carries all four pairs' current values but only one
// pair's history, so switching pairs fetches that pair's report.

import type { FoehnReport, StationPair } from "../foehn/report.ts";

export interface PairState {
  /** The pair the reader chose. */
  pairId: string;
  /** The last report: undefined while none has come, null when the call for
   * the chosen pair failed and there is none to show. */
  report: FoehnReport | null | undefined;
  /** The pair whose history `report` holds. */
  reportPair: string | null;
  /** The chosen pair, when its report failed; a click on it retries. */
  failedPair: string | null;
}

export function initialPairState(pairId: string): PairState {
  return { pairId, report: undefined, reportPair: null, failedPair: null };
}

/** The state once the reader chose `id`, and whether to fetch its report:
 * not for the pair shown, unless its report failed. */
export function choosePair(
  s: PairState,
  id: string,
): { state: PairState; fetch: boolean } {
  if (id === s.pairId && id !== s.failedPair) return { state: s, fetch: false };
  return {
    // with no report to show, the retry shows loading again
    state: {
      ...s,
      pairId: id,
      failedPair: null,
      report: s.report ?? undefined,
    },
    fetch: true,
  };
}

/** The state once `id`'s report (null when the call failed) has come; an
 * answer for a pair no longer chosen changes nothing. */
export function reportCame(
  s: PairState,
  id: string,
  report: FoehnReport | null,
): PairState {
  if (id !== s.pairId) return s;
  if (!report) return { ...s, failedPair: id, report: s.report ?? null };
  return { ...s, report, reportPair: id, failedPair: null };
}

/** The pair to show from the report: the chosen one, else the report's
 * first; null while there is no report or it has no pairs. */
export function shownPair(s: PairState): StationPair | null {
  const pairs = s.report?.pairs ?? [];
  return pairs.find((p) => p.id === s.pairId) ?? pairs[0] ?? null;
}

export type ChartView =
  /** Draw `history`, which belongs to `pairId`. */
  | { kind: "chart"; pairId: string; history: FoehnReport["history"] }
  /** The pair's report failed, or it has no history: the empty state. */
  | { kind: "empty"; pairId: string }
  /** The pair's report is on its way: keep what is drawn, marked as stale. */
  | { kind: "pending" };

/** What the chart shows for `pairId`, the pair shown. */
export function chartView(s: PairState, pairId: string): ChartView {
  if (s.report && s.reportPair === pairId)
    return s.report.history.length > 0
      ? { kind: "chart", pairId, history: s.report.history }
      : { kind: "empty", pairId };
  if (s.failedPair === pairId) return { kind: "empty", pairId };
  // the chosen pair's report came without that pair, so the one shown in
  // its place has no history in it
  if (s.report && s.reportPair === s.pairId && pairId !== s.pairId)
    return { kind: "empty", pairId };
  return { kind: "pending" };
}

/** The retry button for a report that failed with none to show: "ready"
 * to click, "busy" while the retry it started loads (kept shown, so the
 * keyboard focus stays on it), else "hidden". A report that came with no
 * pairs isn't retried: its answer is cached. */
export function retryButton(
  s: PairState,
  retrying: boolean,
): "hidden" | "ready" | "busy" {
  if (retrying && s.report === undefined) return "busy";
  if (s.report === null && s.failedPair === s.pairId) return "ready";
  return "hidden";
}

/** A key that changes whenever the drawn chart would: its pair, history,
 * theme or language; "" when nothing is to be drawn. */
export function chartKey(view: ChartView, theme: string, lang: string): string {
  if (view.kind === "pending") return "";
  if (view.kind === "empty") return `${view.pairId}|empty`;
  const last = view.history[view.history.length - 1]?.timestamp;
  return `${view.pairId}|${theme}|${lang}|${view.history.length}|${last}`;
}
