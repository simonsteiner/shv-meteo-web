// A BAZL obstacle's marking. The dataset has five values (counts on
// 2026-11-24): NONE (221,073), MARKED (2,010), CABLE_WARNER (1,131: warning
// spheres on a cable), ORANGE_MARKS (1,037) and RED_WHITE_RED (120). Every
// one but NONE is a marking a pilot can see; the LOD (lod.ts), the map's
// styles (maps/obstacles.ts) and the sheet (sheet/obstacle.ts) all ask
// isMarked. Pure.
import type { Say } from "../i18n/text.ts";

/** The markings the dictionaries name (`map.sheet.markingName.<code>`). */
const NAMED = ["MARKED", "CABLE_WARNER", "ORANGE_MARKS", "RED_WHITE_RED"];

/** Whether `marking` is a visible marking: anything but empty or NONE. */
export function isMarked(marking: unknown): boolean {
  return typeof marking === "string" && marking !== "" && marking !== "NONE";
}

/** The marking's name in the UI language: an unknown code as itself, no
 * marking as "none". */
export function markingLabel(marking: unknown, say: Say): string {
  if (!isMarked(marking)) return say("map.sheet.none");
  const code = marking as string;
  return NAMED.includes(code) ? say(`map.sheet.markingName.${code}`) : code;
}
