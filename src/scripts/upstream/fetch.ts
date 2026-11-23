// The one way a Function calls upstream: our User-Agent, never an Origin
// (weather-ws-prod and webcam-prod answer 403 to one), and a timeout on the
// response headers. The body is left to stream.
import { USER_AGENT } from "./routes.ts";

/** Resolves upstream's response once its headers arrive; rejects on a
 * network error or when `timeoutMs` passes first. */
export async function fetchUpstream(
  url: string,
  timeoutMs: number,
  fetchFn: typeof fetch = fetch,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
  } finally {
    // only the wait for the headers is timed: aborting later would cut the
    // body off mid-stream
    clearTimeout(timer);
  }
}
