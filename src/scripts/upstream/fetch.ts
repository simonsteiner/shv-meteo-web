// The one way a Function calls upstream: our User-Agent, never an Origin
// (weather-ws-prod and webcam-prod answer 403 to one), and one deadline for
// the whole answer, headers and body. Without the body in it, an upstream
// that sent its headers and then stalled held the Function until
// Cloudflare stopped it. The body still streams; it errors at the deadline.
import { USER_AGENT } from "./routes.ts";

/** The reason a call past its deadline fails with. */
function timeout(url: string, timeoutMs: number): DOMException {
  return new DOMException(
    `${url} took longer than ${timeoutMs} ms`,
    "TimeoutError",
  );
}

/** What a read loses its race to once the signal aborts. */
const TIMED_OUT = Symbol("timed out");

/** `source` read through, erroring with the signal's reason once it
 * aborts; `settle` runs once the body ends, fails or is cancelled. */
function timedBody(
  source: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  settle: () => void,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  const deadline = new Promise<typeof TIMED_OUT>((resolve) => {
    if (signal.aborted) resolve(TIMED_OUT);
    else
      signal.addEventListener("abort", () => resolve(TIMED_OUT), {
        once: true,
      });
  });
  let cancelled = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      let chunk: ReadableStreamReadResult<Uint8Array> | typeof TIMED_OUT;
      try {
        chunk = await Promise.race([reader.read(), deadline]);
      } catch (err) {
        // the source failed by itself (a dropped connection, or the real
        // fetch erroring its body on abort): nothing left to cancel
        settle();
        if (!cancelled) controller.error(err);
        return;
      }
      if (cancelled) return;
      if (chunk === TIMED_OUT) {
        settle();
        controller.error(signal.reason);
        reader.cancel(signal.reason).catch((e: unknown) => {
          // a source the abort already failed rejects with that same reason
          if (e !== signal.reason)
            console.error("[upstream] Cannot cancel a timed-out body:", e);
        });
      } else if (chunk.done) {
        settle();
        controller.close();
      } else controller.enqueue(chunk.value);
    },
    cancel(reason) {
      cancelled = true;
      settle();
      return reader.cancel(reason);
    },
  });
}

/** Resolves upstream's response once its headers arrive, with a body that
 * errors if it isn't done by `timeoutMs` after the call; rejects on a
 * network error or when the headers miss the deadline. */
export async function fetchUpstream(
  url: string,
  timeoutMs: number,
  fetchFn: typeof fetch = fetch,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(timeout(url, timeoutMs)),
    timeoutMs,
  );
  const settle = () => clearTimeout(timer);
  let res: Response;
  try {
    res = await fetchFn(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
  } catch (err) {
    settle();
    throw err;
  }
  if (!res.body) {
    settle();
    return res;
  }
  return new Response(timedBody(res.body, controller.signal, settle), {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  });
}
