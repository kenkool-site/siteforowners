import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

// broadcasts.ts's createInvitationBroadcast / listInvitationRsvpsForBroadcast /
// updateInvitationBroadcastCounts / listInvitationBroadcasts otherwise call
// createAdminClient() directly and unconditionally — createClient("", "")
// throws "supabaseUrl is required" the moment any of them run under this
// project's E2E fixture environment (see playwright.config.ts, which starts
// the dev server with empty Supabase credentials and INVITATION_E2E_FIXTURES=1).
// This proves the isInvitationE2EFixturesEnabled() branch added to those
// functions is actually taken instead of ever reaching createAdminClient().
//
// The actual assertions live in broadcast-fixture.child.ts, run here as a
// plain (non node:test) child process with `--conditions=react-server` so
// that e2e-fixtures.ts's `import "server-only"` resolves to its harmless
// empty.js export (matching the condition Next sets for real server
// bundles) instead of throwing — see that file's own comment for why a
// self-respawning node:test child (this codebase's usual pattern, e.g.
// capacity-fixture.test.ts) isn't used here.
test("broadcasts.ts's create/list/dispatch functions use the E2E fixture store, not a real Supabase client, when fixtures are enabled", () => {
  const childScript = path.join(path.dirname(fileURLToPath(import.meta.url)), "broadcast-fixture.child.mts");
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", childScript], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `broadcast-fixture.child.ts failed:\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  assert.match(result.stdout, /BROADCAST_FIXTURE_CHILD_OK/);
});
