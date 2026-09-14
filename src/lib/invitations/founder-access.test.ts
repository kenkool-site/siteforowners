import assert from "node:assert/strict";
import test from "node:test";
import { hasFounderInvitationSession } from "./founder-access";

test("founder invitation access fails closed for a missing secret or mismatched cookie", () => {
  assert.equal(hasFounderInvitationSession(undefined, "any-cookie"), false);
  assert.equal(hasFounderInvitationSession("", "any-cookie"), false);
  assert.equal(hasFounderInvitationSession("founder-secret", undefined), false);
  assert.equal(hasFounderInvitationSession("founder-secret", "wrong-cookie"), false);
  assert.equal(hasFounderInvitationSession("founder-secret", "founder-secret"), true);
});
