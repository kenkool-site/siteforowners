# Invitation Events pilot runbook

This guide is for the founder operating the invitation-events pilot. It assumes one owner per event and founder-controlled provisioning; it does not add public sign-up, guest-list imports, or initial invitation delivery.

## Before the pilot

1. Apply the invitation migrations in numeric order in the production Supabase project. Confirm the tables, RPCs, RLS policies, and storage buckets finish successfully before creating an event.
2. Set the production environment variables used by the app: Supabase URL and keys, `ADMIN_PASSWORD`, `SESSION_COOKIE_SECRET`, and only the provider credentials and sender addresses needed for the pilot (`RESEND_API_KEY`, `EMAIL_FROM`, and/or Twilio credentials and sender number).
3. Confirm the root-domain founder login works and that `/admin/invitations` is protected by the founder session. Open a private/incognito browser for the owner and guest checks so sessions do not overlap.
4. Run the deployment build and review provider configuration. Do not set `INVITATION_E2E_FIXTURES` in production; the code hard-disables fixtures when `NODE_ENV=production`, but production must not rely on that extra safeguard.

## Provision and hand off an event

1. Sign in as the founder and open **Admin → Invitations → New invitation**.
2. Enter the owner's name, email, optional phone number, event title, locale, time zone, and start time. Record the one-time generated PIN before leaving the confirmation page.
3. Send the owner the event-management URL and PIN through an approved private channel. Never put a PIN in a public post or on the public invitation.
4. Have the owner sign in at `/invitations/login`, complete event details, and verify the public preview. The owner can only access events they own; the founder can access every event.

## Prepare, publish, and share

1. Add a designed invitation or cover image, gallery images, and optional video. Use only media you have permission to publish. Keep uploads web-sized and test them on a mobile connection; remove any oversized or inappropriate file before publishing.
2. Confirm title, honoree names, date/time/time zone, venue and address, map URL, capacity, RSVP deadline, passcode requirement, and English/Spanish copy.
3. Verify the notification destination. Owner email/SMS controls decide which enabled channels receive future RSVP alerts; guest email confirmations remain off unless the owner explicitly wants them.
4. Publish the event, open the public URL in a signed-out/private browser, and test the entire guest flow. If a passcode is enabled, test one incorrect entry and one correct entry.
5. Use the editor's copy-link control only after the signed-out check. Share that link through the owner’s chosen channel; the pilot does not deliver a guest list on the founder’s behalf.

## Operating an active event

### Responses and notifications

- Watch the RSVP dashboard for attending totals, declines, capacity, failed or suppressed notifications, and filterable guest details.
- If a notification fails, only the founder can use the retry control after correcting provider credentials or sender verification. A retry uses the notification’s stored recipient; changing the event destination affects future notifications, not an existing retry. Retrying delivery must not create or alter an RSVP.
- If an email or SMS budget warning appears, the founder may raise the applicable event limit only after confirming the new budget. Keep the limit finite; a higher limit increases spend exposure.
- Change notification email/phone in the event editor, save, then submit a controlled RSVP in the appropriate owner-approved test event if you need to prove delivery. Do not use real guests as test data.
- Export RSVPs as CSV from the dashboard when needed. Treat the export as private guest data: download it only to an approved device, transfer it through an approved channel, and delete local copies when the purpose is complete.

### Event states

- **Close RSVPs:** stops new guest submissions while keeping invitation details visible. Reopen only after confirming capacity and deadline policy with the owner.
- **Expire:** renders the ended-event surface and keeps private event details out of that page. Use after the event is over.
- **Offline:** returns a not-found response for the public URL. Use immediately for a mistaken publish, privacy incident, or emergency stop.
- A passcode is shared protection, not a guest identity system. Do not treat it as a substitute for individualized access.

## Rollback and incident response

1. Before any code rollback, set the affected event **Offline**. Verify its public `/invite/[slug]` URL returns not found in a signed-out browser.
2. Preserve the event ID, current state, and relevant provider error identifiers for investigation; do not paste RSVP or PIN data into public tickets or logs.
3. Correct the deployment, migration, configuration, or media issue in a safe environment. Re-run the invitation checks before restoring traffic.
4. Re-publish only after the owner confirms the title, schedule, privacy setting, link, and notification destination. If the incident involved link exposure, create a replacement event/slug rather than reusing the compromised link.

## Boundaries for a later extraction

The module is intentionally isolated: invitation routes live under `/invite`, `/invitations`, and `/admin/invitations`; its tables, storage, sessions, components, and notification workflows are separate from business-site tenants. An extraction must carry the invitation schema and migrations, RLS/RPC behavior, owner-session signing secret and cookie policy, media storage, provider adapters, all public/owner/founder routes, and the operations above. Do not move only the UI while leaving data access, session validation, or notification delivery behind.

## Local verification only

The Playwright suite uses an in-memory fixture store only when `INVITATION_E2E_FIXTURES=1` and `NODE_ENV` is not `production`. It replaces notification sender interfaces with recording fakes, so it never sends Resend email or Twilio SMS. Run it locally with:

```bash
npx playwright test tests/invitations/invitation-flow.spec.ts --project=chromium
```

Generated `test-results/` and `playwright-report/` files are intentionally ignored.
