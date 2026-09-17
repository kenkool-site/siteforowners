import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../../app/api/invitations/public/[slug]/comments/route.ts", import.meta.url), "utf8");

test("public comment route enforces invitation, passcode, origin, and privacy boundaries", () => {
  assert.match(source, /getPublicInvitationBySlug\(slug\)/);
  assert.match(source, /getInvitationPasscodeCookieName\(invitation\.event\.id\)/);
  assert.match(source, /verifyInvitationPasscodeSession/);
  assert.match(source, /isSameOrigin\(request\)/);
  assert.match(source, /hashIp\(getClientIp\(request\.headers\)\)/);
  assert.match(source, /invitationCommentContentHash/);
  assert.doesNotMatch(source, /console\.(?:error|info)\([^\n]*body/);
});
