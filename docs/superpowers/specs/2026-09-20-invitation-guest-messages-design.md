# Invitation Guest Messages Design

**Date:** 2026-09-20
**Status:** Approved in conversation; awaiting written-spec review
**Product stage:** Addition to the live invitation-events feature (see `2026-09-13-invitation-events-mvp-design.md`)

## Summary

Add a "message guests" capability to the existing invitation-events feature. Today, an event owner or founder can only see who RSVP'd; they cannot proactively reach guests. This feature lets them compose a message and send it, in one channel at a time, to every guest who RSVP'd and provided the matching contact method — regardless of whether that guest is attending or declined.

The feature is additive: it reuses the invitation feature's existing owner/founder authentication, the atomic per-event notification-cap RPC, and the Resend/Twilio provider adapters built for RSVP notifications. It introduces one new table and one new page.

## Goals

- Let an owner or founder compose a message and send it to guests via email or SMS.
- Recipients are computed automatically from RSVP data — no manual guest picking.
- Reuse the existing per-event notification cap so broadcast sends and automatic RSVP notifications share one abuse/cost budget.
- Give the owner a short list of starter templates (Thank you / Reminder / Update) to edit rather than writing from scratch.
- Show a clear preview of who will be reached before sending, and a delivery-result summary after.
- Keep a simple history of past messages sent for an event.
- Provide all UI chrome and starter templates in English and Spanish.

## Non-goals

- Manual/custom recipient selection (a future iteration could add this; not in this pass).
- Sending both channels in a single compose action — the celebrant picks one channel per message.
- Scheduling a message for a future time; sends are immediate.
- Draft-saving; a composed message is either sent or discarded.
- Resumable/idempotent delivery across a server crash mid-broadcast (see Error handling).
- Any plan-tier gating of SMS availability — the channel picker is built so this can be added later without a rewrite, but no gating exists yet.

## Data model

### `invitation_broadcasts` (new)

- `id` uuid primary key
- `event_id` uuid references `invitation_events(id)` on delete cascade
- `channel` text, check in (`'email'`, `'sms'`)
- `subject` text, nullable (email only; null for sms)
- `body` text, not null
- `sent_by` text, check in (`'owner'`, `'founder'`)
- `recipient_count` integer not null (guests targeted at send time)
- `sent_count` integer not null default 0
- `failed_count` integer not null default 0
- `suppressed_count` integer not null default 0 (blocked by the shared cap)
- `created_at` timestamptz not null default now()

RLS enabled; revoked from `anon`/`authenticated` like every other invitation table — service-role access only through validated server routes.

### `invitation_notifications` (extend)

- Widen the `kind` check constraint to add `'celebrant_broadcast'` alongside the existing `'rsvp_created'`, `'rsvp_updated'`, `'guest_confirmation'`.
- Add nullable `broadcast_id` uuid references `invitation_broadcasts(id)` on delete cascade. Null for RSVP-triggered rows; set for broadcast rows.
- No other column changes. `audience` is `'guest'` and `rsvp_id` still references the recipient's own RSVP row, exactly as today — a broadcast recipient's notification row is structurally identical to a guest-confirmation row, just with a different `kind` and a `broadcast_id`.

### `invitation_events` (alter default)

- Change `sms_notification_limit`'s default from 50 to 100.
- Backfill: set `sms_notification_limit = 100` for every existing row currently at 50. There is no way to distinguish "still on the default" from "a founder deliberately chose 50," so this bumps both; a founder can manually lower a specific event back down if that turns out wrong.

## Guest targeting

Recipients are computed per send, not stored:

- **Email broadcast:** every `invitation_rsvps` row for the event where `email` is not null.
- **SMS broadcast:** every `invitation_rsvps` row for the event where `phone` is not null.

Attending/declined status is not filtered — every guest who RSVP'd and left the relevant contact method is included, per the approved requirement. Duplicate contacts within one event are already impossible (RSVP creation rejects a duplicate normalized email/phone), so no dedup step is needed here.

## Routes and components

New page: `src/app/invitations/manage/[eventId]/message/page.tsx`, reached via a new "Message guests" summary card on `OwnerGuestDashboard` (the same pattern the guestbook feature already uses: a card with a title, a one-line status, and an "Open"-style link to the sub-page). A matching founder-side entry point is added the same way the founder's guestbook link already exists.

The page renders a new `GuestMessageComposer` component:

1. **Channel picker** (Email / SMS) — selecting one determines which fields show and which recipient set applies.
2. **Template picker** — three starter drafts (Thank you, Reminder, Update), localized to the event's own `locale`, each pre-filling subject (email only) + body. A "Start blank" option clears both fields.
3. **Compose fields** — Subject (required for email, hidden for SMS) and Body (required always; a live character count for SMS as a cost-awareness nicety, not a hard limit).
4. **Recipient preview** — "This will reach N of M guests" with the M−N gap explained as guests missing that contact method for the chosen channel.
5. **Confirm step** — an explicit "Send to N guests via Email/SMS" confirmation before submission, matching the existing confirm-before-remove pattern in `ResponsesDashboard`.
6. **Result summary** — after sending: sent / failed / suppressed-by-cap counts.
7. **Recent messages** — a list of past `invitation_broadcasts` rows for the event (date, channel, subject or first line of body, and its counts).

## Sending flow

New endpoint: `src/app/api/invitations/events/[eventId]/messages/route.ts` (POST), gated by the existing `requireInvitationAccess` (owner-of-event or founder) and the same-origin check every other mutation route in this module already enforces.

1. Validate the compose payload (channel, subject-required-for-email, non-empty body).
2. Insert the `invitation_broadcasts` row.
3. Fetch the eligible recipient RSVPs for the chosen channel.
4. Process recipients in small concurrent batches (e.g. 8 at a time — a performance/reliability implementation detail, not a product decision):
   - Call the existing `reserve_invitation_notification` RPC (audience `'guest'`, kind `'celebrant_broadcast'`, `broadcast_id` set). If the shared cap has been reached, the RPC already records a `suppressed` row and no provider call is made.
   - Otherwise call the existing `resendEmailSender` / `twilioSmsSender` with the escaped (email) or plain (SMS) message content, and mark the notification row sent or failed via the existing `markInvitationNotificationSent`/`markInvitationNotificationFailed` — exactly the functions Task 8 built for RSVP notifications.
5. Update the broadcast row's final `sent_count`/`failed_count`/`suppressed_count` and return the summary to the client.

One recipient's failure never aborts the rest — same isolation guarantee the RSVP-notification dispatcher already provides.

**Free reuse:** because a broadcast recipient's row lives in the same `invitation_notifications` table, the existing founder "Retry delivery" button and `retryInvitationNotification` endpoint work on a failed broadcast send with no new code.

## Error handling

- Authored content (subject, body) is HTML-escaped with the existing `escapeHtml` helper before interpolation into the email template. SMS bodies are sent as plain text.
- If the server process dies mid-broadcast, any recipient not yet reached has no notification row at all — not even `failed` — so it will not appear in the retry list, and re-sending the same message would go out as a new, separate broadcast to everyone again. This is an accepted MVP limitation: no resumable/idempotent bulk-delivery mechanism is being built for this. The batched-concurrency approach keeps even a few hundred recipients within a normal request lifetime, matching the scope of every other MVP boundary already accepted in this feature.
- Reaching the shared cap mid-broadcast does not error the request; remaining recipients are simply recorded as `suppressed`, exactly like the existing RSVP-notification cap behavior.

## Localization

All UI chrome (labels, buttons, confirm text, the template picker, result summary) is bilingual via `messages/en.json` / `messages/es.json`, matching every other surface in this feature. The three starter templates are localized to the event's own locale. Whatever the celebrant actually types is never machine-translated, exactly like event descriptions today.

## Testing plan

- **Migration-contract tests** (static SQL-text assertions, following `rsvp-migration-contract.test.ts`'s established pattern, since there is no local Postgres in this environment): the widened `kind` check, the new `broadcast_id` FK, and the `sms_notification_limit` default/backfill.
- **Dispatch unit tests**: a pure, dependency-injected batched-send function (fakes for reserve/send/mark), mirroring `dispatchRsvpNotifications`'s existing test style — covering per-recipient failure isolation, cap-reached suppression, and the sent/failed/suppressed count rollup.
- **Render/interaction tests** for `GuestMessageComposer`: channel switch changes visible fields and recipient set, template selection fills subject/body, recipient-count preview reflects missing-contact guests, the confirm step blocks submission until confirmed, and the result summary renders after a simulated send.
- Full source-test suite and `npx tsc --noEmit` clean before each task is considered done, per this feature's established process.
