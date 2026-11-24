import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchUpstream } from "./fetch.ts";
import { USER_AGENT } from "./routes.ts";

test("the User-Agent is set and no Origin goes upstream", async () => {
  let sent: Headers | undefined;
  const fake = (async (_url: string, init?: RequestInit) => {
    sent = new Headers(init?.headers);
    return new Response("{}");
  }) as typeof fetch;
  await fetchUpstream("https://upstream.test/x", 1000, fake);
  assert.equal(sent?.get("User-Agent"), USER_AGENT);
  assert.equal(sent?.has("Origin"), false);
});

test("a slow upstream is aborted after the timeout", async () => {
  const hang = ((_url: string, init?: RequestInit) =>
    new Promise((_resolve, reject) =>
      init?.signal?.addEventListener("abort", () =>
        reject(init.signal?.reason),
      ),
    )) as typeof fetch;
  await assert.rejects(fetchUpstream("https://upstream.test/x", 20, hang), {
    name: "TimeoutError",
  });
});

/** A fetch whose answer sends its headers after `headersMs` and `first`,
 * then never ends. */
function stalling(first = '{"features": [', headersMs = 0) {
  let cancelled = false;
  let signal: AbortSignal | undefined;
  const fake = (async (_url: string, init?: RequestInit) => {
    signal = init?.signal ?? undefined;
    await new Promise((r) => setTimeout(r, headersMs));
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(first));
        },
        cancel() {
          cancelled = true;
        },
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;
  return { fake, cancelled: () => cancelled, signal: () => signal };
}

test("a body that stalls after the headers fails at the deadline", async () => {
  const { fake, cancelled } = stalling();
  const started = Date.now();
  const res = await fetchUpstream("https://upstream.test/x", 50, fake);
  assert.equal(res.status, 200);
  await assert.rejects(res.text(), { name: "TimeoutError" });
  assert.ok(Date.now() - started < 1000);
  assert.equal(cancelled(), true);
});

test("headers and body share one deadline, not one each", async () => {
  // headers at 80 ms of a 100 ms deadline: one deadline ends the body at
  // about 100 ms, a fresh one for the body would end it at about 180 ms
  const { fake } = stalling(undefined, 80);
  const started = Date.now();
  const res = await fetchUpstream("https://upstream.test/x", 100, fake);
  await assert.rejects(res.text(), { name: "TimeoutError" });
  assert.ok(Date.now() - started < 140);
});

test("a body the real fetch errors on abort fails without a log", async (t) => {
  const logged = t.mock.method(console, "error", () => {});
  const fake = (async (_url: string, init?: RequestInit) => {
    const signal = init?.signal;
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("{"));
          signal?.addEventListener("abort", () =>
            controller.error(signal.reason),
          );
        },
      }),
    );
  }) as typeof fetch;
  const res = await fetchUpstream("https://upstream.test/x", 50, fake);
  await assert.rejects(res.text(), { name: "TimeoutError" });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(logged.mock.callCount(), 0);
});

test("a connection dropped mid-body fails with its own error", async (t) => {
  const logged = t.mock.method(console, "error", () => {});
  const fake = (async () =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("{"));
          setTimeout(() => controller.error(new TypeError("terminated")), 10);
        },
      }),
    )) as typeof fetch;
  const res = await fetchUpstream("https://upstream.test/x", 1000, fake);
  await assert.rejects(res.text(), { name: "TypeError" });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(logged.mock.callCount(), 0);
});

test("a body the caller cancels cancels upstream and its timer", async () => {
  const { fake, cancelled, signal } = stalling();
  const res = await fetchUpstream("https://upstream.test/x", 50, fake);
  await res.body!.cancel();
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(cancelled(), true);
  assert.equal(signal()?.aborted, false);
});

test("a response without a body stops the timer", async () => {
  let signal: AbortSignal | undefined;
  const fake = (async (_url: string, init?: RequestInit) => {
    signal = init?.signal ?? undefined;
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  const res = await fetchUpstream("https://upstream.test/x", 50, fake);
  assert.equal(res.body, null);
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(signal?.aborted, false);
});

test("a parsing caller (Foehn, sounding) fails too, not hangs", async () => {
  const { fake } = stalling();
  const res = await fetchUpstream("https://upstream.test/x", 50, fake);
  await assert.rejects(res.json(), { name: "TimeoutError" });
});

test("a streamed body that stalls errors for its reader", async () => {
  const { fake } = stalling("chunk");
  const res = await fetchUpstream("https://upstream.test/x", 50, fake);
  const reader = res.body!.getReader();
  const first = await reader.read();
  assert.equal(new TextDecoder().decode(first.value), "chunk");
  await assert.rejects(reader.read(), { name: "TimeoutError" });
});

test("a body done in time is passed through whole, with status and headers", async () => {
  let signal: AbortSignal | undefined;
  const fake = (async (_url: string, init?: RequestInit) => {
    signal = init?.signal ?? undefined;
    return new Response('{"ok":true}', {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  const res = await fetchUpstream("https://upstream.test/x", 50, fake);
  assert.equal(res.status, 404);
  assert.equal(res.headers.get("Content-Type"), "application/json");
  assert.deepEqual(await res.json(), { ok: true });
  // the timer went with the body: nothing aborts after the deadline
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(signal?.aborted, false);
});
