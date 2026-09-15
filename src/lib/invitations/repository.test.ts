import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInvitationEventUpdateRow,
  buildInvitationOwnerUpdateRow,
  createInvitationOwnerAndEvent,
  generateInvitationPin,
  generateInvitationSlug,
  getInvitationEventForManagement,
  getPublicInvitationBySlug,
  listFounderEvents,
  updateInvitationOwnerCredentials,
} from "./repository-core";
import type { InvitationEventUpdate } from "./validation";

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
      publicSubdomain: "mia-lee",
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
        public_subdomain: "mia-lee",
        event_type: "wedding",
        locale: "en",
        title: "Mia & Lee",
        starts_at: null,
        expire_at: null,
        timezone: "America/New_York",
        submission_limit: 250,
        email_notification_limit: 250,
        sms_notification_limit: 50,
        notification_email: "mia@example.com",
      },
    },
  ]);
});

test("provisioning persists timezone-derived expiry and explicit disabling remains null", async () => {
  await createInvitationOwnerAndEvent({ ownerName: "A", ownerEmail: "a@example.com", ownerPhone: null, title: "Event", eventType: "party", locale: "en", startsAt: "2026-03-07T22:00:00Z", timezone: "America/New_York" }, {
    hashPin: async () => "hash", generatePin: () => "123456", generateSlug: () => "event",
    insert: async (rows) => {
      assert.equal(rows.event.expire_at, "2026-03-09T04:00:00.000Z");
      return { ownerId: "owner", eventId: "event" };
    },
  });
  assert.equal(buildInvitationEventUpdateRow({ expireAt: null }).expire_at, null);
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
      publicSubdomain: null,
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
      travel_info: {
        airports: [{ name: "DFW", note: "35 minutes away", directionsUrl: "https://maps.example.test/dfw" }],
        hotels: [{ name: "The Grand", address: "10 Main St", recommended: true }],
      },
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
      cohost: {
        id: "owner-2",
        name: "Lee",
        email: "lee@example.com",
        phone: null,
        pin_hash: "cohost-secret",
        is_active: true,
        created_at: "2026-09-13T00:00:00.000Z",
        updated_at: "2026-09-13T00:00:00.000Z",
      },
    }),
  });

  assert.ok(event);
  assert.equal("passcodeHash" in event, false);
  assert.equal("pinHash" in event.owner, false);
  assert.equal(event.cohost?.email, "lee@example.com");
  assert.equal(event.cohost && "pinHash" in event.cohost, false);
  assert.equal(JSON.stringify(event).includes("must-not-leak"), false);
  assert.equal(event.endsAt, null);
  assert.deepEqual((event as unknown as { travelInfo: unknown }).travelInfo, {
    airports: [{ name: "DFW", note: "35 minutes away", directionsUrl: "https://maps.example.test/dfw" }],
    hotels: [{ name: "The Grand", address: "10 Main St", recommended: true }],
  });
});

test("public lookup preserves the exact slug and returns only presentation fields plus aggregates", async () => {
  const lookedUp: string[] = [];
  const invitation = await getPublicInvitationBySlug("Mia-And-Lee ", {
    findBySlug: async (slug) => {
      lookedUp.push(slug);
      return {
        id: "event-1",
        slug: "Mia-And-Lee ",
        event_type: "wedding",
        locale: "en",
        title: "Mia & Lee",
        honoree_names: "Mia and Lee",
        description: "Celebrate with us",
        starts_at: "2026-10-03T20:00:00.000Z",
        ends_at: null,
        timezone: "America/New_York",
        venue_name: "The Garden",
        address: "42 Celebration Way",
        map_url: null,
        travel_info: { airports: [], hotels: [{ name: "The Grand", address: "10 Main St", recommended: true }] },
        theme_key: "classic",
        primary_color: "#18253A",
        accent_color: "#9B6A44",
        font_pair_key: "fraunces-geist",
        designed_invite_path: null,
        cover_image_path: null,
        video_path: null,
        passcode_hash: "stored-passcode-hash",
        show_public_rsvp_count: true,
        rsvp_deadline: null,
        status: "published",
        expire_at: null,
        invitation_rsvps: [
          { attending: true, party_size: 4 },
          { attending: false, party_size: 0 },
          { attending: false, party_size: 0 },
        ],
      };
    },
  });

  assert.deepEqual(lookedUp, ["Mia-And-Lee "]);
  assert.ok(invitation);
  assert.equal(invitation.passcodeHash, "stored-passcode-hash");
  assert.deepEqual(invitation.rsvpSummary, { attendingPeople: 4, declinedParties: 2 });
  assert.equal("ownerId" in invitation.event, false);
  assert.equal("notificationEmail" in invitation.event, false);
  assert.equal("passcodeHash" in invitation.event, false);
  assert.deepEqual((invitation.event as unknown as { travelInfo: unknown }).travelInfo, {
    airports: [], hotels: [{ name: "The Grand", address: "10 Main St", recommended: true }],
  });
});

test("event update rows map editable fields without inventing passcode changes", () => {
  const update: InvitationEventUpdate = {
    title: "Updated",
    endsAt: "2026-10-04T01:00:00.000Z",
    showPublicRsvpCount: true,
    ...({ travelInfo: { airports: [], hotels: [{ name: "The Grand", address: "10 Main St", recommended: true }] } } as unknown as InvitationEventUpdate),
  };
  const row = buildInvitationEventUpdateRow(update);
  const { updated_at: updatedAt, ...persisted } = row;
  assert.deepEqual(persisted, {
    title: "Updated",
    ends_at: "2026-10-04T01:00:00.000Z",
    show_public_rsvp_count: true,
    travel_info: { airports: [], hotels: [{ name: "The Grand", address: "10 Main St", recommended: true }] },
  });
  assert.equal(typeof updatedAt, "string");
  assert.equal("passcode_hash" in row, false);
  assert.equal(buildInvitationEventUpdateRow({ removePasscode: true }).passcode_hash, null);
  assert.equal(buildInvitationEventUpdateRow({ passcode: "secret" }, "hashed").passcode_hash, "hashed");
});

test("owner credential rows persist only founder-normalized values and a supplied PIN hash", () => {
  const row = buildInvitationOwnerUpdateRow({
    ownerName: "Ana Rivera",
    ownerEmail: "ana@example.com",
    ownerPhone: "+19175551212",
    newOwnerPin: "654321",
  }, "hashed-pin");
  const { updated_at: updatedAt, ...persisted } = row;
  assert.deepEqual(persisted, {
    name: "Ana Rivera",
    email: "ana@example.com",
    phone: "+19175551212",
    pin_hash: "hashed-pin",
  });
  assert.equal(typeof updatedAt, "string");
  assert.equal(JSON.stringify(row).includes("654321"), false);
});

test("duplicate owner email failure stays inside the credential repository boundary", async () => {
  let ownerWrites = 0;
  await assert.rejects(
    async () => updateInvitationOwnerCredentials(
      "owner-1",
      { ownerEmail: "duplicate@example.com" },
      undefined,
      {
        updateOwner: async () => {
          ownerWrites += 1;
          throw new Error("duplicate owner email");
        },
      },
    ),
    /duplicate owner email/,
  );
  assert.equal(ownerWrites, 1);
});
