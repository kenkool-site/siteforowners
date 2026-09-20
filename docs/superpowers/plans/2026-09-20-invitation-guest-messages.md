# Invitation Guest Messages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an invitation owner or founder compose a message and send it, via one channel at a time, to every guest who RSVP'd and left the matching contact method.

**Architecture:** Extend the existing capped-notification infrastructure (`invitation_notifications`, `reserve_invitation_notification`) rather than building a parallel system: a new `invitation_broadcasts` table holds the composed message and roll-up counts, a new `celebrant_broadcast` notification `kind` lets each recipient's send reuse the exact same atomic per-event cap, provider adapters, and status tracking already built for RSVP notifications. A new domain module (`broadcasts.ts`) owns recipient computation and the compose/send flow; a new API route and a new composer UI expose it.

**Tech Stack:** Next.js 14 App Router, TypeScript (strict), Supabase (Postgres + service-role client), Resend, Twilio, next-intl.

**Spec:** `docs/superpowers/specs/2026-09-20-invitation-guest-messages-design.md`

## Global Constraints

- Keep all guest and owner data server-side; never expose `SUPABASE_SERVICE_ROLE_KEY` to client components.
- All authenticated mutation routes enforce a same-origin check (`isSameOrigin`) before reading or changing data.
- Access to any event's data (owner-of-event or founder) goes through `requireInvitationAccess` — never a client-supplied owner ID.
- Broadcast sends share the same per-event, per-channel notification cap as RSVP notifications (`email_notification_limit` / `sms_notification_limit` on `invitation_events`); the SMS default and existing rows currently at the old default move from 50 to 100 as part of this plan.
- One channel (email or sms) per broadcast — no dual-channel single send, no manual recipient picking, no scheduling, no draft-saving.
- All UI chrome and starter templates are bilingual via `messages/en.json` / `messages/es.json`; whatever the celebrant actually types is never machine-translated.
- TypeScript strict; no `any`.
- Design mobile-first, test at 375px.
- Follow this feature's established convention of zero dedicated `route.test.ts` files — API route logic is covered by testing the domain functions it calls, plus UI interaction tests that exercise the route through a mocked `fetch`.

---

## File map

- `supabase/migrations/055_invitation_broadcast_messages.sql` — new table, widened notification kind/broadcast_id, RPC signature change, SMS cap bump
- `src/lib/invitations/broadcast-migration-contract.test.ts` — static SQL-text contract tests for the new migration
- `src/lib/invitations/types.ts` — widened `InvitationNotificationKind`/`InvitationNotification`, new `InvitationBroadcast`
- `src/lib/invitations/notifications.ts` — export two existing private helpers, widen the reservation input type, fix the retry kind-guard
- `src/lib/invitations/notifications.test.ts` — new tests covering the two notifications.ts changes
- `src/lib/invitations/broadcasts.ts` — recipient computation, compose validation, pure dispatch, wired dispatch, repository CRUD
- `src/lib/invitations/broadcasts.test.ts` — unit tests for everything in `broadcasts.ts`
- `src/app/api/invitations/events/[eventId]/messages/route.ts` — GET (recipient preview + history), POST (send)
- `src/components/invitations/GuestMessageComposer.tsx` — the compose UI
- `src/components/invitations/GuestMessageComposer.render.test.tsx`, `.interaction.test.tsx`
- `src/app/invitations/manage/[eventId]/message/page.tsx` — owner entry page
- `src/app/(admin)/admin/invitations/[eventId]/message/page.tsx` — founder entry page
- `src/components/invitations/OwnerGuestDashboard.tsx` (+ its render test) — new "Message guests" card
- `src/components/invitations/EventEditor.tsx` — new header link (mirrors the existing guestbook link)
- `messages/en.json`, `messages/es.json` — new strings

---

### Task 1: Database and notification-primitive foundations

**Files:**
- Create: `supabase/migrations/055_invitation_broadcast_messages.sql`
- Create: `src/lib/invitations/broadcast-migration-contract.test.ts`
- Modify: `src/lib/invitations/types.ts:14-17` (widen `InvitationNotificationKind`), `types.ts:112-125` (add `broadcastId` to `InvitationNotification`, add `InvitationBroadcast`)
- Modify: `src/lib/invitations/notifications.ts:86-90` (export `sanitizeFailureReason`), `notifications.ts:105-107` (export `sendPayload`), `notifications.ts:255-261` (widen `ReserveNotificationInput`), `notifications.ts:464-480` (`reserveInvitationNotification` passes `p_broadcast_id`), `notifications.ts:708-719` (retry kind-guard accepts `celebrant_broadcast`)
- Modify: `src/lib/invitations/notifications.test.ts` (add coverage for the two runtime behavior changes above)

**Interfaces:**
- Produces: `InvitationBroadcast` type; widened `InvitationNotificationKind` (adds `"celebrant_broadcast"`); widened `ReserveNotificationInput` (adds optional `broadcastId?: string`); exported `sendPayload(payload: NotificationPayload, dependencies: { email: EmailSender; sms: SmsSender }): Promise<NotificationSendResult>`; exported `sanitizeFailureReason(error: unknown): string`; exported `saveInvitationNotificationPayload(id: string, payload: NotificationPayload): Promise<void>`.
- Consumes: nothing new — this task only widens existing exports.

There are two non-obvious correctness issues in the current code this task must fix, found by reading the actual RPCs and their TypeScript callers (not assumed from the design doc):

1. **`reserve_invitation_notification`'s inline validation hardcodes the three old kind literals.** Simply widening the table's `kind` CHECK constraint is not enough — the RPC itself has `p_kind NOT IN ('rsvp_created', 'rsvp_updated', 'guest_confirmation')` and raises `INVITE_NOTIFICATION_INVALID_INPUT` for anything else. This must be widened too, in the same migration.
2. **PostgreSQL cannot `CREATE OR REPLACE` a function whose parameter list changes** (adding `p_broadcast_id`) — it silently creates a *second overloaded function* instead of replacing the first, which breaks Supabase's named-parameter RPC dispatch. The migration must `DROP FUNCTION IF EXISTS public.reserve_invitation_notification(uuid, uuid, text, text, text, text);` (the exact old 6-parameter signature) before creating the new 7-parameter version.
3. **The retry path's TypeScript-side kind validation will reject broadcast notifications even after the DB changes.** `reserveInvitationNotificationRetry` in `notifications.ts` (around line 716) has `(row.kind !== "rsvp_created" && row.kind !== "rsvp_updated" && row.kind !== "guest_confirmation")` — throws for any other kind. This throw happens *before* `processInvitationNotificationRetry`'s try/catch, so retrying a broadcast notification would currently strand it. This must accept `"celebrant_broadcast"` too.

- [ ] **Step 1: Write the failing migration-contract tests**

Create `src/lib/invitations/broadcast-migration-contract.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rawMigration = readFileSync(
  new URL("../../../supabase/migrations/055_invitation_broadcast_messages.sql", import.meta.url),
  "utf8",
);
const migration = rawMigration.replace(/--[^\n]*/g, "").replace(/\s+/g, " ");

test("invitation_broadcasts requires a subject only for email broadcasts", () => {
  assert.match(migration, /CREATE TABLE public\.invitation_broadcasts/);
  assert.match(migration, /channel text NOT NULL CHECK \(channel IN \('email', 'sms'\)\)/);
  assert.match(migration, /CHECK \(channel <> 'email' OR NULLIF\(btrim\(subject\), ''\) IS NOT NULL\)/);
});

test("invitation_broadcasts is service-role-only like every other invitation table", () => {
  assert.match(migration, /ALTER TABLE public\.invitation_broadcasts ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON public\.invitation_broadcasts FROM anon, authenticated/);
});

test("invitation_notifications gains a nullable broadcast_id and a widened kind check", () => {
  assert.match(migration, /ALTER TABLE public\.invitation_notifications\s*ADD COLUMN broadcast_id uuid REFERENCES public\.invitation_broadcasts\(id\) ON DELETE CASCADE/);
  assert.match(migration, /DROP CONSTRAINT IF EXISTS invitation_notifications_kind_check/);
  assert.match(migration, /CHECK \(kind IN \('rsvp_created', 'rsvp_updated', 'guest_confirmation', 'celebrant_broadcast'\)\)/);
});

test("sms_notification_limit default rises to 100 and existing rows at the old default are backfilled", () => {
  assert.match(migration, /ALTER COLUMN sms_notification_limit SET DEFAULT 100/);
  assert.match(migration, /UPDATE public\.invitation_events\s*SET sms_notification_limit = 100\s*WHERE sms_notification_limit = 50/);
});

test("reserve_invitation_notification's old 6-parameter overload is dropped before the widened version is created, avoiding a duplicate overload", () => {
  const dropIndex = migration.indexOf("DROP FUNCTION IF EXISTS public.reserve_invitation_notification(uuid, uuid, text, text, text, text)");
  const createIndex = migration.indexOf("CREATE FUNCTION public.reserve_invitation_notification");
  assert.ok(dropIndex >= 0, "expected the old 6-parameter overload to be explicitly dropped");
  assert.ok(createIndex > dropIndex, "expected the widened function to be created after the drop");
});

test("the widened reservation function accepts an optional broadcast_id and validates the new kind", () => {
  assert.match(migration, /p_broadcast_id uuid DEFAULT NULL/);
  assert.match(migration, /p_kind NOT IN \('rsvp_created', 'rsvp_updated', 'guest_confirmation', 'celebrant_broadcast'\)/);
  assert.match(migration, /INSERT INTO public\.invitation_notifications \(\s*event_id, rsvp_id, audience, channel, recipient, kind, status, broadcast_id\s*\)/);
});

test("the widened reservation function is re-secured for service_role only under its new signature", () => {
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.reserve_invitation_notification\(uuid, uuid, text, text, text, text, uuid\) FROM PUBLIC/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.reserve_invitation_notification\(uuid, uuid, text, text, text, text, uuid\) FROM anon, authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.reserve_invitation_notification\(uuid, uuid, text, text, text, text, uuid\) TO service_role/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test src/lib/invitations/broadcast-migration-contract.test.ts`
Expected: FAIL — `ENOENT` (the migration file does not exist yet).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/055_invitation_broadcast_messages.sql`:

```sql
CREATE TABLE public.invitation_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.invitation_events(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email', 'sms')),
  subject text,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 5000),
  sent_by text NOT NULL CHECK (sent_by IN ('owner', 'founder')),
  recipient_count integer NOT NULL DEFAULT 0 CHECK (recipient_count >= 0),
  sent_count integer NOT NULL DEFAULT 0 CHECK (sent_count >= 0),
  failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  suppressed_count integer NOT NULL DEFAULT 0 CHECK (suppressed_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (channel <> 'email' OR NULLIF(btrim(subject), '') IS NOT NULL)
);

CREATE INDEX invitation_broadcasts_event_created_idx
  ON public.invitation_broadcasts (event_id, created_at DESC);

ALTER TABLE public.invitation_broadcasts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invitation_broadcasts FROM anon, authenticated;

ALTER TABLE public.invitation_notifications
  ADD COLUMN broadcast_id uuid REFERENCES public.invitation_broadcasts(id) ON DELETE CASCADE;

CREATE INDEX invitation_notifications_broadcast_id_idx
  ON public.invitation_notifications (broadcast_id)
  WHERE broadcast_id IS NOT NULL;

ALTER TABLE public.invitation_notifications
  DROP CONSTRAINT IF EXISTS invitation_notifications_kind_check;
ALTER TABLE public.invitation_notifications
  ADD CONSTRAINT invitation_notifications_kind_check
  CHECK (kind IN ('rsvp_created', 'rsvp_updated', 'guest_confirmation', 'celebrant_broadcast'));

ALTER TABLE public.invitation_events
  ALTER COLUMN sms_notification_limit SET DEFAULT 100;

-- There is no way to distinguish "still on the original default" from "a
-- founder deliberately chose 50"; this bumps both, per the approved design.
UPDATE public.invitation_events
  SET sms_notification_limit = 100
  WHERE sms_notification_limit = 50;

-- PostgreSQL cannot CREATE OR REPLACE a function whose parameter list
-- changes shape (it creates a second overload instead, which breaks
-- Supabase's named-parameter RPC dispatch) — the old 6-parameter version
-- must be dropped explicitly before the widened one is created.
DROP FUNCTION IF EXISTS public.reserve_invitation_notification(uuid, uuid, text, text, text, text);

CREATE FUNCTION public.reserve_invitation_notification(
  p_event_id uuid,
  p_rsvp_id uuid,
  p_audience text,
  p_channel text,
  p_recipient text,
  p_kind text,
  p_broadcast_id uuid DEFAULT NULL
)
RETURNS TABLE (
  notification_id uuid,
  allowed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event public.invitation_events%ROWTYPE;
  v_limit integer;
  v_count integer;
  v_id uuid;
BEGIN
  IF p_audience NOT IN ('owner', 'guest')
    OR p_channel NOT IN ('email', 'sms')
    OR p_kind NOT IN ('rsvp_created', 'rsvp_updated', 'guest_confirmation', 'celebrant_broadcast')
    OR NULLIF(pg_catalog.btrim(p_recipient), '') IS NULL
  THEN
    RAISE EXCEPTION USING MESSAGE = 'INVITE_NOTIFICATION_INVALID_INPUT';
  END IF;

  SELECT event.*
  INTO v_event
  FROM public.invitation_events AS event
  WHERE event.id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = 'INVITE_EVENT_UNAVAILABLE';
  END IF;

  v_limit := CASE
    WHEN p_channel = 'email' THEN v_event.email_notification_limit
    ELSE v_event.sms_notification_limit
  END;

  SELECT pg_catalog.count(*)::integer
  INTO v_count
  FROM public.invitation_notifications AS notification
  WHERE notification.event_id = p_event_id
    AND notification.channel = p_channel
    AND notification.status IN ('pending', 'sent', 'failed');

  IF v_count >= v_limit THEN
    INSERT INTO public.invitation_notifications (
      event_id, rsvp_id, audience, channel, recipient, kind, status, broadcast_id
    ) VALUES (
      p_event_id, p_rsvp_id, p_audience, p_channel, p_recipient, p_kind, 'suppressed', p_broadcast_id
    )
    RETURNING id INTO v_id;

    RETURN QUERY SELECT v_id, false;
    RETURN;
  END IF;

  INSERT INTO public.invitation_notifications (
    event_id, rsvp_id, audience, channel, recipient, kind, status, broadcast_id
  ) VALUES (
    p_event_id, p_rsvp_id, p_audience, p_channel, p_recipient, p_kind, 'pending', p_broadcast_id
  )
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, true;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_invitation_notification(uuid, uuid, text, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_invitation_notification(uuid, uuid, text, text, text, text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_invitation_notification(uuid, uuid, text, text, text, text, uuid) TO service_role;

-- Concurrency smoke: broadcast reservation shares the RSVP cap
-- 1. Seed a published event whose email_notification_limit is 2 and has 3 RSVPs with distinct emails.
-- 2. Call reserve_invitation_notification three times with audience='guest', kind='celebrant_broadcast',
--    a fresh broadcast_id, and each RSVP's id/email.
-- 3. Exactly two calls return allowed=true; the third returns allowed=false (a 'suppressed' row).
-- 4. Verify: select status, count(*) from invitation_notifications where broadcast_id = '<id>' group by status;
--    expect two of ('pending' or 'sent'/'failed' once the app layer runs) and one 'suppressed'.
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test src/lib/invitations/broadcast-migration-contract.test.ts`
Expected: PASS, 7/7.

- [ ] **Step 5: Widen the domain types**

In `src/lib/invitations/types.ts`, change:

```ts
export type InvitationNotificationKind =
  | "rsvp_created"
  | "rsvp_updated"
  | "guest_confirmation";
```

to:

```ts
export type InvitationNotificationKind =
  | "rsvp_created"
  | "rsvp_updated"
  | "guest_confirmation"
  | "celebrant_broadcast";
```

Add `broadcastId: string | null;` to the end of the `InvitationNotification` interface (after `failureReason`). Add a new interface after `InvitationNotification`:

```ts
export interface InvitationBroadcast {
  id: string;
  eventId: string;
  channel: InvitationNotificationChannel;
  subject: string | null;
  body: string;
  sentBy: "owner" | "founder";
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  suppressedCount: number;
  createdAt: string;
}
```

- [ ] **Step 6: Write the failing tests for the two `notifications.ts` runtime fixes**

`reserveInvitationNotificationRetry` is a private function that calls Supabase directly. This test file's existing convention is to never mock `createAdminClient()` — it only unit-tests the *pure*, dependency-injected functions (see how every existing `processInvitationNotificationRetry` test injects a fake `reserveRetry` rather than exercising the real Supabase-backed wrapper). Two tests, at the two layers that convention implies:

1. A behavioral test proving `processInvitationNotificationRetry` (the pure function) already handles a `celebrant_broadcast` kind correctly once `InvitationNotificationKind` is widened (Step 5) — driven with a fake `reserveRetry`.
2. A narrow regression guard on the specific literal-list line this task changes inside the real wrapper, since that line can't be exercised without a live database: export `reserveInvitationNotificationRetry` (for testability only — nothing outside this file calls it) and assert its source mentions the new kind. This mirrors this codebase's own established convention of asserting exact literal lists via text matching where no live-infrastructure test is feasible (see every test in `broadcast-migration-contract.test.ts` and `notifications-migration-contract.test.ts`).

Add to `src/lib/invitations/notifications.test.ts` (near the existing `processInvitationNotificationRetry` tests around line 494 — read that section first to match its fixture style and imports):

```ts
test("processInvitationNotificationRetry succeeds for a celebrant_broadcast kind", async () => {
  const calls: string[] = [];
  const result = await processInvitationNotificationRetry(
    { notificationId: "notif-1", origin: "https://example.test" },
    {
      reserveRetry: async () => ({
        allowed: true,
        eventId: "event-1", eventTitle: "Mercy & John", eventSlug: "mercy-and-john", eventLocale: "en",
        rsvpId: "rsvp-1", audience: "guest", channel: "email",
        recipient: "guest@example.test", kind: "celebrant_broadcast",
      }),
      loadPayload: async () => ({
        channel: "email",
        input: { from: "hello@example.test", to: "guest@example.test", subject: "Thank you!", html: "<p>Thanks!</p>", idempotencyKey: "notif-1" },
      }),
      markSent: async () => { calls.push("sent"); },
      markFailed: async () => { calls.push("failed"); },
      email: { send: async () => ({ ok: true, providerId: "resend-1" }) },
      sms: { send: async () => ({ ok: true, providerId: "sms-1" }) },
    },
  );
  assert.deepEqual(result, { ok: true, status: "sent" });
  assert.deepEqual(calls, ["sent"]);
});

test("reserveInvitationNotificationRetry's kind guard accepts celebrant_broadcast, not just the three RSVP kinds", async () => {
  const { reserveInvitationNotificationRetry } = await import("./notifications");
  assert.match(reserveInvitationNotificationRetry.toString(), /celebrant_broadcast/);
});
```

Run: `npx tsx --test src/lib/invitations/notifications.test.ts`
Expected: FAIL — the first test already passes (it only needed Step 5's type widening), but the second fails because `reserveInvitationNotificationRetry` is not exported yet and its guard doesn't mention `celebrant_broadcast` yet.

- [ ] **Step 7: Export the two helpers `broadcasts.ts` will need**

In `notifications.ts`, add `export` to:
- `function sanitizeFailureReason(error: unknown): string { ... }` (around line 86)
- `async function sendPayload(payload: NotificationPayload, dependencies: { email: EmailSender; sms: SmsSender }): Promise<NotificationSendResult> { ... }` (around line 105)
- `async function saveInvitationNotificationPayload(id: string, payload: NotificationPayload): Promise<void> { ... }` (around line 735) — Task 2's broadcast dispatch reuses this so a failed broadcast send can go through the existing founder "Retry delivery" button with no new retry code, exactly like RSVP notifications already do.
- `async function reserveInvitationNotificationRetry(notificationId: string): Promise<RetryReservation> { ... }` (around line 697 — exported only so Step 6's regression test can import it; nothing else needs to call it externally)

- [ ] **Step 8: Widen `ReserveNotificationInput`, thread `broadcastId` through `reserveInvitationNotification`, and fix the retry kind-guard**

In `notifications.ts`, change:

```ts
export type ReserveNotificationInput = {
  eventId: string;
  rsvpId: string;
  audience: InvitationNotificationAudience;
  recipient: string;
  kind: InvitationNotificationKind;
};
```

to:

```ts
export type ReserveNotificationInput = {
  eventId: string;
  rsvpId: string;
  audience: InvitationNotificationAudience;
  recipient: string;
  kind: InvitationNotificationKind;
  broadcastId?: string;
};
```

In `reserveInvitationNotification`, add `p_broadcast_id: input.broadcastId ?? null` to the `.rpc(...)` call's argument object.

In `reserveInvitationNotificationRetry`, change the guard:

```ts
    || (row.kind !== "rsvp_created" && row.kind !== "rsvp_updated" && row.kind !== "guest_confirmation")
```

to:

```ts
    || (row.kind !== "rsvp_created" && row.kind !== "rsvp_updated" && row.kind !== "guest_confirmation" && row.kind !== "celebrant_broadcast")
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx tsx --test src/lib/invitations/notifications.test.ts src/lib/invitations/broadcast-migration-contract.test.ts`
Expected: PASS, all tests including the two new ones.

- [ ] **Step 10: Run the full suite and typecheck**

Run: `npx tsx --test $(find src -name "*.test.ts" -o -name "*.test.tsx" | sort)`
Expected: PASS, 0 failures (this must include every pre-existing test — the widened `InvitationNotificationKind` and `ReserveNotificationInput` are additive, so nothing existing should break).

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 11: Commit**

```bash
git add supabase/migrations/055_invitation_broadcast_messages.sql \
  src/lib/invitations/broadcast-migration-contract.test.ts \
  src/lib/invitations/types.ts \
  src/lib/invitations/notifications.ts \
  src/lib/invitations/notifications.test.ts
git commit -m "feat: extend notification primitives for celebrant broadcasts"
```

---

### Task 2: Broadcast domain module

**Files:**
- Create: `src/lib/invitations/broadcasts.ts`
- Test: `src/lib/invitations/broadcasts.test.ts`

**Interfaces:**
- Consumes: `InvitationBroadcast`, `InvitationNotificationChannel` (`types.ts`); `InvitationResponseRow`, `listInvitationResponseRows(eventId)` (`responses.ts`/`repository.ts`); `sendPayload`, `sanitizeFailureReason`, `saveInvitationNotificationPayload`, `reserveInvitationNotification`, `markInvitationNotificationSent`, `markInvitationNotificationFailed`, `resendEmailSender`, `twilioSmsSender`, `NotificationDispatchDependencies`, `NotificationPayload` (`notifications.ts`, all already exported or exported by Task 1); `escapeHtml` (`@/lib/marketing-lead`); `createAdminClient` (`@/lib/supabase/admin`).
- Produces: `eligibleBroadcastRecipients`, `parseComposeBroadcastInput`, `dispatchBroadcastNotifications` (pure), `createInvitationBroadcast`, `dispatchInvitationBroadcast` (wired), `listInvitationBroadcasts` — exact signatures below, used by Task 3's route.

- [ ] **Step 1: Write the failing tests for recipient computation and input parsing**

Create `src/lib/invitations/broadcasts.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  eligibleBroadcastRecipients,
  parseComposeBroadcastInput,
} from "./broadcasts";
import type { InvitationResponseRow } from "./responses";

function row(overrides: Partial<InvitationResponseRow>): InvitationResponseRow {
  return {
    id: "rsvp-1", event_id: "event-1", primary_name: "Wunmi Adeniji",
    email: null, phone: null, attending: true, party_size: 1,
    additional_guest_names: [], dietary_or_accessibility_notes: null, message: null,
    created_at: "2026-09-13T12:00:00.000Z", updated_at: "2026-09-13T12:00:00.000Z",
    ...overrides,
  };
}

test("email recipients are every RSVP with an email, regardless of attending status", () => {
  const rows = [
    row({ id: "r1", email: "a@example.test" }),
    row({ id: "r2", email: null, phone: "+15551234567" }),
    row({ id: "r3", email: "b@example.test", attending: false, party_size: 0 }),
  ];
  const recipients = eligibleBroadcastRecipients(rows, "email");
  assert.deepEqual(recipients.map((r) => r.rsvpId), ["r1", "r3"]);
  assert.equal(recipients[0]?.contact, "a@example.test");
});

test("sms recipients are every RSVP with a phone, regardless of attending status", () => {
  const rows = [
    row({ id: "r1", phone: "+15551234567" }),
    row({ id: "r2", phone: null, email: "a@example.test" }),
  ];
  const recipients = eligibleBroadcastRecipients(rows, "sms");
  assert.deepEqual(recipients.map((r) => r.rsvpId), ["r1"]);
});

test("compose input requires a non-empty body", () => {
  const result = parseComposeBroadcastInput({ channel: "email", subject: "Hi", body: "  " });
  assert.deepEqual(result, { ok: false, code: "body_required" });
});

test("compose input requires a subject for email but not for sms", () => {
  assert.deepEqual(
    parseComposeBroadcastInput({ channel: "email", subject: "  ", body: "Thanks!" }),
    { ok: false, code: "subject_required" },
  );
  const smsResult = parseComposeBroadcastInput({ channel: "sms", subject: "", body: "Thanks!" });
  assert.equal(smsResult.ok, true);
  if (smsResult.ok) assert.equal(smsResult.value.subject, null);
});

test("compose input rejects an unrecognized channel", () => {
  assert.deepEqual(
    parseComposeBroadcastInput({ channel: "fax", body: "Thanks!" }),
    { ok: false, code: "invalid_channel" },
  );
});

test("compose input rejects a body over 5000 characters", () => {
  const result = parseComposeBroadcastInput({ channel: "sms", body: "x".repeat(5001) });
  assert.deepEqual(result, { ok: false, code: "body_too_long" });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx tsx --test src/lib/invitations/broadcasts.test.ts`
Expected: FAIL — `Cannot find module './broadcasts'`.

- [ ] **Step 3: Implement recipient computation and input parsing**

Create `src/lib/invitations/broadcasts.ts`:

```ts
import { escapeHtml } from "@/lib/marketing-lead";
import { createAdminClient } from "@/lib/supabase/admin";
import { listInvitationResponseRows, type InvitationResponseRow } from "./responses";
import {
  markInvitationNotificationFailed,
  markInvitationNotificationSent,
  reserveInvitationNotification,
  resendEmailSender,
  sanitizeFailureReason,
  saveInvitationNotificationPayload,
  sendPayload,
  twilioSmsSender,
  type NotificationDispatchDependencies,
  type NotificationPayload,
} from "./notifications";
import type { InvitationBroadcast, InvitationNotificationChannel } from "./types";

export type BroadcastRecipient = {
  rsvpId: string;
  primaryName: string;
  contact: string;
};

export function eligibleBroadcastRecipients(
  rows: InvitationResponseRow[],
  channel: InvitationNotificationChannel,
): BroadcastRecipient[] {
  return rows.flatMap((row) => {
    const contact = channel === "email" ? row.email : row.phone;
    return contact ? [{ rsvpId: row.id, primaryName: row.primary_name, contact }] : [];
  });
}

export type ComposeBroadcastInput = {
  channel: InvitationNotificationChannel;
  subject: string | null;
  body: string;
};

export type ComposeBroadcastErrorCode =
  | "invalid_channel"
  | "subject_required"
  | "body_required"
  | "body_too_long";

export type ParseComposeBroadcastResult =
  | { ok: true; value: ComposeBroadcastInput }
  | { ok: false; code: ComposeBroadcastErrorCode };

const MAX_BROADCAST_BODY_LENGTH = 5000;

export function parseComposeBroadcastInput(value: unknown): ParseComposeBroadcastResult {
  if (!value || typeof value !== "object") return { ok: false, code: "body_required" };
  const input = value as Record<string, unknown>;
  const channel = input.channel;
  if (channel !== "email" && channel !== "sms") return { ok: false, code: "invalid_channel" };
  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (!body) return { ok: false, code: "body_required" };
  if (body.length > MAX_BROADCAST_BODY_LENGTH) return { ok: false, code: "body_too_long" };
  const subject = typeof input.subject === "string" ? input.subject.trim() : "";
  if (channel === "email" && !subject) return { ok: false, code: "subject_required" };
  return { ok: true, value: { channel, subject: channel === "email" ? subject : null, body } };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx tsx --test src/lib/invitations/broadcasts.test.ts`
Expected: PASS, 6/6.

- [ ] **Step 5: Write the failing tests for the pure dispatch function**

Append to `broadcasts.test.ts`:

```ts
import { dispatchBroadcastNotifications } from "./broadcasts";

test("a recipient whose email provider call fails is counted as failed, not thrown", async () => {
  const marked: string[] = [];
  const result = await dispatchBroadcastNotifications(
    {
      eventId: "event-1", broadcastId: "broadcast-1", channel: "email",
      subject: "Thank you!", body: "We loved having you.", from: "hello@example.test",
      recipients: [{ rsvpId: "r1", primaryName: "Wunmi", contact: "wunmi@example.test" }],
    },
    {
      reserve: async () => ({ id: "n1", allowed: true }),
      savePayload: async () => undefined,
      markSent: async () => { marked.push("sent"); },
      markFailed: async () => { marked.push("failed"); },
      email: { send: async () => ({ ok: false, error: "provider unavailable" }) },
      sms: { send: async () => ({ ok: true, providerId: "sms-1" }) },
    },
  );
  assert.deepEqual(result, { sentCount: 0, failedCount: 1, suppressedCount: 0 });
  assert.deepEqual(marked, ["failed"]);
});

test("a recipient blocked by the shared cap is counted as suppressed and never calls the provider", async () => {
  let calls = 0;
  const result = await dispatchBroadcastNotifications(
    {
      eventId: "event-1", broadcastId: "broadcast-1", channel: "sms",
      subject: null, body: "See you soon!", from: "+15550001111",
      recipients: [{ rsvpId: "r1", primaryName: "Wunmi", contact: "+15551234567" }],
    },
    {
      reserve: async () => ({ id: "n1", allowed: false }),
      savePayload: async () => undefined,
      markSent: async () => undefined,
      markFailed: async () => undefined,
      email: { send: async () => ({ ok: true, providerId: "e1" }) },
      sms: { send: async () => { calls += 1; return { ok: true, providerId: "sms-1" }; } },
    },
  );
  assert.deepEqual(result, { sentCount: 0, failedCount: 0, suppressedCount: 1 });
  assert.equal(calls, 0);
});

test("every recipient's reservation carries the broadcast id, audience guest, and kind celebrant_broadcast", async () => {
  const seen: unknown[] = [];
  await dispatchBroadcastNotifications(
    {
      eventId: "event-1", broadcastId: "broadcast-9", channel: "email",
      subject: "Update", body: "Details changed.", from: "hello@example.test",
      recipients: [{ rsvpId: "r1", primaryName: "Wunmi", contact: "wunmi@example.test" }],
    },
    {
      reserve: async (channel, input) => { seen.push({ channel, input }); return { id: "n1", allowed: true }; },
      savePayload: async () => undefined,
      markSent: async () => undefined,
      markFailed: async () => undefined,
      email: { send: async () => ({ ok: true, providerId: "e1" }) },
      sms: { send: async () => ({ ok: true, providerId: "sms-1" }) },
    },
  );
  assert.deepEqual(seen, [{
    channel: "email",
    input: { eventId: "event-1", rsvpId: "r1", audience: "guest", recipient: "wunmi@example.test", kind: "celebrant_broadcast", broadcastId: "broadcast-9" },
  }]);
});

test("a hundred recipients all get processed even though they're batched", async () => {
  const recipients = Array.from({ length: 100 }, (_, i) => ({ rsvpId: `r${i}`, primaryName: `Guest ${i}`, contact: `guest${i}@example.test` }));
  let sendCalls = 0;
  const result = await dispatchBroadcastNotifications(
    { eventId: "event-1", broadcastId: "broadcast-1", channel: "email", subject: "Hi", body: "Hi all", from: "hello@example.test", recipients },
    {
      reserve: async () => ({ id: `n-${sendCalls}`, allowed: true }),
      savePayload: async () => undefined,
      markSent: async () => undefined,
      markFailed: async () => undefined,
      email: { send: async () => { sendCalls += 1; return { ok: true, providerId: `e${sendCalls}` }; } },
      sms: { send: async () => ({ ok: true, providerId: "sms-1" }) },
    },
  );
  assert.equal(result.sentCount, 100);
  assert.equal(sendCalls, 100);
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npx tsx --test src/lib/invitations/broadcasts.test.ts`
Expected: FAIL — `dispatchBroadcastNotifications` is not exported.

- [ ] **Step 7: Implement the pure dispatch function**

Append to `broadcasts.ts`:

```ts
function renderBroadcastEmailHtml(body: string): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 16px;white-space:pre-line;">${escapeHtml(paragraph)}</p>`)
    .join("");
  return `<div style="font-family:sans-serif;font-size:15px;color:#2B2231;line-height:1.6;">${paragraphs}</div>`;
}

export type DispatchBroadcastNotificationsInput = {
  eventId: string;
  broadcastId: string;
  channel: InvitationNotificationChannel;
  subject: string | null;
  body: string;
  from: string;
  recipients: BroadcastRecipient[];
};

export type DispatchBroadcastNotificationsResult = {
  sentCount: number;
  failedCount: number;
  suppressedCount: number;
};

const BROADCAST_BATCH_SIZE = 8;

export async function dispatchBroadcastNotifications(
  input: DispatchBroadcastNotificationsInput,
  dependencies: NotificationDispatchDependencies,
): Promise<DispatchBroadcastNotificationsResult> {
  let sentCount = 0;
  let failedCount = 0;
  let suppressedCount = 0;

  async function sendToRecipient(recipient: BroadcastRecipient): Promise<void> {
    const reservation = await dependencies.reserve(input.channel, {
      eventId: input.eventId,
      rsvpId: recipient.rsvpId,
      audience: "guest",
      recipient: recipient.contact,
      kind: "celebrant_broadcast",
      broadcastId: input.broadcastId,
    });

    if (!reservation.allowed) {
      suppressedCount += 1;
      return;
    }

    const payload: NotificationPayload = input.channel === "email"
      ? {
          channel: "email",
          input: {
            from: input.from,
            to: recipient.contact,
            subject: input.subject ?? "",
            html: renderBroadcastEmailHtml(input.body),
            idempotencyKey: reservation.id,
          },
        }
      : {
          channel: "sms",
          input: {
            from: input.from,
            to: recipient.contact,
            body: input.body,
            idempotencyKey: reservation.id,
          },
        };

    try {
      await dependencies.savePayload(reservation.id, payload);
      const result = await sendPayload(payload, dependencies);
      if (result.ok) {
        sentCount += 1;
        await dependencies.markSent(reservation.id, result.providerId);
      } else {
        failedCount += 1;
        await dependencies.markFailed(reservation.id, sanitizeFailureReason(result.error));
      }
    } catch (error) {
      failedCount += 1;
      await dependencies.markFailed(reservation.id, sanitizeFailureReason(error));
    }
  }

  for (let i = 0; i < input.recipients.length; i += BROADCAST_BATCH_SIZE) {
    const batch = input.recipients.slice(i, i + BROADCAST_BATCH_SIZE);
    await Promise.all(batch.map((recipient) => sendToRecipient(recipient)));
  }

  return { sentCount, failedCount, suppressedCount };
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx tsx --test src/lib/invitations/broadcasts.test.ts`
Expected: PASS, 10/10.

- [ ] **Step 9: Write the failing tests for the wired repository + dispatch functions**

Append to `broadcasts.test.ts`:

```ts
import { createInvitationBroadcast, listInvitationBroadcasts } from "./broadcasts";

test("createInvitationBroadcast rejects an empty body before touching the database", async () => {
  await assert.rejects(
    () => createInvitationBroadcast({ eventId: "event-1", channel: "email", subject: "Hi", body: "", sentBy: "owner" }),
    /body/i,
  );
});
```

(This is intentionally the only test for the wired functions in this file — `createInvitationBroadcast`, `dispatchInvitationBroadcast`, and `listInvitationBroadcasts` call `createAdminClient()` directly, following this codebase's established convention of not mocking the Supabase client in unit tests for wired functions; their behavior is covered by the pure `dispatchBroadcastNotifications` tests above plus Task 4's composer interaction tests, which exercise the full flow through a mocked `fetch`.)

- [ ] **Step 10: Run the test to verify it fails**

Run: `npx tsx --test src/lib/invitations/broadcasts.test.ts`
Expected: FAIL — `createInvitationBroadcast` is not exported.

- [ ] **Step 11: Implement the wired repository and dispatch functions**

Append to `broadcasts.ts`:

```ts
function rowToBroadcast(row: Record<string, unknown>): InvitationBroadcast {
  return {
    id: row.id as string,
    eventId: row.event_id as string,
    channel: row.channel as InvitationNotificationChannel,
    subject: row.subject as string | null,
    body: row.body as string,
    sentBy: row.sent_by as "owner" | "founder",
    recipientCount: row.recipient_count as number,
    sentCount: row.sent_count as number,
    failedCount: row.failed_count as number,
    suppressedCount: row.suppressed_count as number,
    createdAt: row.created_at as string,
  };
}

export type CreateInvitationBroadcastInput = ComposeBroadcastInput & {
  eventId: string;
  sentBy: "owner" | "founder";
};

export async function createInvitationBroadcast(
  input: CreateInvitationBroadcastInput,
): Promise<InvitationBroadcast> {
  if (!input.body.trim()) throw new Error("Broadcast body is required");
  const { data, error } = await createAdminClient()
    .from("invitation_broadcasts")
    .insert({
      event_id: input.eventId,
      channel: input.channel,
      subject: input.subject,
      body: input.body,
      sent_by: input.sentBy,
      recipient_count: 0,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error("Unable to create invitation broadcast", { cause: error });
  return rowToBroadcast(data);
}

async function updateInvitationBroadcastCounts(
  broadcastId: string,
  counts: { recipientCount: number; sentCount: number; failedCount: number; suppressedCount: number },
): Promise<void> {
  const { error } = await createAdminClient()
    .from("invitation_broadcasts")
    .update({
      recipient_count: counts.recipientCount,
      sent_count: counts.sentCount,
      failed_count: counts.failedCount,
      suppressed_count: counts.suppressedCount,
    })
    .eq("id", broadcastId);
  if (error) throw new Error("Unable to update invitation broadcast counts", { cause: error });
}

export async function listInvitationBroadcasts(eventId: string): Promise<InvitationBroadcast[]> {
  const { data, error } = await createAdminClient()
    .from("invitation_broadcasts")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });
  if (error) throw new Error("Unable to load invitation broadcasts", { cause: error });
  return (data ?? []).map(rowToBroadcast);
}

export type SendInvitationBroadcastInput = ComposeBroadcastInput & {
  eventId: string;
  sentBy: "owner" | "founder";
  emailFrom: string;
  smsFrom: string;
};

export type SendInvitationBroadcastResult = {
  broadcast: InvitationBroadcast;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  suppressedCount: number;
};

/**
 * Real wiring: creates the broadcast row, computes recipients from live RSVP
 * data, dispatches through the real reservation/provider primitives, and
 * persists the final counts. Mirrors dispatchInvitationRsvpNotifications's
 * role for the RSVP-triggered flow.
 */
export async function dispatchInvitationBroadcast(
  input: SendInvitationBroadcastInput,
): Promise<SendInvitationBroadcastResult> {
  const broadcast = await createInvitationBroadcast(input);
  const rows = await listInvitationResponseRows(input.eventId);
  const recipients = eligibleBroadcastRecipients(rows, input.channel);

  const result = await dispatchBroadcastNotifications(
    {
      eventId: input.eventId,
      broadcastId: broadcast.id,
      channel: input.channel,
      subject: input.subject,
      body: input.body,
      from: input.channel === "email" ? input.emailFrom : input.smsFrom,
      recipients,
    },
    {
      reserve: reserveInvitationNotification,
      savePayload: saveInvitationNotificationPayload,
      markSent: markInvitationNotificationSent,
      markFailed: markInvitationNotificationFailed,
      email: resendEmailSender,
      sms: twilioSmsSender,
    },
  );

  await updateInvitationBroadcastCounts(broadcast.id, {
    recipientCount: recipients.length,
    sentCount: result.sentCount,
    failedCount: result.failedCount,
    suppressedCount: result.suppressedCount,
  });

  return {
    broadcast: {
      ...broadcast,
      recipientCount: recipients.length,
      sentCount: result.sentCount,
      failedCount: result.failedCount,
      suppressedCount: result.suppressedCount,
    },
    recipientCount: recipients.length,
    sentCount: result.sentCount,
    failedCount: result.failedCount,
    suppressedCount: result.suppressedCount,
  };
}
```

`savePayload: saveInvitationNotificationPayload` is what makes the existing founder "Retry delivery" button work on a failed broadcast notification with no new retry code — `processInvitationNotificationRetry`'s `loadPayload` step reads back exactly what was sealed here, the same mechanism RSVP notifications already rely on. Add a short comment above `dispatchInvitationBroadcast`'s definition documenting this reuse, so a future reader doesn't mistake the plain `email`/`sms` senders for the whole story:

```ts
// savePayload here is the same sealed-payload mechanism RSVP notifications
// use (see dispatchInvitationRsvpNotifications) — it's what lets the
// existing founder "Retry delivery" button and retryInvitationNotification
// work on a failed broadcast send with no new retry code.
```

Add this comment directly above `dispatchInvitationBroadcast`'s definition.

- [ ] **Step 12: Run the tests to verify they pass**

Run: `npx tsx --test src/lib/invitations/broadcasts.test.ts`
Expected: PASS, 11/11.

- [ ] **Step 13: Run the full suite and typecheck**

Run: `npx tsx --test $(find src -name "*.test.ts" -o -name "*.test.tsx" | sort)`
Expected: PASS, 0 failures.

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 14: Commit**

```bash
git add src/lib/invitations/broadcasts.ts src/lib/invitations/broadcasts.test.ts
git commit -m "feat: add invitation broadcast dispatch module"
```

---

### Task 3: API route

**Files:**
- Create: `src/app/api/invitations/events/[eventId]/messages/route.ts`

**Interfaces:**
- Consumes: `requireInvitationAccess` (`@/lib/invitations/access`), `isSameOrigin` (`@/lib/invitations/auth`), `getInvitationEventForManagement` (`@/lib/invitations/repository`), `listInvitationResponseRows` (`@/lib/invitations/repository` — re-exported per Step 11's import in `responses.ts`; verify the actual import path by checking how `responses.csv/route.ts` imports it), `parseComposeBroadcastInput`, `eligibleBroadcastRecipients`, `dispatchInvitationBroadcast`, `listInvitationBroadcasts` (`@/lib/invitations/broadcasts`).
- Produces: `GET` returns `{ broadcasts: InvitationBroadcast[], recipientCounts: { email: number; sms: number }, totalResponses: number }`; `POST` returns `{ ok: true, recipientCount, sentCount, failedCount, suppressedCount }` or `{ ok: false, code }`.

This route has no dedicated test file, per this feature's established convention (verified: zero `route.test.ts` files exist across the other 20 invitation API routes) — its logic is already covered by Task 2's tests, and Task 4's composer interaction tests exercise it through a mocked `fetch`.

- [ ] **Step 1: Check the exact import path for `listInvitationResponseRows`**

Run: `grep -n "listInvitationResponseRows" src/app/api/invitations/events/\[eventId\]/responses.csv/route.ts`

Use whatever import path that shows (it should be `@/lib/invitations/repository`, re-exporting the function documented in Task 2's interfaces — `responses.ts` defines the row type and pure helpers, `repository.ts` defines the actual Supabase-backed export).

- [ ] **Step 2: Implement the route**

Create `src/app/api/invitations/events/[eventId]/messages/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireInvitationAccess } from "@/lib/invitations/access";
import { isSameOrigin } from "@/lib/invitations/auth";
import {
  dispatchInvitationBroadcast,
  eligibleBroadcastRecipients,
  listInvitationBroadcasts,
  parseComposeBroadcastInput,
} from "@/lib/invitations/broadcasts";
import { getInvitationEventForManagement, listInvitationResponseRows } from "@/lib/invitations/repository";

async function access(request: NextRequest, eventId: string) {
  return requireInvitationAccess(request, eventId);
}

export async function GET(request: NextRequest, { params }: { params: { eventId: string } }) {
  const actor = await access(request, params.eventId);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const [broadcasts, rows] = await Promise.all([
      listInvitationBroadcasts(params.eventId),
      listInvitationResponseRows(params.eventId),
    ]);
    return NextResponse.json({
      broadcasts,
      recipientCounts: {
        email: eligibleBroadcastRecipients(rows, "email").length,
        sms: eligibleBroadcastRecipients(rows, "sms").length,
      },
      totalResponses: rows.length,
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    console.error("[invitations/messages] list failed", { eventId: params.eventId, error });
    return NextResponse.json({ error: "Messages could not be loaded" }, { status: 500 });
  }
}

const EMAIL_FROM = process.env.EMAIL_FROM || "SiteForOwners <hello@siteforowners.com>";
const TWILIO_FROM = process.env.TWILIO_FROM || "";

export async function POST(request: NextRequest, { params }: { params: { eventId: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  const actor = await access(request, params.eventId);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, code: "invalid_request" }, { status: 400 }); }

  const parsed = parseComposeBroadcastInput(body);
  if (!parsed.ok) return NextResponse.json({ ok: false, code: parsed.code }, { status: 400 });

  try {
    const event = await getInvitationEventForManagement(params.eventId);
    if (!event) return NextResponse.json({ ok: false, code: "event_unavailable" }, { status: 404 });

    const result = await dispatchInvitationBroadcast({
      eventId: params.eventId,
      channel: parsed.value.channel,
      subject: parsed.value.subject,
      body: parsed.value.body,
      sentBy: actor.kind === "founder" ? "founder" : "owner",
      emailFrom: EMAIL_FROM,
      smsFrom: TWILIO_FROM,
    });

    console.info("[invitations/messages] broadcast sent", {
      eventId: params.eventId, actor: actor.kind, channel: parsed.value.channel,
      recipientCount: result.recipientCount, sentCount: result.sentCount,
      failedCount: result.failedCount, suppressedCount: result.suppressedCount,
    });

    return NextResponse.json({
      ok: true,
      broadcast: result.broadcast,
      recipientCount: result.recipientCount,
      sentCount: result.sentCount,
      failedCount: result.failedCount,
      suppressedCount: result.suppressedCount,
    });
  } catch (error) {
    console.error("[invitations/messages] send failed", { eventId: params.eventId, actor: actor.kind, error });
    return NextResponse.json({ ok: false, code: "event_unavailable" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Run the full suite and typecheck**

Run: `npx tsx --test $(find src -name "*.test.ts" -o -name "*.test.tsx" | sort)`
Expected: PASS, 0 failures.

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/invitations/events/\[eventId\]/messages/route.ts
git commit -m "feat: add invitation guest messages API route"
```

---

### Task 4: Composer UI, entry points, and localization

**Files:**
- Create: `src/components/invitations/GuestMessageComposer.tsx`
- Test: `src/components/invitations/GuestMessageComposer.render.test.tsx`, `src/components/invitations/GuestMessageComposer.interaction.test.tsx`
- Create: `src/app/invitations/manage/[eventId]/message/page.tsx`
- Create: `src/app/(admin)/admin/invitations/[eventId]/message/page.tsx`
- Modify: `src/components/invitations/OwnerGuestDashboard.tsx:51-56` (add a "Message guests" card, mirroring the guestbook card immediately above it), `OwnerGuestDashboard.render.test.tsx`
- Modify: `src/components/invitations/EventEditor.tsx:681` (add a matching header link next to the guestbook link)
- Modify: `messages/en.json`, `messages/es.json`

**Interfaces:**
- Consumes: everything Task 3's route returns; `InvitationBroadcast`, `InvitationNotificationChannel` (`types.ts`).

- [ ] **Step 1: Add the i18n strings**

In `messages/en.json`, inside `invitations.manage.dashboard` (the object shown in full at the top of this plan's research — it currently ends with `"guestbook": {...}` then `"status": {...}`), add a new sibling object after `"guestbook"`:

```json
"message": {
  "title": "Guest messages",
  "description": "Send an update, reminder, or thank-you to everyone who RSVP'd.",
  "open": "Message guests"
}
```

In `invitations.editor.actions` (shown in full above — currently ends with `"copyLink": "Copy public link"`), add:

```json
"message": "Message guests"
```

Add a new section under `invitations.manage` as a sibling of its existing `dashboard` and `guestbook` keys (verified: `invitations.manage`'s current keys are `title, subtitle, emptyTitle, emptyBody, open, eventDatePending, loadError, dashboard, guestbook`), named `messageComposer`:

```json
"messageComposer": {
  "back": "Back to guest responses",
  "title": "Message guests",
  "subtitle": "Reach everyone who RSVP'd for {name}.",
  "channel": {
    "label": "Send by",
    "email": "Email",
    "sms": "Text message"
  },
  "templates": {
    "label": "Start from a template",
    "blank": "Start blank",
    "thankYou": { "label": "Thank you", "subject": "Thank you for celebrating with us!", "body": "Thank you so much for being part of our special day. It meant the world to have you there." },
    "reminder": { "label": "Reminder", "subject": "A quick reminder about our big day", "body": "Just a friendly reminder about our upcoming event — we can't wait to see you there!" },
    "update": { "label": "Update", "subject": "An update about our event", "body": "We wanted to let you know about a small update — please check the invitation page for the latest details." }
  },
  "fields": {
    "subject": "Subject",
    "body": "Message"
  },
  "smsCharacterCount": "{count} characters",
  "recipientPreview": "This will reach {reached} of {total} guests.",
  "recipientPreviewGap": "{missing} guests don't have a {channel} on file and won't receive this.",
  "confirm": "Send to {count} guests via {channel}?",
  "send": "Send message",
  "sending": "Sending…",
  "resultSummary": "Sent to {sent}, failed for {failed}, skipped {suppressed} due to the messaging limit.",
  "error": "The message could not be sent. Try again.",
  "history": {
    "title": "Recent messages",
    "empty": "No messages sent yet.",
    "counts": "{sent} sent · {failed} failed · {suppressed} skipped"
  }
}
```

Add the identical key structure to `messages/es.json`, with these Spanish values (mirroring `invitations.manage.dashboard.guestbook`'s existing Spanish translation style in that same file):

```json
"message": {
  "title": "Mensajes a los invitados",
  "description": "Envía una actualización, un recordatorio o un agradecimiento a quienes confirmaron asistencia.",
  "open": "Enviar mensaje"
}
```

```json
"message": "Enviar mensaje"
```

```json
"messageComposer": {
  "back": "Volver a las respuestas",
  "title": "Enviar mensaje a los invitados",
  "subtitle": "Comunícate con todos los que confirmaron para {name}.",
  "channel": {
    "label": "Enviar por",
    "email": "Correo electrónico",
    "sms": "Mensaje de texto"
  },
  "templates": {
    "label": "Comenzar con una plantilla",
    "blank": "Comenzar en blanco",
    "thankYou": { "label": "Agradecimiento", "subject": "¡Gracias por celebrar con nosotros!", "body": "Muchas gracias por ser parte de nuestro día especial. Significó mucho tenerte ahí." },
    "reminder": { "label": "Recordatorio", "subject": "Un recordatorio sobre nuestro gran día", "body": "Solo un recordatorio amistoso sobre nuestro próximo evento. ¡No podemos esperar a verte!" },
    "update": { "label": "Actualización", "subject": "Una actualización sobre nuestro evento", "body": "Queríamos contarte sobre una pequeña actualización. Revisa la página de la invitación para los últimos detalles." }
  },
  "fields": {
    "subject": "Asunto",
    "body": "Mensaje"
  },
  "smsCharacterCount": "{count} caracteres",
  "recipientPreview": "Esto llegará a {reached} de {total} invitados.",
  "recipientPreviewGap": "{missing} invitados no tienen {channel} registrado y no lo recibirán.",
  "confirm": "¿Enviar a {count} invitados por {channel}?",
  "send": "Enviar mensaje",
  "sending": "Enviando…",
  "resultSummary": "Enviado a {sent}, fallido para {failed}, omitido {suppressed} por el límite de mensajes.",
  "error": "No se pudo enviar el mensaje. Inténtalo de nuevo.",
  "history": {
    "title": "Mensajes recientes",
    "empty": "Aún no se han enviado mensajes.",
    "counts": "{sent} enviados · {failed} fallidos · {suppressed} omitidos"
  }
}
```

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/en.json', 'utf8')); JSON.parse(require('fs').readFileSync('messages/es.json', 'utf8')); console.log('valid')"`
Expected: prints `valid` for both — fix any JSON syntax error before moving on.

- [ ] **Step 2: Write the failing render test for the composer**

Create `src/components/invitations/GuestMessageComposer.render.test.tsx`:

```tsx
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../messages/en.json";
import { GuestMessageComposer } from "./GuestMessageComposer";

Object.assign(globalThis, { React });

function render(): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={enMessages} timeZone="America/New_York">
      <GuestMessageComposer
        eventId="event-1"
        eventName="Mercy & John"
        backHref="/invitations/manage/event-1"
        initialRecipientCounts={{ email: 8, sms: 5 }}
        initialTotalResponses={10}
        initialHistory={[]}
      />
    </NextIntlClientProvider>,
  );
}

test("the composer exposes a channel picker, template picker, and compose fields", () => {
  const html = render();
  for (const expected of ["Email", "Text message", "Start from a template", "Thank you", "Reminder", "Update", "Subject", "Message", "Send message"]) {
    assert.match(html, new RegExp(expected));
  }
});

test("the recipient preview reflects the initial email recipient count out of total responses", () => {
  const html = render();
  assert.match(html, /reach 8 of 10 guests/i);
});

test("an empty history shows the empty state, not a broken list", () => {
  const html = render();
  assert.match(html, /No messages sent yet/);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx tsx --test src/components/invitations/GuestMessageComposer.render.test.tsx`
Expected: FAIL — `Cannot find module './GuestMessageComposer'`.

- [ ] **Step 4: Implement the composer component**

Create `src/components/invitations/GuestMessageComposer.tsx`, following `GuestbookManager.tsx`'s established structure (plain `useState`, `fetch` to the event-scoped route, `window.confirm` before an irreversible action, a `role="status" aria-live="polite"` message region):

```tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { InvitationBroadcast, InvitationNotificationChannel } from "@/lib/invitations/types";

type TemplateKey = "thankYou" | "reminder" | "update";

type ComposerResult = {
  sentCount: number;
  failedCount: number;
  suppressedCount: number;
};

export function GuestMessageComposer({
  eventId,
  eventName,
  backHref,
  initialRecipientCounts,
  initialTotalResponses,
  initialHistory,
}: {
  eventId: string;
  eventName: string;
  backHref: string;
  initialRecipientCounts: { email: number; sms: number };
  initialTotalResponses: number;
  initialHistory: InvitationBroadcast[];
}) {
  const t = useTranslations("invitations.manage.messageComposer");
  const [channel, setChannel] = useState<InvitationNotificationChannel>("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<ComposerResult | null>(null);
  const [history, setHistory] = useState(initialHistory);

  const recipientCount = channel === "email" ? initialRecipientCounts.email : initialRecipientCounts.sms;
  const missingCount = initialTotalResponses - recipientCount;

  const templates = useMemo(() => ({
    thankYou: { subject: t("templates.thankYou.subject"), body: t("templates.thankYou.body") },
    reminder: { subject: t("templates.reminder.subject"), body: t("templates.reminder.body") },
    update: { subject: t("templates.update.subject"), body: t("templates.update.body") },
  }), [t]);

  function applyTemplate(key: TemplateKey | "blank") {
    if (key === "blank") { setSubject(""); setBody(""); return; }
    setSubject(templates[key].subject);
    setBody(templates[key].body);
  }

  async function send() {
    if (recipientCount === 0) return;
    const channelLabel = t(`channel.${channel}`);
    if (!window.confirm(t("confirm", { count: recipientCount, channel: channelLabel }))) return;
    setSending(true); setMessage(""); setResult(null);
    try {
      const response = await fetch(`/api/invitations/events/${eventId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel, subject: channel === "email" ? subject : undefined, body }),
      });
      const data: unknown = await response.json();
      if (!response.ok || !data || typeof data !== "object" || !("ok" in data) || !(data as { ok: boolean }).ok) {
        setMessage(t("error"));
        return;
      }
      const payload = data as ComposerResult & { ok: true; broadcast: InvitationBroadcast };
      setResult({ sentCount: payload.sentCount, failedCount: payload.failedCount, suppressedCount: payload.suppressedCount });
      setHistory((current) => [payload.broadcast, ...current]);
      setSubject(""); setBody("");
    } catch {
      setMessage(t("error"));
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#F7F4F8] px-4 py-7 text-[#2B2231] sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Link href={backHref} className="text-sm font-semibold text-[#6D456F] underline underline-offset-4">{t("back")}</Link>
        <h1 className="mt-5 font-[family-name:var(--font-fraunces)] text-4xl">{t("title")}</h1>
        <p className="mt-2 text-[#675d6a]">{t("subtitle", { name: eventName })}</p>

        <div className="mt-7 rounded-lg border border-[#d8cedc] bg-white p-5 sm:p-6">
          <fieldset className="grid gap-3">
            <legend className="text-sm font-semibold">{t("channel.label")}</legend>
            <div className="flex gap-4">
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="radio" name="channel" checked={channel === "email"} onChange={() => setChannel("email")} />
                {t("channel.email")}
              </label>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="radio" name="channel" checked={channel === "sms"} onChange={() => setChannel("sms")} />
                {t("channel.sms")}
              </label>
            </div>
          </fieldset>

          <div className="mt-5">
            <p className="text-sm font-semibold">{t("templates.label")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => applyTemplate("blank")} className="min-h-11 rounded-full border border-[#cfc3d3] px-4 text-sm font-semibold">{t("templates.blank")}</button>
              <button type="button" onClick={() => applyTemplate("thankYou")} className="min-h-11 rounded-full border border-[#cfc3d3] px-4 text-sm font-semibold">{t("templates.thankYou.label")}</button>
              <button type="button" onClick={() => applyTemplate("reminder")} className="min-h-11 rounded-full border border-[#cfc3d3] px-4 text-sm font-semibold">{t("templates.reminder.label")}</button>
              <button type="button" onClick={() => applyTemplate("update")} className="min-h-11 rounded-full border border-[#cfc3d3] px-4 text-sm font-semibold">{t("templates.update.label")}</button>
            </div>
          </div>

          {channel === "email" && (
            <label className="mt-5 block text-sm font-semibold">
              {t("fields.subject")}
              <input value={subject} onChange={(event) => setSubject(event.target.value)} className="mt-2 min-h-11 w-full rounded-md border border-[#cfc3d3] bg-white px-3 py-2 text-[16px] text-[#2B2231]" />
            </label>
          )}

          <label className="mt-5 block text-sm font-semibold">
            {t("fields.body")}
            <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={6} className="mt-2 w-full rounded-md border border-[#cfc3d3] bg-white px-3 py-2 text-[16px] text-[#2B2231]" />
          </label>
          {channel === "sms" && <p className="mt-1 text-xs text-[#807484]">{t("smsCharacterCount", { count: body.length })}</p>}

          <p className="mt-5 text-sm text-[#675d6a]">{t("recipientPreview", { reached: recipientCount, total: initialTotalResponses })}</p>
          {missingCount > 0 && <p className="mt-1 text-xs text-[#807484]">{t("recipientPreviewGap", { missing: missingCount, channel: t(`channel.${channel}`) })}</p>}

          {message && <p role="alert" className="mt-4 text-sm text-[#8a2d2d]">{message}</p>}
          {result && <p role="status" aria-live="polite" className="mt-4 text-sm text-[#285d44]">{t("resultSummary", { sent: result.sentCount, failed: result.failedCount, suppressed: result.suppressedCount })}</p>}

          <button
            type="button"
            disabled={sending || recipientCount === 0 || !body.trim() || (channel === "email" && !subject.trim())}
            onClick={() => void send()}
            className="mt-6 min-h-11 rounded-full bg-[#6D456F] px-6 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {sending ? t("sending") : t("send")}
          </button>
        </div>

        <section className="mt-8" aria-label={t("history.title")}>
          <h2 className="text-lg font-semibold">{t("history.title")}</h2>
          {history.length === 0 ? (
            <p className="mt-3 rounded-lg border border-[#d8cedc] bg-white px-5 py-8 text-center text-sm text-[#675d6a]">{t("history.empty")}</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {history.map((item) => (
                <li key={item.id} className="rounded-lg border border-[#d8cedc] bg-white p-4">
                  <p className="text-sm font-semibold">{item.subject ?? item.body.slice(0, 60)}</p>
                  <p className="mt-1 text-xs text-[#675d6a]">{t("history.counts", { sent: item.sentCount, failed: item.failedCount, suppressed: item.suppressedCount })}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Run the render test to verify it passes**

Run: `npx tsx --test src/components/invitations/GuestMessageComposer.render.test.tsx`
Expected: PASS, 3/3.

- [ ] **Step 6: Write the failing interaction test**

Create `src/components/invitations/GuestMessageComposer.interaction.test.tsx`, following `ResponsesDashboard.interaction.test.tsx`'s established jsdom harness pattern (read that file first for the exact `JSDOM`/`createRoot`/`act` setup and global fetch mocking convention used elsewhere in this codebase):

```tsx
import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../messages/en.json";
import { GuestMessageComposer } from "./GuestMessageComposer";

function setupDom() {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://example.test" });
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    React, IS_REACT_ACT_ENVIRONMENT: true,
  });
  return dom;
}

test("selecting a template fills in subject and body, and sending posts the composed message", async () => {
  const dom = setupDom();
  const container = dom.window.document.querySelector<HTMLElement>("#root")!;
  const root = createRoot(container);
  const originalFetch = globalThis.fetch;
  const originalConfirm = dom.window.confirm;
  const calls: Array<{ url: string; method?: string; body?: string }> = [];
  dom.window.confirm = () => true;
  const sentBroadcast = {
    id: "broadcast-1", eventId: "event-1", channel: "email", subject: "Thank you for celebrating with us!",
    body: "Thank you so much for being part of our special day. It meant the world to have you there.",
    sentBy: "owner", recipientCount: 8, sentCount: 8, failedCount: 0, suppressedCount: 0,
    createdAt: "2026-09-20T12:00:00.000Z",
  };
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method, body: init?.body as string | undefined });
    return new Response(JSON.stringify({ ok: true, broadcast: sentBroadcast, recipientCount: 8, sentCount: 8, failedCount: 0, suppressedCount: 0 }), { status: 200 });
  }) as typeof fetch;

  try {
    await act(async () => {
      root.render(
        <NextIntlClientProvider locale="en" messages={enMessages} timeZone="America/New_York">
          <GuestMessageComposer
            eventId="event-1" eventName="Mercy & John" backHref="/invitations/manage/event-1"
            initialRecipientCounts={{ email: 8, sms: 5 }} initialTotalResponses={10} initialHistory={[]}
          />
        </NextIntlClientProvider>,
      );
    });

    const thankYouButton = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Thank you")!;
    await act(async () => { thankYouButton.click(); });
    const subjectInput = container.querySelector<HTMLInputElement>("input[type='text'], input:not([type])") ?? container.querySelectorAll("input")[0];
    assert.ok((subjectInput as HTMLInputElement).value.length > 0, "expected the template to fill the subject field");

    const sendButton = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Send message")!;
    await act(async () => { sendButton.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    const postCall = calls.find((c) => c.method === "POST");
    assert.ok(postCall, "expected a POST to the messages endpoint");
    const posted = JSON.parse(postCall!.body!);
    assert.equal(posted.channel, "email");
    assert.ok(posted.subject.length > 0);

    assert.match(container.textContent ?? "", /Sent to 8/);
  } finally {
    globalThis.fetch = originalFetch;
    dom.window.confirm = originalConfirm;
    await act(async () => { root.unmount(); });
  }
});
```

- [ ] **Step 7: Run the interaction test to verify it fails, then passes**

Run: `npx tsx --test src/components/invitations/GuestMessageComposer.interaction.test.tsx`

If it fails because of an incorrect selector or harness detail, read `ResponsesDashboard.interaction.test.tsx` in full and adjust this test's setup to match its exact conventions (harness globals, `act` usage) — that file is the authoritative pattern in this codebase, not this plan's paraphrase of it.

Expected once corrected: PASS, 1/1.

- [ ] **Step 8: Wire the owner entry point**

Create `src/app/invitations/manage/[eventId]/message/page.tsx`, following `guestbook/page.tsx`'s exact structure:

```tsx
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { GuestMessageComposer } from "@/components/invitations/GuestMessageComposer";
import { InvitationPublicProvider } from "@/components/invitations/InvitationPublicProvider";
import { invitationOwnerOwnsEvent } from "@/lib/invitations/access";
import { INVITATION_OWNER_SESSION_COOKIE, verifyOwnerSession } from "@/lib/invitations/auth";
import { eligibleBroadcastRecipients, listInvitationBroadcasts } from "@/lib/invitations/broadcasts";
import { getInvitationEventForManagement, listInvitationResponseRows } from "@/lib/invitations/repository";

export const revalidate = 0;

export default async function OwnerMessagePage({ params }: { params: { eventId: string } }) {
  const signed = cookies().get(INVITATION_OWNER_SESSION_COOKIE)?.value;
  let ownerId: string | null = null;
  try { ownerId = signed ? verifyOwnerSession(signed)?.ownerId ?? null : null; } catch { ownerId = null; }
  if (!ownerId) redirect("/invitations/login");
  const event = await getInvitationEventForManagement(params.eventId);
  if (!event || !await invitationOwnerOwnsEvent(ownerId, params.eventId)) notFound();

  const [rows, history] = await Promise.all([
    listInvitationResponseRows(event.id),
    listInvitationBroadcasts(event.id),
  ]);

  return (
    <InvitationPublicProvider locale={event.locale} timeZone={event.timezone}>
      <GuestMessageComposer
        eventId={event.id}
        eventName={event.honoreeNames || event.title}
        backHref={`/invitations/manage/${event.id}`}
        initialRecipientCounts={{
          email: eligibleBroadcastRecipients(rows, "email").length,
          sms: eligibleBroadcastRecipients(rows, "sms").length,
        }}
        initialTotalResponses={rows.length}
        initialHistory={history}
      />
    </InvitationPublicProvider>
  );
}
```

- [ ] **Step 9: Wire the founder entry point**

Create `src/app/(admin)/admin/invitations/[eventId]/message/page.tsx`, following the founder `guestbook/page.tsx`'s exact structure (no per-page auth check — the `(admin)/admin/invitations` layout already gates founder access):

```tsx
import { notFound } from "next/navigation";
import { GuestMessageComposer } from "@/components/invitations/GuestMessageComposer";
import { InvitationPublicProvider } from "@/components/invitations/InvitationPublicProvider";
import { eligibleBroadcastRecipients, listInvitationBroadcasts } from "@/lib/invitations/broadcasts";
import { getInvitationEventForManagement, listInvitationResponseRows } from "@/lib/invitations/repository";

export const revalidate = 0;

export default async function FounderMessagePage({ params }: { params: { eventId: string } }) {
  const event = await getInvitationEventForManagement(params.eventId);
  if (!event) notFound();

  const [rows, history] = await Promise.all([
    listInvitationResponseRows(event.id),
    listInvitationBroadcasts(event.id),
  ]);

  return (
    <InvitationPublicProvider locale={event.locale} timeZone={event.timezone}>
      <GuestMessageComposer
        eventId={event.id}
        eventName={event.honoreeNames || event.title}
        backHref={`/admin/invitations/${event.id}`}
        initialRecipientCounts={{
          email: eligibleBroadcastRecipients(rows, "email").length,
          sms: eligibleBroadcastRecipients(rows, "sms").length,
        }}
        initialTotalResponses={rows.length}
        initialHistory={history}
      />
    </InvitationPublicProvider>
  );
}
```

- [ ] **Step 10: Write the failing test for the OwnerGuestDashboard card**

`src/components/invitations/OwnerGuestDashboard.render.test.tsx` has one existing test with a `responses` fixture (an `InvitationResponsesDashboard`) and constructs `event={{...}}` inline rather than via a shared fixture variable or a `provider()` helper. Add a second test right after it, following that exact same inline style:

```tsx
test("owner dashboard links to the guest message composer", () => {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={enMessages} timeZone="America/New_York">
      <OwnerGuestDashboard
        event={{ id: "event-1", title: "You're Invited", honoreeNames: "Mercy & John", status: "published", slug: "mercy-john", publicSubdomain: "mercy-john" }}
        initialData={responses}
      />
    </NextIntlClientProvider>,
  );
  assert.match(html, /Guest messages/);
  assert.match(html, /href="\/invitations\/manage\/event-1\/message"/);
});
```

- [ ] **Step 11: Run the test to verify it fails**

Run: `npx tsx --test src/components/invitations/OwnerGuestDashboard.render.test.tsx`
Expected: FAIL — no "Guest messages" text or matching link in the current output.

- [ ] **Step 12: Add the card to OwnerGuestDashboard**

In `OwnerGuestDashboard.tsx`, immediately after the guestbook `<section>` (currently lines 51-56) and before the guest-ledger `<section>`, add:

```tsx
      <section className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
        <div className="flex flex-col gap-4 rounded-lg border border-[#cfc3d3] bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="text-lg font-semibold">{t("message.title")}</h2><p className="mt-1 text-sm text-[#675d6a]">{t("message.description")}</p></div>
          <Link href={`/invitations/manage/${event.id}/message`} className="inline-flex min-h-11 items-center justify-center rounded-md border border-[#6D456F] px-4 py-2 text-sm font-semibold text-[#55405a]">{t("message.open")}</Link>
        </div>
      </section>
```

- [ ] **Step 13: Run the test to verify it passes**

Run: `npx tsx --test src/components/invitations/OwnerGuestDashboard.render.test.tsx`
Expected: PASS, including the new test.

- [ ] **Step 14: Add the matching link in EventEditor**

In `EventEditor.tsx`, immediately after the existing guestbook link (line 681), add:

```tsx
            <a href={mode === "founder" ? `/admin/invitations/${currentEvent.id}/message` : `/invitations/manage/${currentEvent.id}/message`} className="mt-1 block text-xs font-semibold text-[#6D456F] underline underline-offset-4">{t("actions.message")}</a>
```

- [ ] **Step 15: Run the full suite and typecheck**

Run: `npx tsx --test $(find src -name "*.test.ts" -o -name "*.test.tsx" | sort)`
Expected: PASS, 0 failures — this includes every pre-existing `EventEditor`/`OwnerGuestDashboard` test.

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 16: Manual mobile check**

Start the dev server as a managed background session (`npm run dev`, then terminate it after this check — do not leave it running in the foreground). Log in as an owner (or use the founder path), navigate to the new `/message` page, and confirm at 375px width: the channel picker, template buttons, compose fields, recipient preview, and send button are all usable without horizontal scrolling, and switching templates visibly updates the subject/body fields.

- [ ] **Step 17: Commit**

```bash
git add src/components/invitations/GuestMessageComposer.tsx \
  src/components/invitations/GuestMessageComposer.render.test.tsx \
  src/components/invitations/GuestMessageComposer.interaction.test.tsx \
  src/app/invitations/manage/\[eventId\]/message/page.tsx \
  "src/app/(admin)/admin/invitations/[eventId]/message/page.tsx" \
  src/components/invitations/OwnerGuestDashboard.tsx \
  src/components/invitations/OwnerGuestDashboard.render.test.tsx \
  src/components/invitations/EventEditor.tsx \
  messages/en.json messages/es.json
git commit -m "feat: add guest message composer UI and entry points"
```
