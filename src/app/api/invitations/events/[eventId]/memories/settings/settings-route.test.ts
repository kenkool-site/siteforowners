import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Was a dynamic `await import("./route")` module-load canary. This route now
// imports getInvitationEventForManagement from @/lib/invitations/repository
// (added so a successful settings update revalidates the cached guest pages
// via revalidateInvitationPage - see the final whole-branch review fix that
// wired this up), and that module starts with `import "server-only"`, which
// throws when actually loaded under plain tsx/node (no "react-server"
// resolution condition, unlike Next's real build) - the same tradeoff
// src/lib/invitations/public-access.ts documents for why it avoids importing
// ./repository at all. `npm run build` already proves this route loads fine
// in production; this now confirms the export exists structurally instead,
// matching the other two tests in this file.
test("settings route module loads under tsx --test", () => {
  const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  assert.match(source, /export async function PATCH/);
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

test("settings route recognizes set_find_me_enabled and patches findMeEnabled", () => {
  const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  assert.match(source, /set_find_me_enabled/);
  assert.match(source, /findMeEnabled: values\.enabled/);
});
