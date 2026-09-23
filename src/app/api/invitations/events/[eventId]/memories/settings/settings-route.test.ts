import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("settings route module loads under tsx --test", async () => {
  const mod = await import("./route");
  assert.equal(typeof mod.PATCH, "function");
});

// Structural, matching the route-contract tests in src/lib/invitations/*-route*.test.ts:
// the handler's guards sit in front of createAdminClient(), which cannot be reached
// from here, so this asserts the source actually wires them in.
test("settings route guards every write with same-origin and host access", () => {
  const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  assert.match(source, /isSameOrigin\(request\)/);
  assert.match(source, /requireInvitationAccess\(request, params\.eventId\)/);
  assert.match(source, /updateEventMemoriesSettings\(params\.eventId/);
});
