// A request's parameters checked against its route: the path parameters
// decoded once, plus only the query keys the route accepts. Invalid input
// is a 400 here, before anything goes upstream.
import { pairConfig } from "../foehn/pairs.ts";
import { ROUTES, type RouteName } from "./routes.ts";

/** Upstream station ids: `meteo_swiss:KLO`,
 * `mistral:dpcn-piemonte:46.30361,8.36639`; never a `/`. */
const STATION_ID = /^[a-z_]+:[^/\s]{1,100}$/;

const TEXT_LANGS = ["de", "fr", "it"];

function badRequest(error: string): Response {
  return Response.json(
    { error },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}

/** The path parameter decoded once; null for a malformed escape. A catch-all
 * segment list is joined with `/`. */
function decoded(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value.join("/") : (value ?? "");
  try {
    return decodeURIComponent(raw);
  } catch (err) {
    console.error(`[params] Malformed escape in ${JSON.stringify(raw)}:`, err);
    return null;
  }
}

/** The route's parameters, or a 400 Response when they are invalid. */
export function parseParams(
  route: RouteName,
  path: Record<string, string | string[]>,
  search: URLSearchParams,
): Record<string, string> | Response {
  const params: Record<string, string> = {};
  for (const key of ROUTES[route].query) {
    const value = search.get(key);
    if (value !== null) params[key] = value;
  }
  if (route === "timeseries") {
    const id = decoded(path.id);
    if (id === null || !STATION_ID.test(id))
      return badRequest("Ungültige Stations-ID");
    params.id = id;
  }
  if (route === "textForecast") {
    // anything else, the UI's `en` included, gets German, as before; a
    // malformed escape is a 400, as for every other path parameter
    const lang = decoded(path.lang);
    if (lang === null) return badRequest("Ungültige Sprache");
    params.lang = TEXT_LANGS.includes(lang.toLowerCase())
      ? lang.toLowerCase()
      : "de";
  }
  if (route === "sounding") {
    // names may hold `/` (Disentis/Mustér); matched case-insensitively, so
    // the lower-cased name keys the cached copy
    const name = decoded(path.name);
    if (name === null) return badRequest("Ungültiger Stationsname");
    params.name = name.trim().toLowerCase();
  }
  if (route === "foehn") {
    // an unknown or missing pair gets the Gotthard pair, as before
    params.pair = pairConfig(params.pair).id;
  }
  return params;
}
