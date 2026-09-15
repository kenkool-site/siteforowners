import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const routeUrl = new URL("../../app/api/invitations/public/[slug]/cover/route.ts", import.meta.url);

test("public cover route refuses private and unavailable invitations before downloading media", () => {
  const source = readFileSync(routeUrl, "utf8");
  const privacyCheck = source.indexOf("invitation.passcodeHash");
  const lifecycleCheck = source.indexOf('!== "published"');
  const download = source.indexOf(".download(path)");
  assert.ok(privacyCheck >= 0 && lifecycleCheck >= 0 && download > privacyCheck && download > lifecycleCheck);
  assert.match(source, /isInvitationMediaPathForEvent\(path, invitation\.event\.id, "cover"\)/);
  assert.match(source, /X-Content-Type-Options/);
});
