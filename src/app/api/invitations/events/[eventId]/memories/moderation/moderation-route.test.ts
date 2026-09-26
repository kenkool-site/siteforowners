import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("host moderation route exists", async () => {
  const mod = await import("./route");
  assert.equal(typeof mod.PATCH, "function");
  assert.equal(typeof mod.DELETE, "function");
});

// Structural, matching this file's own convention above: requireInvitationAccess()
// isn't reachable from a unit test, so this asserts the DELETE handler's source
// wires in the same auth/origin guards as PATCH, validates its body the same
// way, and delegates to permanentlyDeleteMemoryMedia rather than the soft
// moderateMemoryMediaForHost update.
test("DELETE carries the same auth/origin guards and UUID validation as PATCH, and delegates to permanentlyDeleteMemoryMedia", () => {
  const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  const deleteHandlerIndex = source.indexOf("export async function DELETE");
  assert.notEqual(deleteHandlerIndex, -1, "expected an exported DELETE handler");
  const deleteHandlerSource = source.slice(deleteHandlerIndex);

  assert.match(deleteHandlerSource, /isSameOrigin\(request\)/);
  assert.match(deleteHandlerSource, /requireInvitationAccess\(request, params\.eventId\)/);
  assert.match(deleteHandlerSource, /UUID\.test\(id\)/);
  assert.match(deleteHandlerSource, /permanentlyDeleteMemoryMedia\(/);
  assert.match(deleteHandlerSource, /status: 409/);
  assert.doesNotMatch(deleteHandlerSource, /moderateMemoryMediaForHost\(/);
});

// Structural, matching the route-contract tests in
// src/lib/invitations/*-route*.test.ts and settings-route.test.ts: the real
// call sits behind requireInvitationAccess()/moderateMemoryMediaForHost(),
// neither reachable from here, so this asserts the source actually wires
// AI Highlight generation queueing in — and only for approvals — rather than
// invoking the handler.
test("approving media opportunistically queues highlight generation; rejecting/removing never does", () => {
  const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

  assert.match(source, /requestHighlightGeneration\(/);

  // The queueing call must be gated on the approve action specifically, not
  // unconditional after every moderation action.
  const approveGuardIndex = source.search(/body\.action === "approve"/);
  const queueCallIndex = source.indexOf("requestHighlightGeneration(");
  assert.notEqual(approveGuardIndex, -1, "expected an explicit approve-action guard");
  assert.ok(
    queueCallIndex > approveGuardIndex,
    "requestHighlightGeneration must be called after (i.e. gated by) the approve-action check",
  );
});
