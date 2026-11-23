// Point data for the sounding tests, shaped as upstream's
// `/v1/point-data/<model>/<run>/<point>?parameters=...` answers.
import type { PointAnswer } from "./sounding.ts";

/** A column as upstream stores it, top first: the model top (22 km), then
 * 700, 850 and 950 hPa at the ground. */
export const COLUMN: Record<string, number[]> = {
  temperature: [216.65, 263.15, 276.15, 283.15],
  pressure: [4000, 70000, 85000, 95000],
  specific_humidity: [0.00001, 0.002, 0.004, 0.005],
  height_half_level: [22000, 3200, 2200, 1200],
  wind_u: [0, 0, 0, 0],
  wind_v: [0, 0, 0, 0],
};

/** `column` over two time steps, an hour apart; the height is constant. */
export function pointAnswer(column = COLUMN): PointAnswer {
  const series = (name: string, values: number[]) => ({
    validTimes: [0, 3_600_000],
    data: {
      levels: values.map((v) => ({
        ensembleMembers: [
          { timeSeries: name === "height_half_level" ? [v] : [v, v] },
        ],
      })),
    },
  });
  return {
    parameters: Object.fromEntries(
      Object.entries(column).map(([name, v]) => [name, series(name, v)]),
    ),
  };
}
