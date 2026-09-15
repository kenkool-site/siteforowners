# Invitation Hosts, Style Guide, Footer, and Sharing Design

## Goal

Improve invitations in four connected areas: turn extracted attire and event colors into editable structured content, allow one co-host full management access, add discreet platform/host links to the public footer, and offer richer reusable cover framing. Shared links should also render the invitation cover in messaging previews when privacy permits.

## Product Decisions

- Each invitation may have one optional co-host in addition to its primary host.
- A co-host has the same event permissions as the primary host, but uses a separate email and PIN.
- Both active hosts receive attending and updated-RSVP email notifications. Declines remain dashboard-only, matching the existing notification policy.
- “Style note” and event color choices are optional structured invitation fields, not prose appended to the welcome description.
- Cover decorations are reusable choices driven by the invitation palette. No client-specific colors or artwork are hardcoded.
- Every public invitation ends with a small “Powered by SiteForOwners” link and a visually secondary “Host sign in” link.
- Published invitations without a passcode use their cover image in Open Graph and Twitter metadata. Private or unavailable invitations never expose their cover through sharing metadata.

## Structured Style Guide

The designed-invitation analysis schema gains two optional facts:

- `styleNote`: short attire or presentation guidance, such as “Glamorous fascinators; matching outfit colors.”
- `eventColors`: an ordered list of `{ name, color }` entries, such as Sage, Ivory, and Petal with six-digit hex colors.

The analyzer is instructed to separate these values from the general event description. It may use visible labels and swatches, but must not invent color names or logistics. The strict normalizer validates names, hex colors, list size, evidence, and confidence. Existing analyses remain readable through schema normalization, while a new analysis uses the expanded schema.

The import review shows style guidance and color swatches independently. The host may select, edit, or reject them before applying. Applying the result fills dedicated optional event fields. The editor also permits manual entry and correction after analysis.

When either field is populated, the public invitation displays a compact “Style Guide” section after event details and before travel/gallery content. Named colors appear as accessible swatches with visible text labels. If both fields are empty, the section is omitted entirely.

## Co-host Accounts and Authorization

A new `invitation_event_hosts` membership table associates invitation owners with events and records `primary` or `cohost` role. It has unique constraints for one membership per owner/event, one primary host per event, and at most one co-host per event. Existing `invitation_events.owner_id` remains during this change for compatibility and is backfilled as the primary membership.

Authorization changes from “event owner ID equals session owner ID” to “active owner has an active membership for this event.” Event listing queries use memberships so a co-host sees the invitation in the same portal and can edit it, manage publication, view/export RSVPs, and manage media.

The primary host or founder can add or replace a co-host by name, email, and separately generated PIN. Email uniqueness continues to apply to invitation-owner accounts. If that email already belongs to an active invitation owner, the existing account is attached and its existing PIN is not overwritten; the UI explains that the co-host should use their existing credentials. Removing the co-host deletes the membership and immediately removes event access without deleting an owner account that may belong to another event.

The event editor exposes the co-host controls near owner access. The generated PIN is shown once after creating a new co-host, following the current primary-owner credential behavior.

## Notifications

RSVP email planning receives the active host email recipients for the event. For attending RSVP creation and RSVP updates, it reserves and sends one owner-audience email per active host. Existing global email notification caps still apply to each actual outbound message, so two hosts consume two email notifications per qualifying RSVP.

The existing event notification-email setting remains the primary host destination. The co-host destination comes from the co-host account email. Duplicate normalized email addresses are removed before reservation. SMS remains single-destination and unchanged. Declining responses do not generate host email or SMS notifications.

Notification records retain individual recipients, delivery state, retry behavior, and idempotency. A failure to notify either host never rolls back the saved RSVP.

## Public Footer

The public invitation adds a restrained footer below invitation content and above the page end:

- “Powered by SiteForOwners” links to the main SiteForOwners home page.
- “Host sign in” links to `https://www.siteforowners.com/invitations/login`.

Both links use the invitation’s muted/text colors with accessible contrast and remain deliberately smaller than guest actions. The central login URL is used even on invitation subdomains, because owner sessions and management routes remain on the main domain.

## Cover Design Options

The editor presents a visual choice among:

- none;
- minimal line;
- double frame;
- botanical corners;
- floral border;
- ornamental frame.

These choices map to the existing design recipe rather than a particular invitation. Botanical, floral, and ornamental treatments use responsive inline SVG/CSS overlays whose colors derive from the recipe accent and supporting palette. Decorative layers are non-interactive, hidden from assistive technology, and placed above the overlay but below invitation text. Mobile variants reduce density and keep the center clear; focal-point controls continue protecting faces in the cover image.

AI analysis may recommend a frame and decoration density from the reference design, but the host’s editor selection always wins. The cover preview in the editor uses the same rendering component as the public invitation.

## Link-preview Images

The public page metadata includes title, description, canonical URL, Open Graph data, and Twitter card data. When an invitation is published, not expired/offline, has no passcode, and has a cover image, metadata references a stable application endpoint for that cover.

The stable endpoint validates the slug and effective public state, downloads the image from the private invitation-media bucket on the server, and streams only the current cover with its verified content type and cache headers. It never accepts an arbitrary storage path. Draft, offline, expired, missing-cover, and passcode invitations return not found, preventing the private bucket or signed URLs from being exposed.

The endpoint URL is absolute and uses the preferred public invitation origin, allowing SMS, WhatsApp, iMessage, and social crawlers to fetch it after a subdomain-root rewrite. When no eligible cover exists, metadata falls back to the existing generic SiteForOwners sharing image.

## Migration and Compatibility

The database migration adds optional style-guide storage and the host membership table, then backfills primary memberships for every existing invitation. It is applied before deploying application code that queries memberships or new columns.

Existing primary-host login, legacy invitation URLs, subdomain URLs, RSVPs, media, and previously saved design recipes continue working. Old reference analyses remain viewable, though rerunning analysis is required to populate structured style fields from an existing designed invitation.

## Error Handling

- Invalid or duplicate co-host email input returns a field-level error.
- Adding an existing owner attaches membership without changing credentials.
- Membership conflicts are handled transactionally and never leave two co-hosts attached.
- Notification recipient lookup failure is logged without exposing contact details and does not affect RSVP persistence.
- Invalid extracted colors or oversized style content are discarded by normalization rather than copied into the event.
- Cover-preview requests fail closed when public eligibility cannot be established.

## Testing

Automated coverage includes:

- analysis parsing and backward compatibility for style notes and labeled colors;
- import review, manual editor controls, and conditional public style-guide rendering;
- migration constraints and primary-membership backfill;
- primary/co-host login, event listing, authorization, add/replace/remove flows, and separate-PIN behavior;
- dual-recipient attending/update emails, decline suppression, deduplication, caps, retries, and provider failure isolation;
- footer rendering and central-domain host-login link;
- every frame option, palette-driven decoration, mobile density, and no-cover behavior;
- Open Graph/Twitter metadata and cover endpoint gating for published, passcode, draft, offline, expired, and missing-cover invitations;
- regressions for existing owner access, public URLs, RSVP submission, and private media handling.

Production smoke testing verifies both hosts can independently sign in and manage the same event, both receive an attending RSVP email, the style guide and selected frame render on mobile, the footer links work from the subdomain, and WhatsApp’s link debugger can fetch the published cover preview.

## Out of Scope

- More than one co-host per invitation.
- Per-host permission levels or read-only roles.
- Co-host SMS destinations.
- Custom uploaded frame artwork or a free-form visual page builder.
- Exposing covers from passcode-protected invitations.
