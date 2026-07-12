# Home-services estimate modal and owner notifications

**Date:** 2026-07-12  
**Branch:** `feat/home-services-template-foundation`  
**Status:** Approved design

## Problem

The home-services template currently treats estimate CTAs as page anchors. Older
marketing previews can point at a hidden estimate section, and the full inline
form is heavier than the quick lead flow contractors need. The estimate API also
delivers through SMS or WhatsApp only and rejects marketing preview hosts.

Prospective customers should be able to request an estimate quickly. Contractors
primarily follow up by text, but should also receive an email when an owner email
address is available. Marketing previews must demonstrate the interaction without
creating real leads or sending notifications.

## Goal

Replace every home-services estimate anchor with one bilingual, mobile-first
modal. Keep essential contact information required, make job details and photos
optional, mock the complete flow on marketing preview URLs, and make demo/live
tenant submissions persist and notify the owner independently by text and email.

## Interaction design

Every estimate entry point opens the same modal:

- hero CTA;
- desktop and mobile navigation CTA;
- service-card CTA, with that service preselected;
- mobile action bar; and
- the compact estimate panel near the bottom of the homepage.

The existing full-width inline form becomes a concise bilingual CTA panel. It
does not contain a second form implementation.

The modal uses two short stages:

1. **Contact and service**
   - Name: required.
   - Mobile number: required.
   - Service: required and preselected when opened from a service card.
   - City or ZIP: required.
2. **Helpful details**
   - Job description: optional.
   - Up to five photos: optional.
   - Preferred response: defaults to SMS and offers Call and WhatsApp.

Users may move backward without losing values. Submission validates required
fields together and focuses the first invalid input. The modal traps focus,
restores focus to its trigger when closed, supports Escape, has a labeled close
button, and remains usable at 375 px. Closing and reopening after a completed
submission resets the form; closing an unfinished form preserves it during the
current page visit.

All labels, validation, progress text, optional markers, buttons, and success
messages are available in English and Spanish through the existing message
catalogs.

## Rendering architecture

`HomeServicesTemplate` owns the estimate-modal state so all child CTAs share one
controller. The controller stores whether the modal is open and an optional
preselected service name. Child components receive an `onEstimate(service?)`
callback instead of building fragment URLs.

`HomeServicesEstimateModal` owns dialog accessibility and stage navigation.
`HomeServicesEstimateForm` owns fields, validation display, photo selection, and
submission. The form receives a delivery mode:

- `preview_mock` for `/preview/[slug]`; or
- `tenant` for demo and live tenant-domain rendering.

The marketing `PreviewClient` passes `preview_mock`. Tenant `SiteClient` passes
`tenant`; a demo is a real tenant and therefore uses the real API. The browser
must not infer delivery mode from hostname.

## Preview behavior

Marketing previews perform the same client-side required-field and photo
validation as tenant sites. On submit they wait briefly, show a bilingual sample
success state, and do not call `/api/estimate`, insert database rows, upload
photos, or send notifications.

The success message explicitly identifies the result as a preview so the user
does not believe a contractor was contacted.

## Tenant submission and persistence

Demo and live tenant sites post to `/api/estimate`. Tenant identity continues to
come exclusively from the request Host through `resolveTenantByHost`; no client
payload may supply `tenant_id` or a notification destination.

The existing `estimate_requests` row remains the durable source of truth.
Required database fields remain non-null by storing an empty string for an
omitted description. Photos remain optional and use the existing private bucket,
validation, and signed-link flow.

The API loads the preview configuration and tenant notification fields in one
tenant-scoped flow. SMS/WhatsApp configuration continues to come from
`home_services_config.notification`. Email selection is:

1. trimmed `tenant.email`, when present;
2. otherwise trimmed `tenant.admin_email`, when present;
3. otherwise no email attempt.

No owner email or phone destination is accepted from the public form.

## Notification delivery

After persistence and optional photo upload, the API constructs one normalized
estimate notification payload containing business name, customer name and phone,
service, location, optional description, response preference, and signed photo
links.

Text and email are attempted independently and awaited before the serverless
handler returns:

- Text uses the configured SMS or WhatsApp destination and preserves the existing
  WhatsApp-to-SMS fallback.
- Email uses Resend and the selected owner email. It presents a scannable summary
  and makes the customer phone number easy to use for follow-up.

The request is successful once the lead is stored. A failure in either delivery
channel does not discard the lead and does not show the customer a false failure.
If both destinations are missing before persistence, the API returns
`estimate_unavailable`; a tenant must have at least one real delivery destination.

## Delivery diagnostics

The current single notification state cannot accurately represent independent
text and email results. Add channel-specific fields to `estimate_requests`:

- `text_notification_state`: `not_configured`, `pending`, `sent`, or `failed`;
- `text_provider_message_id` and `text_provider_error`;
- `email_notification_state`: the same state set;
- `email_provider_message_id` and `email_provider_error`;
- `email_notification_destination`.

Existing notification columns remain temporarily populated for backward
compatibility with current founder diagnostics and resend behavior. Founder UI
will display both channel outcomes. Text resend retries only text; email resend
retries only email. A signed photo link is regenerated for each retry.

## Error handling and safety

- Honeypot processing remains before rate limiting.
- Existing tenant/IP rate limits remain in place.
- Required values retain current length and phone normalization rules.
- Description becomes optional but keeps its maximum length when provided.
- Photos remain limited to five, 8 MB each, 25 MB total, with signature checks.
- Customer-visible success follows durable persistence, not notification success.
- Database insertion failure returns a server error and no success state.
- Partial photo upload shows the existing non-blocking warning.
- Provider errors are logged without exposing credentials or internal messages.
- Email content escapes customer-supplied text and does not embed private images.

## Testing

Pure and contract tests cover:

- optional description and photos;
- required name, phone, service, and city/ZIP;
- SMS as the default response preference;
- service preselection from cards;
- every CTA opening the shared modal;
- modal focus, Escape, close, and mobile constraints;
- bilingual labels and preview success copy;
- preview mode making no network request;
- tenant mode calling the estimate API;
- Host-derived tenant resolution;
- email preference from `tenant.email` to `tenant.admin_email`;
- independent text and email success/failure combinations;
- success after persistence when one or both provider attempts fail;
- unavailable response when neither destination exists;
- channel-specific founder diagnostics and retry behavior; and
- strict TypeScript plus existing home-services regression tests.

## Out of scope

- Customer email confirmation.
- Instant pricing or quote calculation.
- Contractor replies inside SiteForOwners.
- A customer-visible lead-status tracker.
- Marketing preview persistence or notification delivery.
- Changing stylist booking and contact flows.
