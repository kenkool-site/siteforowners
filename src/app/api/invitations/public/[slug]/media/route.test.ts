import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const routeUrl = new URL("./route.ts", import.meta.url);

// Structural, matching this codebase's convention for this route family
// (see public-cover-route.contract.test.ts): the real behavior needs a
// live Supabase connection this test environment doesn't have, so this
// confirms the route does its own passcode check — critical, since
// middleware's config.matcher excludes /api/* entirely, so nothing
// upstream of this route has already verified anything.
test("the media route verifies the passcode cookie itself before returning signed URLs, rather than trusting middleware", () => {
  const source = readFileSync(routeUrl, "utf8");
  assert.match(source, /invitation\.passcodeHash/);
  assert.match(source, /verifyInvitationPasscodeSession/);
  const passcodeCheckIndex = source.indexOf("invitation.passcodeHash");
  // lastIndexOf, not indexOf: "getInvitationMediaForManagement" also appears
  // earlier in this file's own import statement and doc comment, both of
  // which necessarily precede the passcode check. The property this test
  // means to verify is that the *call site* (the last occurrence) comes
  // after the passcode check, not that the identifier's first textual
  // appearance does.
  const signedMediaCallIndex = source.lastIndexOf("getInvitationMediaForManagement");
  assert.ok(passcodeCheckIndex >= 0 && signedMediaCallIndex > passcodeCheckIndex);
});
