// The vario simulator's numbers: which tone a climb rate makes and how the
// gauge shows it. The tone follows common instruments: beeps that rise in
// pitch and quicken with lift, silence in the deadband, a low drone in
// strong sink.

import { round1 } from "../units.ts";

/** Lift at or above this many m/s beeps. */
export const LIFT_THRESHOLD = 0.15;
/** Sink at or below this many m/s drones. */
export const SINK_THRESHOLD = -2;
/** The gauge turns to sink below this many m/s, before the drone starts. */
export const GAUGE_SINK = -1.5;

export type Tone =
  | { kind: "beep"; frequency: number; cycleMs: number; beepMs: number }
  | { kind: "drone"; frequency: number }
  | { kind: "silent" };

/** The tone for a climb rate in m/s. */
export function varioTone(rate: number): Tone {
  if (rate >= LIFT_THRESHOLD) {
    const cycleMs = Math.max(90, Math.round(550 - rate * 65));
    return {
      kind: "beep",
      frequency: Math.min(2200, 650 + rate * 220),
      cycleMs,
      beepMs: Math.min(cycleMs * 0.55, 180),
    };
  }
  if (rate <= SINK_THRESHOLD)
    return { kind: "drone", frequency: Math.max(180, 320 + rate * 25) };
  return { kind: "silent" };
}

/** The rate as the gauge prints it: one decimal, a plus sign for lift. */
export function formatRate(rate: number): string {
  const r = round1(rate);
  return `${r > 0 ? "+" : ""}${r.toFixed(1)}`;
}

export type GaugeState = "lift" | "sink" | "level";

export function gaugeState(rate: number): GaugeState {
  if (rate > 0) return "lift";
  if (rate < GAUGE_SINK) return "sink";
  return "level";
}
