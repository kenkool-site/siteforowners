import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("host moderation route exists", async () => {
  const mod = await import("./route");
  assert.equal(typeof mod.PATCH, "function");
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
