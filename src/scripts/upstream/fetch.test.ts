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
        reject(new DOMException("aborted", "AbortError")),
      ),
    )) as typeof fetch;
  await assert.rejects(fetchUpstream("https://upstream.test/x", 20, hang), {
    name: "AbortError",
  });
});

/** A fetch whose answer sends its headers and `first`, then never ends. */
function stalling(first = '{"features": [') {
  let cancelled = false;
  const fake = (async () =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(first));
        },
        cancel() {
          cancelled = true;
        },
      }),
      { headers: { "Content-Type": "application/json" } },
    )) as typeof fetch;
  return { fake, cancelled: () => cancelled };
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
