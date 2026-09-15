import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("fixture capacity matches serialized production policy, including restorative guest/admin edits", async () => {
  if (!process.env.INVITATION_CAPACITY_TEST_CHILD) {
    const result = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "--test", fileURLToPath(import.meta.url)], {
      encoding: "utf8", env: { ...process.env, INVITATION_CAPACITY_TEST_CHILD: "1" },
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return;
  }
  const { invitationE2ERepository, resetInvitationE2EFixtures, submitFixtureInvitationRsvp } = await import("./e2e-fixtures");
  const previous = process.env.INVITATION_E2E_FIXTURES;
  process.env.INVITATION_E2E_FIXTURES = "1";
  try {
    const manifest = await resetInvitationE2EFixtures();
    const eventId = manifest.events.english.id;
    const input = { primaryName: "Guest", email: "guest@example.com", phone: null, attending: true, partySize: 4, additionalGuestNames: [], dietaryOrAccessibilityNotes: null, message: null };
    const created = await submitFixtureInvitationRsvp({ eventId, input });
    assert.ok(created.ok);
    const unchanged = await submitFixtureInvitationRsvp({ eventId, input });
    assert.equal(unchanged.ok && unchanged.value.outcome, "unchanged");
    assert.equal(unchanged.ok && unchanged.value.rsvpId, created.ok && created.value.rsvpId);
    const contactUpdate = await submitFixtureInvitationRsvp({ eventId, input: { ...input, message: "Updated note" } });
    assert.equal(contactUpdate.ok && contactUpdate.value.outcome, "updated");
    assert.equal(contactUpdate.ok && contactUpdate.value.rsvpId, created.ok && created.value.rsvpId);
    await assert.rejects(invitationE2ERepository.updateEvent(eventId, { capacity: 3 }), /INVITE_CAPACITY_BELOW_ATTENDANCE/);
    await invitationE2ERepository.updateEvent(eventId, { capacity: 4 });
    await invitationE2ERepository.updateEvent(eventId, { capacity: null });
    const event = await invitationE2ERepository.get(eventId);
    assert.ok(event);
    event.capacity = 1; // Seed legacy inconsistent data directly in the test.
    const rsvpId = created.value.rsvpId;
    const editToken = created.value.editToken!;
    for (const credentialMode of ["guest", "administrative"] as const) {
      const result = await submitFixtureInvitationRsvp({ eventId, rsvpId, editToken, credentialMode, input: { ...input, partySize: 3 } });
      assert.ok(result.ok);
      const increase = await submitFixtureInvitationRsvp({ eventId, rsvpId, editToken, credentialMode, input });
      assert.deepEqual(increase, { ok: false, code: "capacity_reached" });
    }
    const decline = await submitFixtureInvitationRsvp({ eventId, rsvpId, editToken, input: { ...input, attending: false, partySize: 0 } });
    assert.ok(decline.ok);
  } finally {
    if (previous === undefined) delete process.env.INVITATION_E2E_FIXTURES;
    else process.env.INVITATION_E2E_FIXTURES = previous;
  }
});

test("fixture rejects a submission whose email and phone identify different parties", async () => {
  if (!process.env.INVITATION_CAPACITY_TEST_CHILD) return;
  const { resetInvitationE2EFixtures, submitFixtureInvitationRsvp } = await import("./e2e-fixtures");
  process.env.INVITATION_E2E_FIXTURES = "1";
  const manifest = await resetInvitationE2EFixtures();
  const eventId = manifest.events.english.id;
  const base = { primaryName: "Guest", attending: true, partySize: 1, additionalGuestNames: [], dietaryOrAccessibilityNotes: null, message: null };
  await submitFixtureInvitationRsvp({ eventId, input: { ...base, email: "one@example.com", phone: "+15550000001" } });
  await submitFixtureInvitationRsvp({ eventId, input: { ...base, email: "two@example.com", phone: "+15550000002" } });
  const conflict = await submitFixtureInvitationRsvp({ eventId, input: { ...base, email: "one@example.com", phone: "+15550000002" } });
  assert.deepEqual(conflict, { ok: false, code: "contact_conflict" });
});
