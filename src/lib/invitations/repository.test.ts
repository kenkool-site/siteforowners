import assert from "node:assert/strict";
import test from "node:test";
import {
  createInvitationOwnerAndEvent,
  generateInvitationPin,
  generateInvitationSlug,
  getInvitationEventForManagement,
  listFounderEvents,
} from "./repository-core";

test("provisioning normalizes email, hashes the PIN, and applies founder limits", async () => {
  const inserted: unknown[] = [];
  const result = await createInvitationOwnerAndEvent(
    {
      ownerName: "Mia",
      ownerEmail: " MIA@EXAMPLE.COM ",
      ownerPhone: null,
      title: "Mia & Lee",
      eventType: "wedding",
      locale: "en",
    },
    {
      hashPin: async () => "hashed-pin",
      generatePin: () => "123456",
      generateSlug: () => "mia-lee-x7k2p9",
      insert: async (rows) => {
        inserted.push(rows);
        return { ownerId: "owner-1", eventId: "event-1" };
      },
    },
  );

  assert.deepEqual(result, {
    ownerId: "owner-1",
    eventId: "event-1",
    slug: "mia-lee-x7k2p9",
    pin: "123456",
  });
  assert.deepEqual(inserted, [
    {
      owner: {
        name: "Mia",
        email: "mia@example.com",
        phone: null,
        pin_hash: "hashed-pin",
      },
      event: {
        slug: "mia-lee-x7k2p9",
        event_type: "wedding",
        locale: "en",
        title: "Mia & Lee",
        starts_at: null,
        timezone: "America/New_York",
        submission_limit: 250,
        email_notification_limit: 250,
        sms_notification_limit: 50,
        notification_email: "mia@example.com",
      },
    },
  ]);
});

test("generated credentials use a six-digit PIN and a title slug with six random base36 characters", () => {
  assert.match(generateInvitationPin(), /^\d{6}$/);
  assert.match(generateInvitationSlug("  Mia & Lee!  "), /^mia-lee-[a-z0-9]{6}$/);
});

test("founder event summaries aggregate attending people, declined parties, and warnings", async () => {
  const events = await listFounderEvents({
    list: async () => [
      {
        id: "event-1",
        slug: "mia-lee-x7k2p9",
        title: "Mia & Lee",
        starts_at: "2026-10-03T20:00:00.000Z",
        status: "published",
        invitation_owners: { name: "Mia", email: "mia@example.com" },
        invitation_rsvps: [
          { attending: true, party_size: 3 },
          { attending: true, party_size: 2 },
          { attending: false, party_size: 0 },
        ],
        invitation_notifications: [
          { status: "sent" },
          { status: "failed" },
          { status: "suppressed" },
        ],
      },
    ],
    get: async () => null,
    insert: async () => ({ ownerId: "unused", eventId: "unused" }),
  });

  assert.deepEqual(events, [
    {
      id: "event-1",
      slug: "mia-lee-x7k2p9",
      title: "Mia & Lee",
      ownerName: "Mia",
      ownerEmail: "mia@example.com",
      startsAt: "2026-10-03T20:00:00.000Z",
      status: "published",
      attendingPeople: 5,
      declinedParties: 1,
      notificationWarningCount: 2,
    },
  ]);
});

test("management projection omits owner PIN and event passcode hashes", async () => {
  const event = await getInvitationEventForManagement("event-1", {
    list: async () => [],
    insert: async () => ({ ownerId: "unused", eventId: "unused" }),
    get: async () => ({
      id: "event-1",
      owner_id: "owner-1",
      slug: "mia-lee-x7k2p9",
      event_type: "wedding",
      locale: "en",
      title: "Mia & Lee",
      honoree_names: "Mia & Lee",
      description: "Celebrate with us",
      starts_at: "2026-10-03T20:00:00.000Z",
      ends_at: null,
      timezone: "America/New_York",
      venue_name: null,
      address: null,
      map_url: null,
      theme_key: "classic",
      primary_color: "#1f2937",
      accent_color: "#d4a373",
      font_pair_key: "serif-sans",
      designed_invite_path: null,
      cover_image_path: null,
      video_path: null,
      passcode_hash: "must-not-leak",
      show_public_rsvp_count: false,
      capacity: null,
      rsvp_deadline: null,
      submission_limit: 250,
      email_notification_limit: 250,
      sms_notification_limit: 50,
      owner_email_notifications: true,
      owner_sms_notifications: false,
      notification_email: "mia@example.com",
      notification_phone: null,
      guest_email_confirmations: true,
      status: "draft",
      expire_at: null,
      created_at: "2026-09-13T00:00:00.000Z",
      updated_at: "2026-09-13T00:00:00.000Z",
      invitation_owners: {
        id: "owner-1",
        name: "Mia",
        email: "mia@example.com",
        phone: null,
        pin_hash: "must-not-leak",
        is_active: true,
        created_at: "2026-09-13T00:00:00.000Z",
        updated_at: "2026-09-13T00:00:00.000Z",
      },
    }),
  });

  assert.ok(event);
  assert.equal("passcodeHash" in event, false);
  assert.equal("pinHash" in event.owner, false);
  assert.equal(JSON.stringify(event).includes("must-not-leak"), false);
  assert.equal(event.endsAt, null);
});
