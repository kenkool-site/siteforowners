import assert from "node:assert/strict";
import test from "node:test";
import {
  administrativeRsvpAuditMetadata,
  buildInvitationResponsesDashboard,
  normalizeInvitationResponseQuery,
  type InvitationResponseRow,
} from "./responses";

test("administrative RSVP audit metadata cannot carry private response content", () => {
  const metadata = administrativeRsvpAuditMetadata({
    eventId: "event-1",
    rsvpId: "rsvp-1",
    actor: "owner",
    ownerId: "owner-1",
    attending: true,
    partySize: 2,
    updatedAt: "2026-09-14T12:00:00.000Z",
    privateResponse: {
      primaryName: "Private Guest",
      email: "private@example.test",
      phone: "+19175550199",
      additionalGuestNames: ["Guest Two"],
      notes: "Peanut allergy",
      message: "Private message",
      editToken: "secret-token",
    },
  });

  assert.deepEqual(metadata, {
    eventId: "event-1",
    rsvpId: "rsvp-1",
    actor: "owner",
    ownerId: "owner-1",
    attending: true,
    partySize: 2,
    updatedAt: "2026-09-14T12:00:00.000Z",
  });
  assert.doesNotMatch(JSON.stringify(metadata), /Private Guest|private@example|19175550199|Guest Two|Peanut|Private message|secret-token/);
});

const rows: InvitationResponseRow[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    event_id: "event-1",
    primary_name: "Zoë Alvarez",
    email: "zoe@example.test",
    phone: null,
    attending: true,
    party_size: 2,
    additional_guest_names: ["Ana Alvarez"],
    dietary_or_accessibility_notes: null,
    message: null,
    created_at: "2026-09-13T12:00:00.000Z",
    updated_at: "2026-09-13T12:00:00.000Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    event_id: "event-1",
    primary_name: "Ana Cruz",
    email: null,
    phone: "+19175550101",
    attending: false,
    party_size: 0,
    additional_guest_names: [],
    dietary_or_accessibility_notes: "Ramp access",
    message: null,
    created_at: "2026-09-14T12:00:00.000Z",
    updated_at: "2026-09-14T12:00:00.000Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    event_id: "event-1",
    primary_name: "Ana Cruz",
    email: "ana@example.test",
    phone: null,
    attending: true,
    party_size: 1,
    additional_guest_names: [],
    dietary_or_accessibility_notes: null,
    message: "See you there",
    created_at: "2026-09-14T12:00:00.000Z",
    updated_at: "2026-09-14T12:00:00.000Z",
  },
];

const event = {
  status: "published" as const,
  capacity: 5,
  rsvp_deadline: "2026-09-01T00:00:00.000Z",
  expire_at: null,
  email_notification_limit: 2,
  sms_notification_limit: 5,
};

test("response query trims search, validates filters, and bounds pagination", () => {
  assert.deepEqual(normalizeInvitationResponseQuery({
    status: "bogus",
    search: "  ANA  ",
    sort: "bogus",
    page: "0",
    perPage: "9999",
  }), {
    status: "all",
    search: "ANA",
    sort: "newest",
    page: 1,
    perPage: 100,
  });
});

test("filtered response pages keep whole-event summary and stable name ordering", () => {
  const dashboard = buildInvitationResponsesDashboard({
    event,
    rows,
    notifications: [
      { id: "note-1", channel: "email", status: "failed" },
      { id: "note-2", channel: "email", status: "sent" },
      { id: "note-3", channel: "email", status: "suppressed" },
    ],
    query: { status: "attending", search: " ana ", sort: "name", page: 1, perPage: 1 },
    now: new Date("2026-09-14T15:00:00.000Z"),
  });

  assert.deepEqual(dashboard.responses.map((row) => row.id), ["00000000-0000-4000-8000-000000000003"]);
  assert.equal(dashboard.filteredTotal, 2);
  assert.deepEqual(dashboard.summary, {
    attendingPeople: 3,
    attendingParties: 2,
    declinedParties: 1,
    remainingCapacity: 2,
    totalSubmissions: 3,
  });
  assert.equal(dashboard.notificationWarningCount, 2);
  assert.deepEqual(dashboard.failedNotifications, [{ id: "note-1", channel: "email" }]);
  assert.deepEqual(dashboard.warnings, [
    { code: "deadline_reached", count: 1 },
    { code: "email_limit_reached", count: 1 },
    { code: "failed_delivery", count: 1 },
  ]);
});

test("newest and oldest sorts use ids as a stable tie-breaker", () => {
  const newest = buildInvitationResponsesDashboard({
    event: { ...event, rsvp_deadline: null }, rows, notifications: [],
    query: { status: "all", search: "", sort: "newest", page: 1, perPage: 25 },
    now: new Date("2026-08-01T00:00:00.000Z"),
  });
  const oldest = buildInvitationResponsesDashboard({
    event: { ...event, rsvp_deadline: null }, rows, notifications: [],
    query: { status: "all", search: "", sort: "oldest", page: 1, perPage: 25 },
    now: new Date("2026-08-01T00:00:00.000Z"),
  });

  assert.deepEqual(newest.responses.map((row) => row.id), [rows[2]!.id, rows[1]!.id, rows[0]!.id]);
  assert.deepEqual(oldest.responses.map((row) => row.id), [rows[0]!.id, rows[1]!.id, rows[2]!.id]);
});

test("an out-of-range response page clamps to the last non-empty page", () => {
  const dashboard = buildInvitationResponsesDashboard({
    event: { ...event, rsvp_deadline: null },
    rows,
    notifications: [],
    query: { status: "attending", search: "", sort: "oldest", page: 9, perPage: 1 },
    now: new Date("2026-08-01T00:00:00.000Z"),
  });

  assert.equal(dashboard.filteredTotal, 2);
  assert.equal(dashboard.page, 2);
  assert.deepEqual(dashboard.responses.map((row) => row.id), [rows[2]!.id]);
});
