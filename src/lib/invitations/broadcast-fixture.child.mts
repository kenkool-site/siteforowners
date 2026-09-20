// Plain script (deliberately NOT a node:test file) run by broadcast-fixture.test.ts
// in a child process via `node --conditions=react-server --import tsx <this file>`.
//
// Why not a self-respawning node:test file like capacity-fixture.test.ts's
// pattern: Node's test runner detects `node --test` invoked from inside a
// process that is itself already running under `node --test` (as this
// suite always is — see the project's own `npx tsx --test <files>`
// convention) as recursive, and silently *skips running the child's tests
// entirely* while still exiting 0 — i.e. a child assertion failure would be
// swallowed as a false pass. Confirmed empirically while writing this test:
// a deliberately-failing assertion inside such a self-respawned child still
// reported "ok" when the outer file ran via `npx tsx --test`, with node
// printing "Warning: node:test run() is being called recursively within a
// test file. skipping running files." to stderr. Running a plain script
// (no node:test involved) as the child avoids that recursion detection
// entirely, so a real failure here really does produce a nonzero exit code.
import assert from "node:assert/strict";

process.env.INVITATION_E2E_FIXTURES = "1";

const { resetInvitationE2EFixtures } = await import("./e2e-fixtures");
const { createInvitationBroadcast, listInvitationBroadcasts, dispatchInvitationBroadcast } = await import("./broadcasts");

const manifest = await resetInvitationE2EFixtures();
const eventId = manifest.events.english.id;

// No real Supabase credentials exist anywhere in this process — if any of
// these calls reached createAdminClient() (src/lib/supabase/admin.ts) they
// would throw "supabaseUrl is required" rather than resolve.
const before = await listInvitationBroadcasts(eventId);
assert.deepEqual(before, []);

const created = await createInvitationBroadcast({
  eventId, channel: "email", subject: "Hi", body: "Hi all", sentBy: "owner",
});
assert.equal(created.eventId, eventId);
assert.equal(created.recipientCount, 0);

const afterCreate = await listInvitationBroadcasts(eventId);
assert.deepEqual(afterCreate.map((b) => b.id), [created.id]);

// dispatchInvitationBroadcast additionally exercises
// updateInvitationBroadcastCounts (also fixed) and
// listInvitationRsvpsForBroadcast (also fixed) end to end. Its notification
// dependencies (reserveInvitationNotification etc., from notifications.ts)
// are NOT fixture-aware and would also throw under these empty
// credentials — but dispatchBroadcastNotifications now fully contains any
// such throw per recipient (see broadcasts.test.ts), so this must still
// resolve rather than reject even though every recipient here has no real
// Supabase to reserve against.
const dispatchResult = await dispatchInvitationBroadcast({
  eventId, channel: "sms", subject: null, body: "See you soon!", sentBy: "founder",
  emailFrom: "hello@example.test", smsFrom: "+15550001111",
});
assert.equal(dispatchResult.broadcast.eventId, eventId);

const afterDispatch = await listInvitationBroadcasts(eventId);
assert.equal(afterDispatch.length, 2);
assert.ok(afterDispatch.some((broadcast) => broadcast.id === dispatchResult.broadcast.id));

console.log("BROADCAST_FIXTURE_CHILD_OK");
