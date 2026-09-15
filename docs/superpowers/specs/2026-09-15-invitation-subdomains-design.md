# Invitation Subdomains Design

## Goal

Give every invitation an optional, clean, invitation-specific public address such as `https://mercy-john.siteforowners.com/`. The subdomain opens one invitation directly and remains compatible with the existing `https://www.siteforowners.com/invite/<slug>` URL.

## Product Decisions

- A subdomain belongs to one invitation, not to an invitation owner account.
- The default label is generated from the invitation title or honoree names. A founder can edit it before saving.
- A future invitation owned by the same celebrant receives its own subdomain.
- Subdomains are optional. Existing invitation links continue to work whether or not a subdomain is assigned.
- Only a founder can assign or change an invitation subdomain. Celebrants can view and copy the resulting public link from their management portal but cannot rename it.
- Changing a subdomain intentionally invalidates the previous subdomain. The stable `/invite/<slug>` URL remains available as a fallback.

## URL Behavior

For an invitation whose internal slug is `mercy-john-lx9cwn` and whose public subdomain is `mercy-john`:

- `https://mercy-john.siteforowners.com/` renders the same public invitation as `/invite/mercy-john-lx9cwn`.
- The browser keeps the clean subdomain URL; routing uses an internal rewrite, not an external redirect.
- Draft, offline, and expired invitations retain the existing unavailable behavior. The middleware does not expose invitation details when an invitation is unavailable.
- Unknown subdomains return the existing not-found experience.
- Existing business-site subdomains continue to route exactly as they do now.
- API requests remain on the invitation hostname. Existing same-origin checks, RSVP submission, passcode verification, and media requests therefore continue to work without cross-origin exceptions.
- The invitation's canonical metadata and newly generated share links prefer the subdomain URL when one is assigned. The legacy URL remains functional for previously distributed links.

Only the root path is the new public entry point. This feature does not create an invitation microsite with multiple public routes and does not relocate the owner portal. Owner authentication remains at `https://www.siteforowners.com/invitations/login`.

## Shared Subdomain Registry

Business websites and invitations share the `*.siteforowners.com` namespace. A new `platform_subdomains` table is the authoritative reservation registry so two products cannot claim the same label.

Each reservation contains:

- `label`, the normalized DNS label and primary key;
- exactly one resource reference: `tenant_id` or `invitation_event_id`;
- timestamps for operational inspection.

The migration backfills every existing non-null `tenants.subdomain`, adds nullable `invitation_events.public_subdomain`, and installs database trigger functions that atomically reserve, rename, and release labels when either source row changes. Database constraints enforce one resource per reservation and one reservation per resource. Deleting an invitation releases its reservation; clearing or changing a label also releases the previous value within the same transaction.

The registry prevents races that application-only availability checks cannot prevent. Existing unique constraints on each source table remain useful local safeguards.

## Naming and Validation

The shared normalizer produces lowercase DNS-safe labels containing only `a-z`, `0-9`, and internal hyphens. Labels must:

- contain between 1 and 40 characters;
- start and end with an alphanumeric character;
- avoid consecutive or leading/trailing hyphens after normalization;
- not be in the platform-reserved set: `www`, `api`, `admin`, `app`, `mail`, `support`, `help`, `status`, `static`, `assets`, `cdn`, `dashboard`, `invitations`, `invite`, `login`, or `preview`.

The founder editor suggests the first available value: the normalized base, followed by `-2`, `-3`, and so on when necessary. Availability feedback is advisory; the database reservation remains the final authority and returns a clear conflict response if another request claims the value first.

## Routing Architecture

The middleware keeps custom business domains as its first routing rule. For a `*.siteforowners.com` hostname, it resolves the first label through `platform_subdomains`:

- a tenant reservation follows the current tenant publication/subscription gating and rewrites to `/site/<preview_slug>`;
- an invitation reservation loads only the event slug needed for routing and rewrites `/` to `/invite/<event_slug>`;
- no reservation rewrites to `/not-found` with no-store caching.

Local development supports `<label>.localhost:<port>` through the same label extraction already used for tenant subdomains. Vercel preview deployment hostnames remain root-domain requests and do not attempt subdomain routing.

The routing code is split into small helpers for hostname classification and route-target selection so tenant behavior and invitation behavior can be tested without invoking the full Next.js middleware stack.

## Founder and Owner Interfaces

The founder invitation editor adds a “Public subdomain” field near the existing share-link controls. It shows the `.siteforowners.com` suffix, validates while editing, checks availability, and saves through an authenticated founder route. A successful save refreshes all displayed share links.

The celebrant management view displays the preferred public link with a copy action. It remains read-only for celebrants. If no subdomain has been assigned, it displays the existing `/invite/<slug>` link.

Invitation creation suggests a label but does not silently reserve or publish it until the founder submits the creation form. Existing invitations are not assigned domains automatically.

## Data and Request Flow

1. The founder enters or accepts a suggested label.
2. The client normalizes it and requests an authenticated availability check.
3. Saving updates `invitation_events.public_subdomain`.
4. A database trigger atomically updates `platform_subdomains`; a collision aborts the update.
5. The API maps a collision to a field-level “subdomain already in use” response and suggests the next available label.
6. A guest visits the clean hostname.
7. Middleware resolves the reservation and internally rewrites the root request to the existing public invitation page.
8. The public page remains responsible for publication, passcode, RSVP deadline, expiration, and offline rules.

## Error Handling

- Invalid and reserved labels are rejected before database access and repeated server-side.
- Availability lookup failure does not report a label as available; the editor asks the founder to retry.
- Reservation conflicts return HTTP 409 with a field-level error and an available suggestion.
- Unknown, released, or malformed subdomains render not found.
- A reservation whose target row is unexpectedly missing renders not found and logs the resource identifiers without guest data.
- Middleware database failures fail closed for non-root hostnames by rendering not found with `Cache-Control: no-store, must-revalidate`.
- Changing or removing a subdomain requires an explicit save; no background process mutates public URLs.

## Deployment

The existing application already routes tenant wildcard subdomains, so this feature reuses the current wildcard DNS/Vercel domain configuration. Deployment still includes a production verification that an arbitrary configured invitation label reaches the application; if wildcard configuration differs between environments, DNS/Vercel configuration must be corrected before distributing the new link.

The database migration must be applied before deploying middleware that queries `platform_subdomains`. The safe order is migration first, application deployment second, then assign an invitation subdomain through the founder editor.

## Testing

Automated coverage includes:

- normalization, reserved-name rejection, length limits, and numbered alternatives;
- migration contract tests for registry constraints, tenant backfill, and synchronization triggers;
- cross-product collision tests for tenant versus invitation labels;
- authenticated availability and update routes, including 400, 401, 403, 409, and success cases;
- middleware route selection for root domain, Vercel previews, tenant subdomains, invitation subdomains, unknown labels, custom business domains, and local development hosts;
- public metadata/share-link selection with and without `public_subdomain`;
- founder editable controls and celebrant read-only/copy behavior;
- regression tests proving the legacy `/invite/<slug>` route, RSVP, passcode, invitation status gating, and tenant subdomain routing still work.

Production smoke testing verifies the clean root URL, an RSVP submission, an unavailable invitation, the legacy URL, a current business subdomain, and the celebrant portal's displayed share link.

## Out of Scope

- Custom domains owned by celebrants.
- A celebrant landing page listing several invitations.
- Moving owner login or management pages onto invitation subdomains.
- Redirect history or aliases after a subdomain is renamed.
- Automatically assigning subdomains to existing invitations.
