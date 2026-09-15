import assert from "node:assert/strict";
import test from "node:test";
import { isInvitationE2EFixturesEnabled } from "./e2e-guard";

test("E2E fixtures require the explicit non-production opt-in", () => {
  assert.equal(isInvitationE2EFixturesEnabled({ NODE_ENV: "test", INVITATION_E2E_FIXTURES: "1" }), true);
  assert.equal(isInvitationE2EFixturesEnabled({ NODE_ENV: "test" }), false);
});

test("E2E fixtures stay disabled in production even with the opt-in set", () => {
  assert.equal(isInvitationE2EFixturesEnabled({ NODE_ENV: "production", INVITATION_E2E_FIXTURES: "1" }), false);
});
