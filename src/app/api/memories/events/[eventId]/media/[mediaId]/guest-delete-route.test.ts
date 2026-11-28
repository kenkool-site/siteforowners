import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Structural, like host-media-route.test.ts and for the same reason: the
// route's real work sits behind unreachable seams (the signed guest session,
// Supabase, R2, Stream). The branch logic itself lives in guest-delete.ts,
// which has real unit tests.
test("guest delete route exists and wires session, CSRF, and outcome mapping", async () => {
  const mod = await import("./route");
  assert.equal(typeof mod.DELETE, "function");
  const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  assert.match(source, /isSameOrigin/);
  assert.match(source, /verifyMemoriesGuestSession/);
  assert.match(source, /session\?\.sessionId/);
  assert.match(source, /"window_closed" .*410|window_closed.*410/);
});
