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
