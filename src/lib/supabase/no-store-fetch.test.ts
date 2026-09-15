import assert from "node:assert/strict";
import test from "node:test";
import { createNoStoreFetch } from "./no-store-fetch";

test("Supabase server requests explicitly bypass the Next.js data cache", async () => {
  let receivedInit: RequestInit | undefined;
  const underlyingFetch: typeof fetch = async (_input, init) => {
    receivedInit = init;
    return new Response(null, { status: 204 });
  };

  const noStoreFetch = createNoStoreFetch(underlyingFetch);
  await noStoreFetch("https://example.test/rest/v1/invitation_events", {
    headers: { authorization: "Bearer test" },
  });

  assert.equal(receivedInit?.cache, "no-store");
  assert.deepEqual(receivedInit?.headers, { authorization: "Bearer test" });
});
