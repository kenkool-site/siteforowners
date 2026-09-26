import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("find-me-settings admin route exists and exports GET and PATCH", async () => {
  const mod = await import("./route");
  assert.equal(typeof mod.GET, "function");
  assert.equal(typeof mod.PATCH, "function");
});

// Structural, matching this codebase's convention for founder-admin routes
// (see src/app/api/invitations/admin/events/route.ts, which has no
// request-level tests either): hasFounderInvitationSession() reads a real
// cookie/env value not reachable from a unit test, so this asserts both
// handlers actually guard on it and PATCH additionally checks same-origin
// and bounds the input, rather than invoking the handlers.
test("both handlers require a founder session, and PATCH also checks origin and input bounds", () => {
  const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  const getIndex = source.indexOf("export async function GET");
  const patchIndex = source.indexOf("export async function PATCH");
  assert.notEqual(getIndex, -1);
  assert.notEqual(patchIndex, -1);

  const getSource = source.slice(getIndex, patchIndex);
  const patchSource = source.slice(patchIndex);

  assert.match(getSource, /hasFounderSession\(request\)/);
  assert.match(patchSource, /hasFounderSession\(request\)/);
  assert.match(patchSource, /isSameOrigin\(request\)/);
  assert.match(patchSource, /Number\.isInteger\(dailySearchLimit\)/);
  assert.match(patchSource, /dailySearchLimit < 1/);
  assert.match(patchSource, /dailySearchLimit > MAX_DAILY_LIMIT/);
});
