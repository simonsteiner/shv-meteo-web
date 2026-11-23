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
