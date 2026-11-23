// The flight log as CSV (RFC 4180): every field quoted, quotes doubled,
// rows ended with CRLF, so a comma, quote or line break in a note stays in
// its cell.

import type { Flight } from "./flights.ts";

/** The column headings, in the UI language. */
export interface CsvHeadings {
  date: string;
  site: string;
  landing: string;
  duration: string;
  glider: string;
  distance: string;
  notes: string;
}

function cell(v: string | number | null): string {
  return `"${v === null ? "" : String(v).replace(/"/g, '""')}"`;
}

export function flightsCsv(
  flights: readonly Flight[],
  headings: CsvHeadings,
): string {
  const rows: (string | number | null)[][] = [
    [
      headings.date,
      headings.site,
      headings.landing,
      headings.duration,
      headings.glider,
      headings.distance,
      headings.notes,
    ],
    ...flights.map((f) => [
      f.date,
      f.site,
      f.landing,
      f.duration,
      f.glider,
      f.distance,
      f.notes,
    ]),
  ];
  return rows.map((row) => row.map(cell).join(",") + "\r\n").join("");
}

/** The download's file name for a day (YYYY-MM-DD). */
export function csvFileName(date: string): string {
  return `shv_flugbuch_${date}.csv`;
}
