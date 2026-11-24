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

/** `source` read through, erroring with the signal's reason once it
 * aborts; `settle` runs once the body ends, fails or is cancelled. */
function timedBody(
  source: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  settle: () => void,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  const aborted = new Promise<never>((_resolve, reject) => {
    if (signal.aborted) reject(signal.reason);
    else
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      });
  });
  // a body read to its end never awaits it: no unhandled rejection then
  aborted.catch(() => {});
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await Promise.race([reader.read(), aborted]);
        if (chunk.done) {
          settle();
          controller.close();
        } else controller.enqueue(chunk.value);
      } catch (err) {
        settle();
        reader.cancel(err).catch((e: unknown) => {
          console.error("[upstream] Cannot cancel a timed-out body:", e);
        });
        controller.error(err);
      }
    },
    cancel(reason) {
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
