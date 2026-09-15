# Invitation Events MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an isolated invitation-events MVP inside SiteForOwners where a founder provisions an event, an owner edits it with email and PIN, guests RSVP through one shareable link, and bounded email/SMS notifications report each response.

**Architecture:** Invitation routes, database tables, storage, sessions, and services form a separate domain module inside the existing Next.js deployment. Public and authenticated route handlers call focused server services backed by Supabase service-role access; RLS blocks direct client access, and an atomic Postgres function enforces capacity and update rules. Shared React components serve founder and owner editors, while a dedicated public renderer supplies mobile-first English/Spanish invitation pages.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript strict, Tailwind CSS, Supabase PostgreSQL/RLS/Storage, Resend, Twilio, next-intl, Node test runner through `tsx`, Playwright

**Spec:** `docs/superpowers/specs/2026-09-13-invitation-events-mvp-design.md`

## Global Constraints

- Keep the module in the existing SiteForOwners application and Supabase project, but do not add invitation fields to `tenants`, `previews`, or business-site template records.
- Keep all guest and owner data server-side; never expose `SUPABASE_SERVICE_ROLE_KEY` to client components.
- Invitation-owner authorization comes from a signed HTTP-only session, never from a client-supplied owner ID.
- All authenticated mutation routes enforce a same-origin check before reading or changing data.
- Founder-only limits default to 250 RSVP records, 250 email notification attempts, and 50 SMS notification attempts per event.
- Public invitation, RSVP, confirmation, owner-login, and owner-dashboard interface strings must exist in `messages/en.json` and `messages/es.json`.
- Event-authored names and descriptions render exactly as entered and are not machine-translated.
- Design and test the guest experience at 375 px before enhancing desktop layouts.
- TypeScript remains strict; do not introduce `any`.
- The MVP has no public signup, checkout, initial guest-list delivery, individualized invitation URLs, guest accounts, waitlist, or seating chart.
- Images accept JPEG, PNG, or WebP up to 10 MB; gallery count is at most 12; the optional MP4/WebM video is at most 50 MB and 60 seconds.
- An RSVP persists before any email or SMS attempt; notification failure must never turn a successful RSVP into an error.

---

## File map

### Domain and persistence

- `supabase/migrations/036_invitation_events_foundation.sql` — tables, indexes, constraints, private storage bucket, and RLS
- `supabase/migrations/037_submit_invitation_rsvp.sql` — atomic create/update function and aggregate view
- `src/lib/invitations/types.ts` — domain row, input, summary, and result types
- `src/lib/invitations/state.ts` — effective lifecycle and public-access decisions
- `src/lib/invitations/validation.ts` — normalized event and RSVP inputs
- `src/lib/invitations/repository.ts` — service-role persistence used by server-only routes

### Authentication and authorization

- `src/lib/invitations/auth.ts` — owner session, PIN verification, edit tokens, and passcode sessions
- `src/lib/invitations/access.ts` — owner/founder event authorization
- `src/app/api/invitations/auth/login/route.ts` — owner login
- `src/app/api/invitations/auth/logout/route.ts` — owner logout
- `src/app/api/invitations/passcode/route.ts` — public shared-passcode verification

### Founder and owner management

- `src/app/(admin)/admin/invitations/page.tsx` — founder event list
- `src/app/(admin)/admin/invitations/new/page.tsx` — founder provisioning form
- `src/app/(admin)/admin/invitations/[eventId]/page.tsx` — founder editor/dashboard entry
- `src/app/invitations/login/page.tsx` — owner login page
- `src/app/invitations/page.tsx` — protected owner event list
- `src/app/invitations/manage/[eventId]/page.tsx` — protected owner editor/dashboard entry
- `src/components/invitations/EventEditor.tsx` — shared five-section editor
- `src/components/invitations/ResponsesDashboard.tsx` — aggregates, filters, row details, and CSV action
- `src/app/api/invitations/admin/events/route.ts` — founder create/list API
- `src/app/api/invitations/events/[eventId]/route.ts` — authorized read/update API
- `src/app/api/invitations/events/[eventId]/status/route.ts` — publish/close/expire/offline transitions
- `src/app/api/invitations/events/[eventId]/responses/route.ts` — owner/founder response list and manual updates
- `src/app/api/invitations/events/[eventId]/responses.csv/route.ts` — protected CSV export

### Public experience, RSVP, media, and messaging

- `src/app/invite/[slug]/page.tsx` — public server page and metadata
- `src/components/invitations/PublicInvitation.tsx` — themed invitation renderer
- `src/components/invitations/RsvpForm.tsx` — guest create/update form
- `src/components/invitations/PasscodeGate.tsx` — shared-passcode form
- `src/lib/invitations/calendar.ts` — Google Calendar and ICS values for events
- `src/lib/invitations/media.ts` — upload constraints and signed media URLs
- `src/app/api/invitations/events/[eventId]/media/route.ts` — authorized upload/delete API
- `src/app/api/cron/invitation-media-cleanup/route.ts` — removes unreferenced invitation objects older than 24 hours
- `src/app/api/invitations/rsvp/route.ts` — rate-limited public create/update endpoint
- `src/lib/invitations/notifications.ts` — capped, idempotent Resend/Twilio dispatch
- `src/app/api/invitations/admin/notifications/[notificationId]/retry/route.ts` — founder retry API

### Existing files changed

- `src/middleware.ts` — protect `/admin/invitations` on the root domain
- `src/lib/admin-navigation.ts` — add founder navigation entry
- `messages/en.json` and `messages/es.json` — invitation interface strings
- `package.json` and lockfile — add the media-duration parser used on publish
- `.env.example` — document that invitation email/SMS reuse existing provider variables

---

### Task 1: Database foundation and lifecycle rules

**Files:**
- Create: `supabase/migrations/036_invitation_events_foundation.sql`
- Create: `src/lib/invitations/types.ts`
- Create: `src/lib/invitations/state.ts`
- Test: `src/lib/invitations/state.test.ts`

**Interfaces:**
- Produces: `InvitationEventStatus`, `EffectiveEventState`, `InvitationEvent`, `InvitationRsvp`, `getEffectiveEventState(event, now)`, and `canAcceptRsvp(state)`
- Consumes: no invitation-domain interfaces

- [ ] **Step 1: Write failing lifecycle tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { canAcceptRsvp, getEffectiveEventState } from "./state";

const base = {
  status: "published" as const,
  rsvpDeadline: null,
  expireAt: null,
};

test("deadline closes RSVPs while leaving the invitation visible", () => {
  const state = getEffectiveEventState(
    { ...base, rsvpDeadline: "2026-09-10T00:00:00Z" },
    new Date("2026-09-11T00:00:00Z"),
  );
  assert.equal(state, "rsvp_closed");
  assert.equal(canAcceptRsvp(state), false);
});

test("expire_at takes precedence over a published status", () => {
  assert.equal(
    getEffectiveEventState(
      { ...base, expireAt: "2026-09-10T00:00:00Z" },
      new Date("2026-09-11T00:00:00Z"),
    ),
    "expired",
  );
});

test("offline stays offline regardless of timestamps", () => {
  assert.equal(
    getEffectiveEventState({ ...base, status: "offline" }, new Date()),
    "offline",
  );
});
```

- [ ] **Step 2: Run the focused test and verify the missing-module failure**

Run: `npx tsx --test src/lib/invitations/state.test.ts`

Expected: FAIL because `src/lib/invitations/state.ts` does not exist.

- [ ] **Step 3: Add domain types and minimal lifecycle implementation**

```ts
export type InvitationEventStatus =
  | "draft"
  | "published"
  | "rsvp_closed"
  | "expired"
  | "offline";

export type EffectiveEventState = InvitationEventStatus;

export interface EventStateInput {
  status: InvitationEventStatus;
  rsvpDeadline: string | null;
  expireAt: string | null;
}

export function getEffectiveEventState(
  event: EventStateInput,
  now: Date,
): EffectiveEventState {
  if (event.status === "offline" || event.status === "draft") return event.status;
  if (event.status === "expired") return "expired";
  if (event.expireAt && Date.parse(event.expireAt) <= now.getTime()) return "expired";
  if (event.status === "rsvp_closed") return "rsvp_closed";
  if (event.rsvpDeadline && Date.parse(event.rsvpDeadline) <= now.getTime()) return "rsvp_closed";
  return "published";
}

export function canAcceptRsvp(state: EffectiveEventState): boolean {
  return state === "published";
}
```

Define row and API types in `types.ts` with camelCase application properties matching every spec field. Include `InvitationOwner`, `InvitationEvent`, `InvitationMedia`, `InvitationRsvp`, `InvitationNotification`, `RsvpInput`, `RsvpMutationResult`, and `RsvpSummary`.

- [ ] **Step 4: Create the foundation migration**

Create the five tables from the spec with check constraints for event status, locale, media kind, positive capacity/limits, RSVP party size, notification audience/channel/kind/status, and at-least-one guest contact. Add unique indexes on `lower(invitation_owners.email)` and `invitation_events.slug`, plus indexes on owner/event foreign keys and recent RSVPs.

Use this storage and access policy shape:

```sql
insert into storage.buckets (id, name, public, file_size_limit)
values ('invitation-media', 'invitation-media', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

alter table invitation_owners enable row level security;
alter table invitation_events enable row level security;
alter table invitation_media enable row level security;
alter table invitation_rsvps enable row level security;
alter table invitation_notifications enable row level security;

-- No anon/authenticated policies: all invitation access goes through server routes.
revoke all on invitation_owners, invitation_events, invitation_media,
  invitation_rsvps, invitation_notifications from anon, authenticated;
```

Use `on delete cascade` from events to media, RSVPs, and notifications, and `on delete restrict` from events to owners. Store `additional_guest_names` as `text[] not null default '{}'` and add `check ((attending and party_size >= 1) or (not attending and party_size = 0))`.

- [ ] **Step 5: Run tests and compile**

Run: `npx tsx --test src/lib/invitations/state.test.ts`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: exit 0.

- [ ] **Step 6: Commit the foundation**

```bash
git add supabase/migrations/036_invitation_events_foundation.sql src/lib/invitations
git commit -m "feat: add invitation event foundation"
```

---

### Task 2: Validation, owner authentication, and authorization

**Files:**
- Create: `src/lib/invitations/validation.ts`
- Create: `src/lib/invitations/auth.ts`
- Create: `src/lib/invitations/access.ts`
- Create: `src/app/api/invitations/auth/login/route.ts`
- Create: `src/app/api/invitations/auth/logout/route.ts`
- Create: `src/app/invitations/login/page.tsx`
- Test: `src/lib/invitations/validation.test.ts`
- Test: `src/lib/invitations/auth.test.ts`
- Modify: `messages/en.json`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `InvitationOwner`, `InvitationEvent`, and event input types from Task 1
- Produces: `normalizeInvitationEmail`, `normalizeInvitationPhone`, `parseRsvpInput`, `signOwnerSession`, `verifyOwnerSession`, `hashEditToken`, `verifyEditToken`, `setOwnerSessionCookie`, `clearOwnerSessionCookie`, and `requireInvitationAccess`

- [ ] **Step 1: Write failing validation and session tests**

```ts
test("an RSVP requires name and one normalized contact", () => {
  assert.deepEqual(
    parseRsvpInput({ primaryName: " Ana ", email: "ANA@EXAMPLE.COM", attending: true, partySize: 2 }),
    { ok: true, value: { primaryName: "Ana", email: "ana@example.com", phone: null, attending: true, partySize: 2, additionalGuestNames: [], dietaryOrAccessibilityNotes: null, message: null } },
  );
  assert.equal(parseRsvpInput({ primaryName: "Ana", attending: true, partySize: 1 }).ok, false);
});

test("declines normalize party size to zero", () => {
  const parsed = parseRsvpInput({ primaryName: "Ana", phone: "9175551212", attending: false, partySize: 4 });
  assert.equal(parsed.ok && parsed.value.partySize, 0);
});

test("owner sessions reject tampering and expiry", () => {
  const token = signOwnerSession({ ownerId: "11111111-1111-4111-8111-111111111111", expiresAt: 2_000 }, "x".repeat(32));
  assert.equal(verifyOwnerSession(token, "x".repeat(32), 1_999)?.ownerId, "11111111-1111-4111-8111-111111111111");
  assert.equal(verifyOwnerSession(`${token}x`, "x".repeat(32), 1_999), null);
  assert.equal(verifyOwnerSession(token, "x".repeat(32), 2_001), null);
});
```

- [ ] **Step 2: Verify both tests fail before implementation**

Run: `npx tsx --test src/lib/invitations/validation.test.ts src/lib/invitations/auth.test.ts`

Expected: FAIL with missing imports.

- [ ] **Step 3: Implement normalization and signed credentials**

Use `toE164` from `src/lib/sms.ts` for phone normalization and `hashPin`/`verifyPin` from `src/lib/admin-auth.ts` for PINs. Use HMAC-SHA256 with `SESSION_COOKIE_SECRET` for the separate `invitation_owner_session` cookie. Use random 32-byte base64url tokens for guest edits, store only SHA-256 hashes, and compare hashes with `timingSafeEqual`.

```ts
export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

export function normalizeInvitationEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function createEditToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: createHash("sha256").update(token).digest("hex") };
}
```

- [ ] **Step 4: Implement login/logout routes and localized login page**

The login route accepts `{email,pin}`, rate-limits both hashed IP+email and email-wide failure buckets, selects an active owner by normalized email, verifies the PIN, and sets the HTTP-only cookie for 30 days. Return the same `401` body for unknown email and wrong PIN. Logout clears only the invitation-owner cookie.

Add `invitations.login.*`, `invitations.common.*`, and validation keys to both message files. Render the login page through `NextIntlClientProvider` using `?lang=es` or English by default.

- [ ] **Step 5: Implement event access resolution**

```ts
export type InvitationAccess =
  | { kind: "founder" }
  | { kind: "owner"; ownerId: string };

export async function requireInvitationAccess(
  request: NextRequest,
  eventId: string,
): Promise<InvitationAccess | null> {
  if (request.cookies.get("admin_session")?.value === process.env.ADMIN_PASSWORD) {
    return { kind: "founder" };
  }
  const session = readOwnerSession(request);
  if (!session) return null;
  const ownsEvent = await invitationOwnerOwnsEvent(session.ownerId, eventId);
  return ownsEvent ? { kind: "owner", ownerId: session.ownerId } : null;
}
```

- [ ] **Step 6: Run focused tests and typecheck**

Run: `npx tsx --test src/lib/invitations/validation.test.ts src/lib/invitations/auth.test.ts`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: exit 0.

- [ ] **Step 7: Commit authentication**

```bash
git add src/lib/invitations src/app/api/invitations/auth src/app/invitations/login messages/en.json messages/es.json
git commit -m "feat: add invitation owner authentication"
```

---

### Task 3: Founder provisioning and event repository

**Files:**
- Create: `src/lib/invitations/repository.ts`
- Create: `src/lib/invitations/repository.test.ts`
- Create: `src/app/api/invitations/admin/events/route.ts`
- Create: `src/app/(admin)/admin/invitations/page.tsx`
- Create: `src/app/(admin)/admin/invitations/new/page.tsx`
- Create: `src/app/(admin)/admin/invitations/[eventId]/page.tsx`
- Create: `src/components/invitations/FounderEventForm.tsx`
- Modify: `src/middleware.ts`
- Modify: `src/lib/admin-navigation.ts`

**Interfaces:**
- Consumes: invitation domain types, PIN hashing, and founder cookie
- Produces: `InvitationRepository`, `createInvitationOwnerAndEvent`, `listFounderEvents`, `getInvitationEventForManagement`, and founder event screens

- [ ] **Step 1: Write a failing repository service test with an injected data adapter**

```ts
test("provisioning normalizes email, hashes the PIN, and applies founder limits", async () => {
  const inserted: unknown[] = [];
  const result = await createInvitationOwnerAndEvent(
    { ownerName: "Mia", ownerEmail: " MIA@EXAMPLE.COM ", ownerPhone: null, title: "Mia & Lee", eventType: "wedding", locale: "en" },
    {
      hashPin: async () => "hashed-pin",
      generatePin: () => "123456",
      generateSlug: () => "mia-lee-x7k2p9",
      insert: async (rows) => { inserted.push(rows); return { ownerId: "owner-1", eventId: "event-1" }; },
    },
  );
  assert.equal(result.pin, "123456");
  assert.match(JSON.stringify(inserted), /"submission_limit":250/);
  assert.match(JSON.stringify(inserted), /mia@example.com/);
});
```

- [ ] **Step 2: Run the repository test and confirm failure**

Run: `npx tsx --test src/lib/invitations/repository.test.ts`

Expected: FAIL because the provisioning service is missing.

- [ ] **Step 3: Implement the server-only repository and provisioning transaction**

Mark the module with `import "server-only"`. Create owners/events through a Postgres RPC so partial owner creation cannot survive event failure. Generate a six-digit PIN and a slug composed of a normalized title prefix plus six random base36 characters. Return the plaintext PIN exactly once to the founder response.

The list query returns title, owner name/email, start time, status, total attending, total declined parties, and notification-warning count. The management query returns the complete event but never returns `pin_hash` or `passcode_hash`.

- [ ] **Step 4: Add founder API and screens**

The API accepts only founder-authenticated same-origin requests. The creation form requires owner name/email, event title/type, locale, start date/time, and timezone; phone is optional. After success, display the generated PIN in a copyable one-time panel and link to the event editor.

The founder list provides New Invitation, Edit, Preview, Copy Link, and status badges. The detail page mounts the shared editor introduced in Task 4; until then, render a typed event summary so this task compiles independently.

- [ ] **Step 5: Protect and expose the founder route**

Add `/admin/invitations` to the middleware founder-route allowlist before root-domain passthrough. Add an Invitations entry to `src/lib/admin-navigation.ts` without changing existing navigation semantics.

- [ ] **Step 6: Run tests, typecheck, and build the route**

Run: `npx tsx --test src/lib/invitations/repository.test.ts src/lib/admin-navigation.test.ts`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: exit 0.

- [ ] **Step 7: Commit founder provisioning**

```bash
git add src/lib/invitations src/app/api/invitations/admin 'src/app/(admin)/admin/invitations' src/components/invitations/FounderEventForm.tsx src/middleware.ts src/lib/admin-navigation.ts
git commit -m "feat: add founder invitation provisioning"
```

---

### Task 4: Shared event editor and owner management routes

**Files:**
- Create: `src/components/invitations/EventEditor.tsx`
- Create: `src/components/invitations/EventEditor.render.test.tsx`
- Create: `src/app/api/invitations/events/[eventId]/route.ts`
- Create: `src/app/api/invitations/events/[eventId]/status/route.ts`
- Create: `src/app/invitations/page.tsx`
- Create: `src/app/invitations/manage/[eventId]/page.tsx`
- Modify: `src/app/(admin)/admin/invitations/[eventId]/page.tsx`
- Modify: `src/lib/invitations/validation.ts`
- Modify: `messages/en.json`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `requireInvitationAccess`, repository management methods, lifecycle types, and localized messages
- Produces: `EventEditor`, `parseEventUpdate`, protected owner pages, and status mutation API

- [ ] **Step 1: Write failing event-update and render tests**

```ts
test("owners cannot change founder-controlled limits", () => {
  const parsed = parseEventUpdate({ submissionLimit: 900, title: "Updated" }, "owner");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.ok && "submissionLimit" in parsed.value, false);
});

test("SMS requires a normalized notification phone", () => {
  const parsed = parseEventUpdate({ ownerSmsNotifications: true, notificationPhone: "bad" }, "founder");
  assert.equal(parsed.ok, false);
});
```

Render `EventEditor` with English messages and assert that Event, Design, RSVP settings, Preview & share, and Responses controls are present and labeled.

- [ ] **Step 2: Run tests to establish the failure**

Run: `npx tsx --test src/lib/invitations/validation.test.ts src/components/invitations/EventEditor.render.test.tsx`

Expected: FAIL because event update parsing and editor do not exist.

- [ ] **Step 3: Implement event update validation and status transitions**

Allow owners to change content, theme, locale, capacity, deadline, passcode, public-count setting, notification destinations/toggles, and expiry. Allow only founders to change submission/email/SMS limits and credentials. Validate `rsvpDeadline <= startsAt < expireAt` when those values exist. Hash a new passcode server-side; preserve the current hash when the passcode field is absent; clear it only through an explicit `removePasscode: true` input.

Status endpoints accept only these commands: `publish`, `close`, `reopen`, `expire`, `offline`, and `draft`. Publish validation returns a field-error map and requires title, honorees, start time, timezone, venue, address, notification email, valid media, and a future date unless the founder passes `allowPastEvent: true`.

- [ ] **Step 4: Build the five-section editor**

Use explicit Save buttons with dirty-state indication; do not rely on autosave. Provide structured controls for event details, one of three curated theme keys, locale, colors, two curated font pairs, RSVP settings, preview/share, and response placeholder. Cost limit fields render only for founder mode. All owner-facing strings come from next-intl.

- [ ] **Step 5: Build protected owner pages and shared founder page**

The owner list reads owner ID only from the verified cookie. If one event exists, redirect directly to `/invitations/manage/[eventId]`; otherwise render cards. Both founder and owner detail pages pass the same normalized `EditorEvent` object into `EventEditor`, with `mode: "founder" | "owner"` controlling privileged fields.

- [ ] **Step 6: Run focused tests and typecheck**

Run: `npx tsx --test src/lib/invitations/validation.test.ts src/components/invitations/EventEditor.render.test.tsx`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: exit 0.

- [ ] **Step 7: Commit the editor**

```bash
git add src/components/invitations/EventEditor.tsx src/components/invitations/EventEditor.render.test.tsx src/lib/invitations/validation.ts src/app/api/invitations/events src/app/invitations 'src/app/(admin)/admin/invitations/[eventId]/page.tsx' messages/en.json messages/es.json
git commit -m "feat: add invitation event editor"
```

---

### Task 5: Private media upload and validation

**Files:**
- Create: `src/lib/invitations/media.ts`
- Create: `src/lib/invitations/media.test.ts`
- Create: `src/app/api/invitations/events/[eventId]/media/route.ts`
- Create: `src/app/api/cron/invitation-media-cleanup/route.ts`
- Modify: `src/components/invitations/EventEditor.tsx`
- Modify: `package.json`
- Modify: package lockfile

**Interfaces:**
- Consumes: `requireInvitationAccess`, invitation storage paths, and event repository
- Produces: `validateInvitationMedia`, `getSignedInvitationMedia`, and authenticated POST/DELETE media operations

- [ ] **Step 1: Install the duration parser and write failing media tests**

Run: `npm install music-metadata`

```ts
test("accepts configured image formats and rejects oversize files", async () => {
  assert.equal((await validateInvitationMedia(fakeFile("image/webp", 10 * 1024 * 1024), "cover", deps)).ok, true);
  assert.equal((await validateInvitationMedia(fakeFile("image/jpeg", 10 * 1024 * 1024 + 1), "cover", deps)).ok, false);
});

test("rejects video longer than sixty seconds", async () => {
  const result = await validateInvitationMedia(fakeFile("video/mp4", 1024), "video", { readDurationSeconds: async () => 60.01 });
  assert.deepEqual(result, { ok: false, code: "video_too_long" });
});

test("only old unreferenced objects are cleanup candidates", () => {
  assert.equal(isInvitationMediaOrphan({ createdAt: "2026-09-10T00:00:00Z", referenced: false }, new Date("2026-09-12T00:00:00Z")), true);
  assert.equal(isInvitationMediaOrphan({ createdAt: "2026-09-11T12:01:00Z", referenced: false }, new Date("2026-09-12T00:00:00Z")), false);
  assert.equal(isInvitationMediaOrphan({ createdAt: "2026-09-10T00:00:00Z", referenced: true }, new Date("2026-09-12T00:00:00Z")), false);
});
```

- [ ] **Step 2: Verify the media tests fail**

Run: `npx tsx --test src/lib/invitations/media.test.ts`

Expected: FAIL because media validation is missing.

- [ ] **Step 3: Implement validation and signed URL helpers**

Accept only exact MIME/extension pairs for JPEG, PNG, WebP, MP4, and WebM. Enforce 10 MB images, 50 MB video, one designed invite, one cover, one video, and 12 gallery rows. Read duration with `music-metadata` on the server and reject missing/unreadable duration. Generate paths as `{eventId}/{kind}/{randomUUID()}.{extension}` and signed read URLs with a 15-minute expiry.

- [ ] **Step 4: Implement authorized upload/delete endpoint**

Authorize before reading the multipart body. Upload the object, insert/update the media reference, then delete the replaced object. If database finalization fails, delete the newly uploaded object. DELETE verifies that the requested record/path belongs to the authorized event before deleting the row and object.

- [ ] **Step 5: Connect media controls to the editor**

Show preview, upload progress, validation errors, Replace, and Remove. Require alt text for gallery images. Disable further gallery upload at 12. Display the 60-second/50-MB video constraint before selection.

- [ ] **Step 6: Add orphan cleanup**

Implement `isInvitationMediaOrphan` with a strict 24-hour age threshold. Add a `GET` cron route protected by `CRON_SECRET` that lists invitation-bucket objects, compares paths to all live event/media references, deletes only unreferenced objects older than 24 hours, and returns `{ scanned, deleted, failed }`. Never delete a referenced object even when it is old.

- [ ] **Step 7: Run tests and typecheck**

Run: `npx tsx --test src/lib/invitations/media.test.ts`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: exit 0.

- [ ] **Step 8: Commit media support**

```bash
git add package.json package-lock.json src/lib/invitations/media.ts src/lib/invitations/media.test.ts src/app/api/invitations/events src/app/api/cron/invitation-media-cleanup src/components/invitations/EventEditor.tsx
git commit -m "feat: add invitation media management"
```

---

### Task 6: Public invitation, passcode, localization, and calendar links

**Files:**
- Create: `src/app/invite/[slug]/page.tsx`
- Create: `src/components/invitations/PublicInvitation.tsx`
- Create: `src/components/invitations/PublicInvitation.render.test.tsx`
- Create: `src/components/invitations/PasscodeGate.tsx`
- Create: `src/lib/invitations/calendar.ts`
- Create: `src/lib/invitations/calendar.test.ts`
- Create: `src/app/api/invitations/passcode/route.ts`
- Modify: `messages/en.json`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: effective event state, repository public projection, signed media URLs, and passcode-session functions
- Produces: public invitation renderer, passcode gate, `googleEventCalendarUrl`, and `eventIcsContents`

- [ ] **Step 1: Write failing public privacy and calendar tests**

Render a published event and assert title, address, maps link, RSVP call to action, and attending aggregate. Render the same event as expired and assert that title, address, and media URLs are absent. Render public counts disabled and assert no attending/declined totals appear.

```ts
test("calendar URL carries event timezone-safe values", () => {
  const url = googleEventCalendarUrl({ title: "Mia & Lee", startsAt: "2026-10-10T18:00:00-04:00", endsAt: "2026-10-10T23:00:00-04:00", location: "The Garden", description: "Celebrate with us" });
  assert.match(url, /calendar\/render/);
  assert.match(decodeURIComponent(url), /Mia & Lee/);
});
```

- [ ] **Step 2: Verify public tests fail**

Run: `npx tsx --test src/components/invitations/PublicInvitation.render.test.tsx src/lib/invitations/calendar.test.ts`

Expected: FAIL with missing modules.

- [ ] **Step 3: Implement the public projection and route state handling**

Query by exact slug on the server. Return `notFound()` for unknown/offline events; render a generic unavailable view for draft; render a detail-free ended view for expired. For passcode events without a valid event-scoped cookie, render only `PasscodeGate` and do not generate signed media URLs.

The passcode route rate-limits event+hashed-IP attempts, verifies the hash, and sets `invitation_passcode_{eventId}` as a signed HTTP-only cookie expiring in 12 hours or at event expiry, whichever comes first.

- [ ] **Step 4: Implement themes and localized public content**

Build three curated themes (`classic`, `romantic`, `celebration`) through a typed theme map. Render designed-invite image first when present, then structured details, gallery/video, map and calendar actions, aggregate counts, and the RSVP section. Use one `NextIntlClientProvider` selected by `event.locale`; do not translate authored content.

- [ ] **Step 5: Add metadata and calendar outputs**

Generate title/description metadata only for published, passcode-free events. Passcode-protected, expired, draft, and offline pages use `robots: { index: false, follow: false }` and reveal no address in metadata. Build a Google Calendar link and downloadable data-URI ICS content with escaped title, description, location, start, end, and UID.

- [ ] **Step 6: Run tests, typecheck, and visually inspect at 375 px**

Run: `npx tsx --test src/components/invitations/PublicInvitation.render.test.tsx src/lib/invitations/calendar.test.ts`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: exit 0.

Run: `npm run dev`

Expected: a seeded published event displays without horizontal overflow at 375 px; passcode/expired/offline variants hide protected content.

- [ ] **Step 7: Commit public invitation rendering**

```bash
git add src/app/invite src/components/invitations/PublicInvitation.tsx src/components/invitations/PublicInvitation.render.test.tsx src/components/invitations/PasscodeGate.tsx src/lib/invitations/calendar.ts src/lib/invitations/calendar.test.ts src/app/api/invitations/passcode messages/en.json messages/es.json
git commit -m "feat: render public invitation pages"
```

---

### Task 7: Atomic RSVP create and update flow

**Files:**
- Create: `supabase/migrations/037_submit_invitation_rsvp.sql`
- Create: `src/lib/invitations/rsvp.ts`
- Create: `src/lib/invitations/rsvp.test.ts`
- Create: `src/app/api/invitations/rsvp/route.ts`
- Create: `src/components/invitations/RsvpForm.tsx`
- Create: `src/components/invitations/RsvpForm.render.test.tsx`
- Modify: `src/components/invitations/PublicInvitation.tsx`
- Modify: `messages/en.json`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `parseRsvpInput`, event state, passcode session, edit-token functions, and `RsvpMutationResult`
- Produces: Postgres `submit_invitation_rsvp`, `submitRsvp`, public POST endpoint, and `RsvpForm`

- [ ] **Step 1: Write failing RSVP policy tests**

```ts
test("an increase consumes only the additional seats", () => {
  assert.deepEqual(capacityDelta({ oldAttending: true, oldPartySize: 2, attending: true, partySize: 4 }), 2);
});

test("a decline frees the previous party", () => {
  assert.deepEqual(capacityDelta({ oldAttending: true, oldPartySize: 3, attending: false, partySize: 0 }), -3);
});

test("closed events allow token-authenticated edits but not creates", () => {
  assert.equal(canMutateRsvp("rsvp_closed", "create"), false);
  assert.equal(canMutateRsvp("rsvp_closed", "update"), true);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npx tsx --test src/lib/invitations/rsvp.test.ts`

Expected: FAIL because RSVP policies do not exist.

- [ ] **Step 3: Implement pure RSVP policies**

Implement `capacityDelta`, `canMutateRsvp`, contact fingerprinting, and mapping of RPC error codes to stable API codes: `event_unavailable`, `rsvp_closed`, `capacity_reached`, `submission_limit_reached`, `duplicate_contact`, `invalid_edit_token`, and `rate_limited`.

- [ ] **Step 4: Add the atomic Postgres function**

`submit_invitation_rsvp` receives event ID, normalized RSVP fields, edit-token hash, and optional existing RSVP ID. It locks the event row `for update`, calculates effective deadline/expiry, counts created RSVP records against `submission_limit`, verifies existing token for updates, checks duplicate normalized email/phone for creates, calculates current attending total excluding the edited row, rejects over-capacity changes, and inserts/updates exactly one row. It returns RSVP ID, whether it was created/updated, attending total, declined-party total, and remaining capacity.

Grant execute only to `service_role`. Add SQL-level exception codes prefixed `INVITE_` so the server adapter can map failures without string-matching provider messages.

- [ ] **Step 5: Implement rate-limited API and guest edit behavior**

Require the event slug, optional RSVP ID/edit token, and form input. Validate the passcode cookie before mutation. Use `checkRateLimit` with a bucket composed of event ID and hashed IP, 20 attempts per 10 minutes. On create, generate/store an edit-token hash and return the plaintext token once. On update, hash the supplied token and pass it to the RPC. Do not call notification providers in this task; return the committed mutation to the dispatcher interface introduced in Task 8.

- [ ] **Step 6: Implement the localized RSVP form**

Fields are primary name, attending/declining, total people including the primary guest, additional guest names, email, phone, dietary/accessibility notes, and message. Require email or phone. Hide party-size/additional-name inputs for declines. Persist the returned edit URL in browser storage under the event slug and render Copy edit link after success.

- [ ] **Step 7: Verify concurrency in local Supabase and run TypeScript tests**

Run two parallel SQL calls for the final available seat and assert exactly one succeeds and total attending never exceeds capacity. Repeat with two updates increasing party size. Record the SQL invocation and expected `INVITE_CAPACITY_REACHED` result in the migration comments.

Run: `npx tsx --test src/lib/invitations/rsvp.test.ts src/components/invitations/RsvpForm.render.test.tsx`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: exit 0.

- [ ] **Step 8: Commit RSVP flow**

```bash
git add supabase/migrations/037_submit_invitation_rsvp.sql src/lib/invitations/rsvp.ts src/lib/invitations/rsvp.test.ts src/app/api/invitations/rsvp src/components/invitations/RsvpForm.tsx src/components/invitations/RsvpForm.render.test.tsx src/components/invitations/PublicInvitation.tsx messages/en.json messages/es.json
git commit -m "feat: add atomic invitation RSVPs"
```

---

### Task 8: Capped email/SMS notification delivery

**Files:**
- Create: `src/lib/invitations/notifications.ts`
- Create: `src/lib/invitations/notifications.test.ts`
- Create: `src/app/api/invitations/admin/notifications/[notificationId]/retry/route.ts`
- Modify: `src/app/api/invitations/rsvp/route.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: committed `RsvpMutationResult`, event notification settings, Resend credentials, Twilio client, and notification repository methods
- Produces: `dispatchRsvpNotifications`, `retryInvitationNotification`, and provider-neutral `NotificationSender`

- [ ] **Step 1: Write failing dispatcher tests with fake providers**

```ts
test("RSVP remains successful when owner email fails", async () => {
  const stored: string[] = [];
  const result = await dispatchRsvpNotifications(fixture, {
    reserve: async (channel) => ({ id: `n-${channel}`, allowed: true }),
    markSent: async () => undefined,
    markFailed: async (id) => { stored.push(id); },
    email: { send: async () => ({ ok: false, error: "provider unavailable" }) },
    sms: { send: async () => ({ ok: true, providerId: "SM1" }) },
  });
  assert.equal(result.rsvpId, fixture.rsvp.id);
  assert.deepEqual(stored, ["n-email"]);
});

test("a reached SMS limit records suppression without calling Twilio", async () => {
  let calls = 0;
  const result = await dispatchRsvpNotifications(smsFixture, {
    reserve: async () => ({ id: "n-sms", allowed: false }),
    markSent: async () => undefined,
    markFailed: async () => undefined,
    email: { send: async () => ({ ok: true, providerId: "e1" }) },
    sms: { send: async () => { calls += 1; return { ok: true, providerId: "SM1" }; } },
  });
  assert.equal(calls, 0);
  assert.deepEqual(result.suppressedChannels, ["sms"]);
});
```

- [ ] **Step 2: Run the notification tests and confirm failure**

Run: `npx tsx --test src/lib/invitations/notifications.test.ts`

Expected: FAIL because the dispatcher is missing.

- [ ] **Step 3: Implement atomic notification reservation**

Before contacting a provider, insert a `pending` record only if channel attempts for the event are below the channel limit. Count pending, sent, and failed records; suppressed records do not consume additional capacity because they represent rejected reservations. Use a transaction/advisory lock per event+channel so concurrent RSVPs cannot exceed the limit. Insert a `suppressed` row when reservation fails.

- [ ] **Step 4: Implement Resend and Twilio adapters**

Owner email is on by default and contains event title, new/updated/declined label, primary name, contact, party size, notes/message, and protected dashboard link. Optional SMS contains event title, response type, primary name, party size, and dashboard link within a compact body. Escape all authored fields in email HTML. Send guest confirmation email with the private edit link only when enabled and an email exists. Do not send guest SMS.

Use notification-record IDs as provider idempotency keys where supported. Mark sent with provider ID or failed with a sanitized reason. Return the committed RSVP result regardless of provider outcome.

- [ ] **Step 5: Connect post-commit delivery and founder retry**

After the RSVP RPC succeeds, invoke the dispatcher and respond with RSVP confirmation plus non-sensitive `notificationsDelayed: boolean`. The founder retry route accepts only failed notification IDs, reuses the same record/idempotency key, respects the current limit, and changes status through pending to sent/failed.

- [ ] **Step 6: Document reused environment variables**

Add invitation comments beside `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_FROM_ADDRESS`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `SESSION_COOKIE_SECRET`, `IP_HASH_PEPPER`, `CRON_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`. Add no duplicate invitation-only secret.

- [ ] **Step 7: Run tests and typecheck**

Run: `npx tsx --test src/lib/invitations/notifications.test.ts`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: exit 0.

- [ ] **Step 8: Commit notifications**

```bash
git add src/lib/invitations/notifications.ts src/lib/invitations/notifications.test.ts src/app/api/invitations/rsvp/route.ts src/app/api/invitations/admin/notifications .env.example
git commit -m "feat: add capped invitation notifications"
```

---

### Task 9: Response dashboard, CSV, and operational states

**Files:**
- Create: `src/components/invitations/ResponsesDashboard.tsx`
- Create: `src/components/invitations/ResponsesDashboard.render.test.tsx`
- Create: `src/lib/invitations/csv.ts`
- Create: `src/lib/invitations/csv.test.ts`
- Create: `src/app/api/invitations/events/[eventId]/responses/route.ts`
- Create: `src/app/api/invitations/events/[eventId]/responses.csv/route.ts`
- Modify: `src/components/invitations/EventEditor.tsx`
- Modify: `src/lib/invitations/repository.ts`
- Modify: `messages/en.json`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: invitation access, RSVP rows/summary, notification rows, and lifecycle status API
- Produces: response list/update endpoints, escaped `responsesToCsv`, and full Responses editor section

- [ ] **Step 1: Write failing CSV and dashboard privacy tests**

```ts
test("CSV neutralizes spreadsheet formulas and quotes commas", () => {
  const csv = responsesToCsv([{ ...row, primaryName: "=1+1", message: "Thanks, see you" }]);
  assert.match(csv, /'\=1\+1/);
  assert.match(csv, /"Thanks, see you"/);
});
```

Render the dashboard with attending, declined, remaining capacity, one failed notification, and private contacts. Assert private contacts render in owner mode. Render the public aggregate component with the same fixture and assert no name/email/phone appears.

- [ ] **Step 2: Run tests and confirm failure**

Run: `npx tsx --test src/lib/invitations/csv.test.ts src/components/invitations/ResponsesDashboard.render.test.tsx`

Expected: FAIL because dashboard and CSV helpers are missing.

- [ ] **Step 3: Implement protected response queries and manual edits**

List endpoint supports `status=all|attending|declined`, a trimmed search term, and stable newest/oldest/name sorting. Return totals calculated across the whole event, not the filtered page. Manual owner/founder edits call the same atomic RSVP function with an administrative credential mode, skip owner notifications, and add an audit message to server logs without full contact values.

- [ ] **Step 4: Implement dashboard and CSV export**

Show attending people, attending parties, declined parties, remaining capacity, total submissions, and notification warning count. Provide filters, search, expandable details, Edit response, and CSV export. CSV columns are response status, primary name, email, phone, party size, additional guests, dietary/accessibility notes, message, created time, and updated time. Prefix cells beginning with `=`, `+`, `-`, or `@` with an apostrophe before RFC 4180 quoting.

- [ ] **Step 5: Add lifecycle and cost warnings**

Display deadline reached, capacity reached, email limit reached, SMS limit reached, failed delivery, expired, and offline notices with direct founder/owner actions permitted by role. Ensure Close RSVPs leaves invitation details visible; Expire renders the ended page; Offline produces 404 behavior.

- [ ] **Step 6: Run tests and typecheck**

Run: `npx tsx --test src/lib/invitations/csv.test.ts src/components/invitations/ResponsesDashboard.render.test.tsx`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: exit 0.

- [ ] **Step 7: Commit dashboard and operations**

```bash
git add src/components/invitations/ResponsesDashboard.tsx src/components/invitations/ResponsesDashboard.render.test.tsx src/components/invitations/EventEditor.tsx src/lib/invitations/csv.ts src/lib/invitations/csv.test.ts src/lib/invitations/repository.ts src/app/api/invitations/events messages/en.json messages/es.json
git commit -m "feat: add invitation response dashboard"
```

---

### Task 10: End-to-end verification and pilot runbook

**Files:**
- Create: `tests/invitations/invitation-flow.spec.ts`
- Create: `docs/invitations-pilot-runbook.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: complete founder, owner, public, RSVP, media, notification, and lifecycle flows
- Produces: automated critical-path coverage and founder operating instructions

- [ ] **Step 1: Write the failing Playwright critical-path test**

```ts
test("founder provisions, owner edits, and guest RSVPs without exceeding capacity", async ({ page }) => {
  await founderLogin(page);
  const { publicUrl, ownerEmail, ownerPin } = await provisionInvitation(page, { capacity: 2, locale: "en" });
  await ownerLogin(page, ownerEmail, ownerPin);
  await publishInvitation(page);
  await page.goto(publicUrl);
  await submitRsvp(page, { name: "Ana", email: "ana@example.com", partySize: 2 });
  await expect(page.getByText("Your RSVP is confirmed")).toBeVisible();
  await page.goto(publicUrl);
  await submitRsvp(page, { name: "Luis", email: "luis@example.com", partySize: 1 });
  await expect(page.getByText("This event has reached its guest capacity")).toBeVisible();
});
```

Add separate tests for Spanish system copy, passcode gating, decline/update, notification suppression with saved RSVP, deadline closure, expired page privacy, offline 404, owner cross-event denial, and founder access.

- [ ] **Step 2: Run the critical path and confirm the first failure**

Run: `npx playwright test tests/invitations/invitation-flow.spec.ts --project=chromium`

Expected: FAIL until fixtures/helpers are wired to the local Supabase test data.

- [ ] **Step 3: Add deterministic test fixtures and complete the E2E suite**

Seed a founder session, two owners, one English event, and one Spanish passcode event through test-only setup that is unavailable when `NODE_ENV === "production"`. Stub Resend and Twilio at the invitation service interfaces and assert calls/status records. Set the guest viewport to `{ width: 375, height: 812 }` and assert no horizontal scrolling.

- [ ] **Step 4: Write the pilot runbook**

Document migration application, environment preflight, event provisioning, PIN handoff, media limits, publishing, copying the share link, changing notification destinations, raising founder limits, retrying a failed notification, CSV export, closing/reopening RSVPs, expiring/offlining an event, and extraction boundaries. Include a rollback procedure that sets an event offline before any code rollback.

- [ ] **Step 5: Run the full verification matrix**

Run: `npx tsx --test $(rg --files src -g '*.test.ts' -g '*.test.tsx')`

Expected: all tests PASS.

Run: `npx playwright test tests/invitations/invitation-flow.spec.ts --project=chromium`

Expected: all invitation E2E tests PASS.

Run: `npx tsc --noEmit`

Expected: exit 0.

Run: `npm run build`

Expected: production build completes with no type, route, or prerender errors.

- [ ] **Step 6: Perform a manual mobile and desktop acceptance pass**

At 375 px, verify passcode, designed-invite image, gallery, video, map/calendar actions, RSVP create/edit/decline, full-capacity message, confirmation, and Spanish copy. At desktop width, verify founder provisioning, owner editor, public preview, response filters/details, notification warnings/retry, CSV export, and every lifecycle action.

- [ ] **Step 7: Commit verification and runbook**

```bash
git add tests/invitations/invitation-flow.spec.ts docs/invitations-pilot-runbook.md README.md
git commit -m "test: verify invitation events MVP"
```
