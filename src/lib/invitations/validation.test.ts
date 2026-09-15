import assert from "node:assert/strict";
import test from "node:test";
import {
  isStatusCommandAllowed,
  parseEventUpdate,
  parseOwnerCredentialUpdate,
  parseRsvpInput,
  parseStatusCommand,
  validatePublishableEvent,
  validateStatusTransition,
} from "./validation";

test("an RSVP requires a name and one normalized contact", () => {
  assert.deepEqual(
    parseRsvpInput({
      primaryName: " Ana ",
      email: "ANA@EXAMPLE.COM",
      attending: true,
      partySize: 2,
    }),
    {
      ok: true,
      value: {
        primaryName: "Ana",
        email: "ana@example.com",
        phone: null,
        attending: true,
        partySize: 2,
        additionalGuestNames: [],
        dietaryOrAccessibilityNotes: null,
        message: null,
      },
    },
  );
  assert.equal(
    parseRsvpInput({ primaryName: "Ana", attending: true, partySize: 1 }).ok,
    false,
  );
});

test("declines normalize party size to zero", () => {
  const parsed = parseRsvpInput({
    primaryName: "Ana",
    phone: "9175551212",
    attending: false,
    partySize: 4,
  });
  assert.equal(parsed.ok && parsed.value.partySize, 0);
});

test("RSVP email and additional names must be coherent with the party size", () => {
  const invalidEmail = parseRsvpInput({
    primaryName: "Ana",
    email: "not-an-email",
    attending: true,
    partySize: 1,
  });
  assert.equal(invalidEmail.ok, false);

  const tooManyNames = parseRsvpInput({
    primaryName: "Ana",
    email: "ana@example.com",
    attending: true,
    partySize: 2,
    additionalGuestNames: ["Luis", "María"],
  });
  assert.equal(tooManyNames.ok, false);

  const decline = parseRsvpInput({
    primaryName: "Ana",
    email: "ana@example.com",
    attending: false,
    additionalGuestNames: ["Luis"],
  });
  assert.deepEqual(decline.ok && decline.value.additionalGuestNames, []);
});

test("owners cannot change founder-controlled limits", () => {
  const parsed = parseEventUpdate({ submissionLimit: 900, ownerEmail: "other@example.com", newOwnerPin: "654321", title: "Updated" }, "owner");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.ok && "submissionLimit" in parsed.value, false);
  assert.equal(parsed.ok && "ownerEmail" in parsed.value, false);
  assert.equal(parsed.ok && "newOwnerPin" in parsed.value, false);
  assert.equal(parsed.ok && parsed.value.title, "Updated");
});

test("founders can normalize owner credentials", () => {
  const parsed = parseOwnerCredentialUpdate({
    ownerName: " Ana Rivera ",
    ownerEmail: " ANA@EXAMPLE.COM ",
    ownerPhone: "(917) 555-1212",
    newOwnerPin: "654321",
  });
  assert.deepEqual(parsed, {
    ok: true,
    value: {
      ownerName: "Ana Rivera",
      ownerEmail: "ana@example.com",
      ownerPhone: "+19175551212",
      newOwnerPin: "654321",
    },
  });
});

test("SMS requires a normalized notification phone", () => {
  const invalid = parseEventUpdate(
    { ownerSmsNotifications: true, notificationPhone: "bad" },
    "founder",
  );
  assert.equal(invalid.ok, false);

  const valid = parseEventUpdate(
    { ownerSmsNotifications: true, notificationPhone: "(917) 555-1212" },
    "owner",
  );
  assert.equal(valid.ok && valid.value.notificationPhone, "+19175551212");
});

test("event times are ordered and an end requires a later instant", () => {
  const parsed = parseEventUpdate({
    startsAt: "2026-10-20T18:00:00.000Z",
    endsAt: "2026-10-20T17:00:00.000Z",
    rsvpDeadline: "2026-10-21T18:00:00.000Z",
    expireAt: "2026-10-19T18:00:00.000Z",
  }, "owner");
  assert.equal(parsed.ok, false);
  assert.deepEqual(parsed.ok ? {} : Object.keys(parsed.errors).sort(), [
    "endsAt",
    "expireAt",
    "rsvpDeadline",
  ]);
});

test("passcode removal must be explicit", () => {
  const absent = parseEventUpdate({ title: "Keep protected" }, "owner");
  const removed = parseEventUpdate({ removePasscode: true }, "owner");
  assert.equal(absent.ok && "passcode" in absent.value, false);
  assert.equal(absent.ok && "removePasscode" in absent.value, false);
  assert.equal(removed.ok && removed.value.removePasscode, true);
});

test("public theme validation accepts the three curated layouts and rejects legacy aliases", () => {
  for (const themeKey of ["classic", "romantic", "celebration"]) {
    const parsed = parseEventUpdate({ themeKey }, "owner");
    assert.equal(parsed.ok && parsed.value.themeKey, themeKey);
  }
  for (const themeKey of ["editorial", "garden"]) {
    assert.equal(parseEventUpdate({ themeKey }, "owner").ok, false);
  }
});

test("travel information trims complete rows and ignores fully empty optional rows", () => {
  const parsed = parseEventUpdate({
    travelInfo: {
      airports: [
        { name: " Dallas Fort Worth International ", note: " About 35 minutes away ", directionsUrl: " https://maps.example.test/dfw " },
        { name: " ", note: " ", directionsUrl: " " },
      ],
      hotels: [
        { name: " The Grand Hotel ", address: " 10 Main Street, Dallas, TX ", recommended: true },
        { name: " ", address: " ", recommended: false },
      ],
    },
  }, "owner");

  assert.deepEqual(parsed, {
    ok: true,
    value: {
      travelInfo: {
        airports: [{ name: "Dallas Fort Worth International", note: "About 35 minutes away", directionsUrl: "https://maps.example.test/dfw" }],
        hotels: [{ name: "The Grand Hotel", address: "10 Main Street, Dallas, TX", recommended: true }],
      },
    },
  });
});

test("travel information rejects incomplete rows, unsafe links, excess rows, and multiple recommendations", () => {
  const invalidCases = [
    { airports: [{ name: "", note: "Nearby", directionsUrl: "" }], hotels: [] },
    { airports: [{ name: "DFW", note: "", directionsUrl: "javascript:alert(1)" }], hotels: [] },
    { airports: Array.from({ length: 4 }, (_, index) => ({ name: `Airport ${index}`, note: "", directionsUrl: "" })), hotels: [] },
    { airports: [], hotels: [{ name: "Hotel", address: "", recommended: false }] },
    { airports: [], hotels: Array.from({ length: 6 }, (_, index) => ({ name: `Hotel ${index}`, address: `${index} Main St`, recommended: false })) },
    { airports: [], hotels: [
      { name: "Hotel One", address: "1 Main St", recommended: true },
      { name: "Hotel Two", address: "2 Main St", recommended: true },
    ] },
  ];
  for (const travelInfo of invalidCases) {
    const parsed = parseEventUpdate({ travelInfo }, "owner");
    assert.equal(parsed.ok, false);
    if (!parsed.ok) assert.equal(typeof parsed.errors.travelInfo, "string");
  }
});

test("publish validation returns actionable field errors", () => {
  const errors = validatePublishableEvent({
    title: "",
    honoreeNames: "",
    startsAt: "2020-01-01T12:00:00.000Z",
    endsAt: null,
    rsvpDeadline: null,
    expireAt: null,
    timezone: "America/New_York",
    venueName: null,
    address: null,
    notificationEmail: null,
    designedInvitePath: null,
    coverImagePath: null,
    videoPath: null,
  }, { now: new Date("2026-01-01T00:00:00.000Z") });

  assert.deepEqual(Object.keys(errors).sort(), [
    "address",
    "honoreeNames",
    "media",
    "notificationEmail",
    "startsAt",
    "title",
    "venueName",
  ]);
});

test("raw event updates reject direct media path assignment", () => {
  const parsed = parseEventUpdate({
    designedInvitePath: "event-1/designed_invite/unvalidated.jpg",
    coverImagePath: "event-1/cover/unvalidated.png",
    videoPath: "event-1/video/unvalidated.mp4",
  }, "founder");
  assert.deepEqual(parsed, {
    ok: false,
    errors: { media: "Use the media upload endpoint to change invitation media." },
  });
});

test("status commands are allowlisted and map to persisted states", () => {
  assert.deepEqual(parseStatusCommand({ command: "close" }), { ok: true, command: "close", status: "rsvp_closed" });
  assert.deepEqual(parseStatusCommand({ command: "reopen" }), { ok: true, command: "reopen", status: "published" });
  assert.equal(parseStatusCommand({ command: "archive" }).ok, false);
  assert.equal(isStatusCommandAllowed("draft", "reopen"), false);
  assert.equal(isStatusCommandAllowed("rsvp_closed", "reopen"), true);
});

test("only founders can update a normalized public subdomain", () => {
  const founder = parseEventUpdate({ publicSubdomain: " Mercy & John " }, "founder");
  assert.deepEqual(founder, { ok: true, value: { publicSubdomain: "mercy-john" } });

  const owner = parseEventUpdate({ publicSubdomain: "owner-change" }, "owner");
  assert.deepEqual(owner, { ok: true, value: {} });
});

test("founder public subdomain validation rejects reserved labels and allows clearing", () => {
  assert.deepEqual(parseEventUpdate({ publicSubdomain: "admin" }, "founder"), {
    ok: false,
    errors: { publicSubdomain: "Choose another public address." },
  });
  assert.deepEqual(parseEventUpdate({ publicSubdomain: "" }, "founder"), {
    ok: true,
    value: { publicSubdomain: null },
  });
});

test("event updates normalize optional style guidance", () => {
  assert.deepEqual(parseEventUpdate({
    styleGuide: {
      note: "  Glamorous fascinators ",
      colors: [{ name: " Sage ", color: "#9ca58b" }],
    },
  }, "owner"), {
    ok: true,
    value: { styleGuide: { note: "Glamorous fascinators", colors: [{ name: "Sage", color: "#9CA58B" }] } },
  });
  assert.deepEqual(parseEventUpdate({ styleGuide: { note: "", colors: [] } }, "owner"), {
    ok: true,
    value: { styleGuide: null },
  });
  assert.deepEqual(parseEventUpdate({ styleGuide: null }, "owner"), {
    ok: true,
    value: { styleGuide: null },
  });
});

test("event updates reject malformed style guidance", () => {
  assert.deepEqual(parseEventUpdate({
    styleGuide: { note: null, colors: [{ name: "Sage", color: "green" }] },
  }, "owner"), {
    ok: false,
    errors: { styleGuide: "Enter a valid style note and event colors." },
  });
});

test("event updates normalize flexible additional sections", () => {
  assert.deepEqual(parseEventUpdate({
    additionalSections: [
      { heading: " Wedding Day Schedule ", content: " Ceremony @ 1pm\nReception @ 3:30pm " },
      { heading: "", content: "" },
    ],
  }, "owner"), {
    ok: true,
    value: { additionalSections: [{ heading: "Wedding Day Schedule", content: "Ceremony @ 1pm\nReception @ 3:30pm" }] },
  });
  assert.deepEqual(parseEventUpdate({ additionalSections: [{ heading: "Dress Code", content: "" }] }, "owner"), {
    ok: false,
    errors: { additionalSections: "Complete or remove each additional section." },
  });
});

test("publish validation blocks incoherent event timing", () => {
  const errors = validatePublishableEvent({
    title: "Ana & Luis",
    honoreeNames: "Ana and Luis",
    startsAt: "2026-10-20T22:00:00.000Z",
    endsAt: "2026-10-20T21:00:00.000Z",
    rsvpDeadline: "2026-10-21T22:00:00.000Z",
    expireAt: "2026-10-19T22:00:00.000Z",
    timezone: "America/New_York",
    venueName: "The Foundry",
    address: "42 Celebration Way",
    notificationEmail: "ana@example.com",
    designedInvitePath: "event-1/invite.jpg",
    coverImagePath: null,
    videoPath: null,
  }, { now: new Date("2026-01-01T00:00:00.000Z") });
  assert.deepEqual(Object.keys(errors).sort(), ["endsAt", "expireAt", "rsvpDeadline"]);
});

test("reopen validates every transition back to published", () => {
  const event = {
    title: "",
    honoreeNames: "Ana and Luis",
    startsAt: "2026-10-20T22:00:00.000Z",
    endsAt: null,
    rsvpDeadline: null,
    expireAt: null,
    timezone: "America/New_York",
    venueName: "The Foundry",
    address: "42 Celebration Way",
    notificationEmail: "ana@example.com",
    designedInvitePath: "event-1/invite.jpg",
    coverImagePath: null,
    videoPath: null,
    status: "rsvp_closed" as const,
  };
  assert.deepEqual(
    validateStatusTransition(event, "reopen", "owner", { now: new Date("2026-01-01T00:00:00.000Z") }),
    { title: "Add an event title before publishing." },
  );
});

test("only founders can allow a past transition into published", () => {
  const event = {
    title: "Ana & Luis",
    honoreeNames: "Ana and Luis",
    startsAt: "2025-10-20T22:00:00.000Z",
    endsAt: null,
    rsvpDeadline: null,
    expireAt: null,
    timezone: "America/New_York",
    venueName: "The Foundry",
    address: "42 Celebration Way",
    notificationEmail: "ana@example.com",
    designedInvitePath: "event-1/invite.jpg",
    coverImagePath: null,
    videoPath: null,
    status: "rsvp_closed" as const,
  };
  const now = new Date("2026-01-01T00:00:00.000Z");
  assert.equal("startsAt" in validateStatusTransition(event, "reopen", "owner", { now, allowPastEvent: true }), true);
  assert.deepEqual(validateStatusTransition(event, "reopen", "founder", { now, allowPastEvent: true }), {});
});
