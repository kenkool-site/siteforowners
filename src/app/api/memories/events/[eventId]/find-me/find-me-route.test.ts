import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("find-me route exists", async () => {
  const mod = await import("./route");
  assert.equal(typeof mod.POST, "function");
});

test("requires a verified guest session before searching, and rejects an empty body", () => {
  const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  assert.match(source, /verifyMemoriesGuestSession/);
  assert.match(source, /status: 401/);
  assert.match(source, /selfieBytes\.length === 0/);
  assert.match(source, /status: 400/);
  assert.match(source, /searchFindMe\(params\.eventId, session\.sessionId, selfieBytes\)/);
});

test("blocks cross-origin requests, caps a long-running search, and rejects an oversized selfie", () => {
  const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  assert.match(source, /isSameOrigin/);
  assert.match(source, /status: 403/);
  assert.match(source, /export const maxDuration = 60/);
  assert.match(source, /MAX_SELFIE_BYTES\s*=\s*5\s*\*\s*1024\s*\*\s*1024/);
  assert.match(source, /selfieBytes\.length > MAX_SELFIE_BYTES/);
});
