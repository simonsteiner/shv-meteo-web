// The colours every chart shares, for the page's theme.

export interface ChartColors {
  grid: string;
  text: string;
  zeroLine: string;
}

export function chartColors(theme: string): ChartColors {
  const dark = theme !== "light";
  return {
    grid: dark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)",
    text: dark ? "#94A3B8" : "#64748B",
    zeroLine: dark ? "rgba(255, 255, 255, 0.28)" : "rgba(0, 0, 0, 0.28)",
  };
}

/** A number with a plus sign when positive, as the axes label differences. */
export function signed(v: number): string {
  return `${v > 0 ? "+" : ""}${v}`;
}
