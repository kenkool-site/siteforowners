# Invitation Events MVP Design

**Date:** 2026-09-13  
**Status:** Approved in conversation; awaiting written-spec review  
**Product stage:** One-event pilot for a friend and market validation

## Summary

Add an isolated ceremony-invitation module to the existing SiteForOwners Next.js application. The pilot lets a founder create and customize a wedding, birthday, or similar event invitation; lets a nontechnical owner manage it through an email-and-PIN login; and lets guests view one shareable link and submit party-based RSVPs.

The module reuses the current deployment and provider configuration—Next.js, Supabase, Vercel, Resend, Twilio, and signed-cookie infrastructure—while keeping routes, tables, storage, sessions, and components separate from business-site tenants. The separation is intentional so the invitation product can move to its own brand or application later.

No public signup, invitation delivery to a guest list, or payment flow is included in the pilot. The founder provisions events and owners manually.

## Goals

- Publish an attractive, mobile-first invitation at one shareable URL.
- Support weddings, birthdays, and other ceremonies without event-specific code paths.
- Let guests RSVP for a party and revise their response securely.
- Notify the owner immediately by email and, when enabled, SMS.
- Give the owner and founder a simple editor and RSVP dashboard.
- Bound messaging cost and protect the public endpoint from abuse.
- Close or deactivate an invitation manually or automatically.
- Preserve a clean path to extracting the module into a separate product.

## Non-goals

- Public customer registration or self-service event provisioning
- Stripe checkout or one-time-payment collection
- Importing guest lists or sending initial invitations
- Individualized invitation URLs
- Seating charts, table assignments, registries, meal selection, or waitlists
- Multiple event owners or granular collaborator permissions
- Guest accounts
- A custom domain for the invitation product
- A drag-and-drop page builder

## Users and access

### Founder

The existing founder `admin_session` can create, view, edit, publish, close, expire, and deactivate any invitation; provision an owner; reset the owner's PIN; retry failed notifications; and change founder-controlled cost limits. The middleware's founder-route allowlist will explicitly protect `/admin/invitations` before root-domain passthrough.

### Invitation owner

An owner signs in at `/invitations/login` with an email address and numeric PIN. The PIN is hashed with the existing scrypt pattern. A separate HTTP-only signed cookie contains the owner ID and expiry and grants access only to that owner's events. The invitation cookie and route guard do not reuse the hostname-bound business owner session.

The pilot supports one owner per event. The schema permits an owner to have multiple events later.

### Guest

A guest needs no account. The event may require a shared passcode. RSVP records and guest details are never publicly queryable.

## Routes and module boundaries

- `/invite/[slug]`: public invitation, passcode gate, RSVP form, and confirmation
- `/invitations/login`: owner email-and-PIN login
- `/invitations`: owner's event list or direct redirect when only one event exists
- `/invitations/manage/[eventId]`: editor, preview/share tools, and RSVP dashboard
- `/admin/invitations`: founder event list and event creation
- `/admin/invitations/[eventId]`: founder editor and operational controls

Invitation pages, server-side services, components, validation, email templates, and types live in invitation-specific modules. Existing tenant tables and business-site template records are not extended to represent events.

## Data model

All tables use UUID primary keys and `created_at timestamptz default now()`. Mutable records also have `updated_at`.

### `invitation_owners`

- `id`
- `name`
- `email` (case-insensitive unique value)
- `phone` (nullable; normalized E.164 when present)
- `pin_hash`
- `is_active`
- timestamps

### `invitation_events`

- `id`
- `owner_id` referencing `invitation_owners`
- `slug` (unique, unguessable enough to resist casual enumeration)
- `event_type` (free-form display category with curated defaults)
- `title`
- `honoree_names`
- `description`
- `starts_at` and `timezone`
- `venue_name`, `address`, and `map_url`
- `theme_key`, `primary_color`, `accent_color`, and `font_pair_key`
- `designed_invite_path` and `cover_image_path` (nullable)
- `video_path` (nullable)
- `passcode_hash` (nullable)
- `show_public_rsvp_count`
- `capacity` (nullable; maximum attending people, not submissions)
- `rsvp_deadline` (nullable)
- `submission_limit` (founder-controlled, default 250)
- `email_notification_limit` (founder-controlled, default 250)
- `sms_notification_limit` (founder-controlled, default 50)
- `owner_email_notifications` (default true)
- `owner_sms_notifications` (default false)
- `notification_email` (defaults to the owner's login email)
- `notification_phone` (nullable; required only when owner SMS is enabled)
- `guest_email_confirmations` (default true)
- `status`: `draft`, `published`, `rsvp_closed`, `expired`, or `offline`
- `expire_at` (nullable; defaults to the end of the calendar day after the event in its timezone)
- timestamps

The founder may raise or lower the three cost/abuse limits. Owners may set capacity and deadline but cannot raise founder-controlled limits.

### `invitation_media`

- `id`
- `event_id`
- `kind`: `gallery_image`
- `storage_path`
- `alt_text`
- `sort_order`
- timestamp

Dedicated invite, cover, and video fields keep the main presentation media unambiguous; the media table represents the ordered gallery.

### `invitation_rsvps`

- `id`
- `event_id`
- `primary_name`
- `email` (nullable, normalized)
- `phone` (nullable, normalized)
- `attending`
- `party_size` (`0` for a decline; otherwise includes the primary guest)
- `additional_guest_names` (text array)
- `dietary_or_accessibility_notes` (nullable)
- `message` (nullable)
- `edit_token_hash`
- `last_notified_at` (nullable)
- timestamps

At least one of `email` or `phone` is required. A guest cannot read another party's response. A high-entropy edit token returned after creation is the only guest credential for later updates; only its hash is stored.

### `invitation_notifications`

- `id`
- `event_id`
- `rsvp_id`
- `audience`: `owner` or `guest`
- `channel`: `email` or `sms`
- `recipient`
- `kind`: `rsvp_created`, `rsvp_updated`, or `guest_confirmation`
- `status`: `pending`, `sent`, `failed`, or `suppressed`
- `provider_message_id` and `failure_reason` (nullable)
- timestamp

This table supplies an auditable count for notification limits and supports safe retries without sending duplicates.

## Storage

A dedicated private Supabase bucket stores presentation media under event-scoped, randomized object paths. Reads use short-lived signed URLs issued only when the public event is available and any passcode requirement has been satisfied. Writes and deletes occur only through authorized server routes using the service role.

MVP upload constraints are:

- Designed invitation and cover image: JPEG, PNG, or WebP, up to 10 MB each
- Gallery: up to 12 JPEG, PNG, or WebP images, up to 10 MB each
- Video: one MP4 or WebM file, up to 50 MB and 60 seconds

The server validates MIME type and size. Video duration is validated before publish. Replaced and removed objects are deleted from storage after the database update succeeds.

## Public invitation experience

The page is designed mobile-first at 375 px and scales to desktop. A selected curated theme controls layout, typography, colors, and transitions; the owner edits structured fields instead of freely positioning elements.

The invitation can contain:

- A template-rendered cover or an uploaded designed invitation
- Event title and honorees
- Date, time, venue, address, and a maps link
- Add-to-calendar links
- Description or personal message
- Cover photo, gallery, and optional short video
- RSVP call to action and form
- Optional aggregate attending and declined counts

If a shared passcode is enabled, private event content and signed media URLs are not rendered until the passcode succeeds. A short-lived, event-scoped cookie avoids repeated prompts on the same device.

The RSVP form asks for name, attending or declining, total party size, additional guest names, either email or phone, optional dietary/accessibility notes, and an optional message. Declines store a party size of zero. Private fields and guest names never appear in public counts.

After submission, the guest sees a confirmation and private edit link. The browser retains the edit capability for convenience. When the guest provides email and guest confirmations are enabled, the system also emails the edit link; guest SMS confirmations are outside MVP. Guest confirmation emails count against the event's email notification limit.

## RSVP rules and capacity

- Capacity counts people marked attending, including each primary guest.
- New affirmative RSVPs use an atomic database operation that locks/rechecks available capacity before committing.
- When full, new attending responses are rejected with a clear message, while declines and authenticated edits remain available.
- An edit that increases party size is accepted only when the additional seats remain available.
- An edit that reduces party size immediately frees capacity.
- There is no waitlist in MVP.
- The submission limit counts newly created RSVP records. Authenticated edits remain possible after the limit is reached.
- Rate limiting applies per event and network fingerprint without storing a raw IP address long term.
- A likely duplicate based on normalized contact information is not silently merged. The guest is prompted to use the existing edit link; the owner or founder can correct the response manually.

## Public counts and privacy

When enabled, the public page shows only the total number of attending people and the number of declined parties. It never shows names, phone numbers, email addresses, notes, messages, or party composition. If public counts are disabled, only the owner and founder dashboards show them.

## Notifications and cost controls

Every new or updated RSVP, including a decline, queues an immediate owner email by default. Owner SMS is optional per event. A failed notification does not roll back the RSVP.

Each channel checks its founder-controlled limit before enqueueing. Counts include successful, pending, and failed attempts so repeated provider failures cannot create unlimited spend. When a limit is reached, the RSVP still saves, the notification is recorded as suppressed, and the dashboard shows a visible warning. Founder retries are idempotent and remain subject to the limit unless the founder explicitly raises it.

Owner emails and texts contain the response summary and a dashboard link but avoid exposing the shared event passcode. No owner notification is sent for changes made by that same owner or by the founder in the dashboard.

## Owner editor and dashboard

The editor is divided into five simple sections:

1. **Event:** type, title, honorees, description, date/time, venue, address, and map link
2. **Design:** theme, curated font pair, colors, designed invitation, cover image, gallery, and video
3. **RSVP settings:** deadline, capacity, public counts, passcode, owner email, and optional owner SMS
4. **Preview & share:** responsive preview, publish status, public URL, and copy-link action
5. **Responses:** totals, remaining capacity, searchable/filterable response table, details, manual edits, and CSV export

Owners receive clear validation rather than raw provider or database errors. Controls that affect cost limits or owner credentials are founder-only.

## Event lifecycle

- `draft`: owner/founder preview only; public URL shows not available
- `published`: invitation and RSVP form are available, subject to deadline and capacity
- `rsvp_closed`: invitation remains visible but new responses are disabled; authenticated edits remain available unless explicitly disabled by the owner
- `expired`: a friendly event-ended page replaces event details and disables all RSVP activity
- `offline`: the public endpoint behaves as not found and exposes no event metadata

At `rsvp_deadline`, a published event behaves as `rsvp_closed` without requiring a status rewrite. At `expire_at`, it behaves as `expired`. The owner or founder can close, reopen, expire, or take the page offline manually. Automatic expiry can be disabled by setting `expire_at` to null.

## Data flow

1. The founder creates an owner and draft event.
2. The founder or owner fills structured content and uploads media through authorized server endpoints.
3. Publish validation confirms required content, media validity, a future or explicitly allowed past date, notification recipients, and coherent deadline/expiry values.
4. A guest opens the slug, satisfies the optional passcode, and receives server-rendered public event data.
5. The guest submits an RSVP through a rate-limited endpoint.
6. Server validation and the atomic database operation enforce state, deadline, submission limit, capacity, and contact requirements.
7. The RSVP commits before notifications are attempted.
8. Eligible notification records are queued/sent through Resend and optionally Twilio. Failures are logged and surfaced without losing the response.
9. Public aggregate counts and the protected dashboard update from persisted RSVP data.

## Security

- Invitation owner authorization is derived from the signed owner session, never a client-supplied owner ID.
- Founder actions require the existing founder session.
- Owner and RSVP tables enable RLS; public clients receive no direct table access.
- Public RSVP reads and writes go through narrowly scoped server endpoints.
- PINs, passcodes, and edit tokens are stored only as hashes.
- Slugs and edit tokens use cryptographically secure randomness.
- Passcode and login attempts are rate-limited.
- User text is rendered as text, not raw HTML.
- File type, size, and ownership are verified server-side.
- Logs redact PINs, passcodes, edit tokens, and full guest contact values.

## Error handling and operations

- RSVP success never depends on notification-provider success.
- Provider errors create failed notification records and an owner/founder dashboard warning.
- Duplicate provider sends are prevented with idempotency keys based on notification records.
- Storage uploads use a create-record/upload/finalize sequence; abandoned uploads are eligible for periodic cleanup.
- Publish failures identify the exact fields or media requiring attention.
- Capacity, deadline, closed, expired, offline, wrong-passcode, and rate-limit states each have distinct guest-facing responses.

## Testing

### Unit and integration tests

- PIN, passcode, session, and edit-token verification
- Event-state and deadline decisions
- Required RSVP fields and contact normalization
- Capacity calculations for create, increase, decrease, decline, and reopen cases
- Submission and per-channel notification limits
- Notification suppression, failure recording, and idempotent retry
- Founder/owner/guest authorization boundaries
- Public-count privacy projections
- Media MIME, size, count, and duration validation
- CSV escaping and protected export

### Database concurrency tests

- Two simultaneous RSVPs competing for the final seat
- Two simultaneous edits increasing party size
- Capacity freed by an edit while another submission is in flight

### End-to-end tests

- Founder creates and publishes an event
- Owner signs in with email and PIN and edits only their event
- Guest passes an optional passcode and submits an attending RSVP
- Guest submits a decline and updates it through the private token
- Public aggregate counts reveal no identities
- Capacity, deadline, expired, and offline experiences
- Owner receives email by default and SMS only when enabled
- Notification cap does not prevent RSVP persistence
- Complete guest flow at 375 px, plus desktop editor and preview checks

## Extraction path

The invitation module must not depend on business tenant schemas or hostname routing. Provider integrations sit behind invitation-specific service interfaces, and all routes/components use invitation-domain types. A later extraction can move the invitation tables, storage bucket, routes, and services to a separate Next.js/Supabase project while preserving the data model and UI behavior.

## MVP success criteria

The pilot is successful when the founder can provision and publish one polished event, a nontechnical owner can make routine edits and understand the RSVP dashboard, guests can RSVP or revise a party response from a phone, capacity cannot be exceeded, private guest information never appears publicly, immediate owner notifications respect cost limits, and the invitation can close, expire, or go fully offline without manual database work.
