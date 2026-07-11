# Home-services website vertical

**Date:** 2026-07-11  
**Branch:** `main`  
**Status:** Approved design

## Problem

SiteForOwners currently centers its public templates and onboarding around
stylists. The rendering path includes booking-oriented labels, services,
calendars, products, deposits, and external booking providers. Those concepts do
not fit landscapers, sprinkler technicians, lawn crews, tree-service workers,
fence installers, pressure washers, and similar local service businesses.

These businesses need a simpler outcome:

> When someone searches for the service in a nearby city, the business looks
> legitimate and the customer can call, message, or request a free estimate
> immediately.

Their owners are unlikely to maintain a website or learn a full admin product.
They generally prefer to receive leads and send website updates through text or
WhatsApp.

## Goal

Add a reusable, bilingual `home_services` vertical that:

- presents a professional local-service website;
- prioritizes free estimates, phone calls, SMS, and WhatsApp;
- showcases services, before-and-after work, reviews, and service areas;
- publishes useful city-specific pages for local SEO;
- supports estimate requests with job photos;
- delivers each request directly to the contractor by SMS or WhatsApp; and
- remains managed by the SiteForOwners founder rather than requiring the
  contractor to use a CMS.

The initial preset represents a combined outdoor-services company offering
landscaping, lawn, sprinkler, tree, cleanup, and related services. The same
template must remain configurable for other local trades.

## Product principles

### Message-first ownership

The contractor does not receive a new website editor, lead inbox, or workflow
dashboard. The founder maintains the site. Contractors can send new photos,
service changes, and copy updates to the founder by text or WhatsApp.

Estimate requests go directly to a configured contractor phone number. Internal
lead retention and delivery diagnostics exist for reliability and support, not
as a contractor-facing product.

### Mobile-first conversion

The primary conversion is “Request a Free Estimate.” Call and message actions
remain equally easy to reach. At 375 px, all important content and actions must
work without horizontal scrolling, tiny targets, or an obstructive sticky bar.

### Full bilingual publishing

English and Spanish are complete content variants, including navigation,
sections, service-area pages, form labels, validation, confirmation messages,
and metadata. Spanish pages use crawlable URLs; localization is not limited to a
client-side text toggle.

### Local relevance without SEO spam

Every published service-area page needs useful, city-specific content. The
system must not create dozens of indexable pages that only replace one city
name.

## Scope

### In scope

- A new `home_services` business type.
- One dedicated, reusable home-services template.
- A “Neighborhood Professional” default visual direction.
- English and Spanish homepage routes.
- Dedicated English and Spanish service-area pages.
- Services, trust points, project gallery, reviews, and service-area sections.
- Call, SMS, WhatsApp, and free-estimate actions.
- Estimate requests with up to five optional job photos.
- Direct owner notification by configured SMS or WhatsApp destination.
- Private internal lead retention and delivery diagnostics.
- A focused founder-only editing experience for this vertical.
- LocalBusiness/Service structured data, canonical links, `hreflang`, and
  sitemap support.
- An initial combined outdoor-services preset.

### Out of scope

- Online booking, calendars, appointment slots, deposits, or booking providers.
- Service prices, instant quote calculators, or customer payments.
- A contractor CMS, lead inbox, CRM pipeline, or task manager.
- Two-way chat inside SiteForOwners.
- Automated Google Business Profile management.
- Automated responses to customer messages.
- A public street address or map for home-based service businesses.
- Multiple home-service visual templates in the first release.
- Bulk publishing of thin city-name substitution pages.

## Chosen architecture

Use a dedicated home-services vertical while sharing stable platform
infrastructure.

Existing stylist templates and booking behavior remain unchanged. Public
rendering selects the dedicated home-services component when
`business_type === "home_services"`. The home-services path never renders
booking components and does not depend on booking-mode configuration.

Reusable infrastructure includes:

- tenant and custom-domain resolution;
- theme and brand-color helpers;
- Supabase clients, storage, and RLS conventions;
- existing review and social-link data where compatible;
- shared image and accessibility helpers;
- `next-intl` message catalogs;
- analytics hooks; and
- internal founder authentication.

Home-services components live under
`src/components/templates/home-services/`. The boundary owns its navigation,
homepage composition, mobile action bar, service cards, gallery presentation,
service-area links, and estimate form. Components should be small enough to test
and change independently.

Add a `TemplateRouter` as the single template entry point used by live sites,
previews, comparisons, and the founder editor. It dispatches `home_services` to
`HomeServicesTemplate` and delegates every existing business type to the
unchanged `TemplateOrchestrator`. This avoids threading home-service
conditionals or booking props through the stylist template cases.

## Public website design

### Visual direction

The approved “Neighborhood Professional” direction uses:

- navy for authority and readable headings;
- fresh green for estimate and trust actions;
- white and pale blue/green surfaces for clarity;
- generous spacing and clear cards;
- restrained motion; and
- friendly, direct language rather than luxury or stylist vocabulary.

The defaults must be theme tokens, not hardcoded branding. A tenant can replace
the logo, colors, photos, copy, services, and locations while preserving
accessible contrast and the overall hierarchy.

### Homepage order

1. **Navigation**
   - Business logo/name.
   - Services, Work, Reviews, and Service Areas anchors where sections exist.
   - English/Spanish switch.
   - Free Estimate action.

2. **Hero**
   - City-focused service headline.
   - Short credibility statement.
   - Free Estimate, Call, and WhatsApp/SMS actions.
   - Strong outdoor-work image or video when available.

3. **Trust strip**
   - Configurable proof such as free estimates, insured crews, reliable
     service, residential/commercial work, bilingual service, or years local.

4. **Services**
   - Short, scannable service cards.
   - No booking controls or prices.
   - Each card can preselect its service in the estimate form.

5. **Project gallery**
   - Before-and-after pairs where both images exist.
   - Single completed-work images remain valid.
   - Optional service and service-area captions.
   - A project linked to a service area may appear on that city page.

6. **Why choose us**
   - Brief, configurable proof points.
   - Avoid long generic marketing paragraphs.

7. **Reviews**
   - Google-derived or manually supplied reviews.
   - Overall rating when available.

8. **Service areas**
   - Active cities listed clearly.
   - Each published city links to its dedicated page.

9. **Estimate form**
   - Short form with optional photos.
   - Clear privacy and response expectations.

10. **Footer**
    - Business name, service areas, phone, message action, hours, and social
      links.
    - No private street address.

### Mobile actions

A compact sticky action bar provides Call, Message, and Free Estimate. It must:

- respect safe-area insets;
- use at least 44 px targets;
- not cover the form submit button or footer content;
- use the configured message channel;
- disappear or reduce prominence when the estimate form is actively in view if
  necessary to avoid obstruction.

### Conditional sections

- No gallery images: hide the gallery.
- No reviews: hide reviews and rating.
- No service areas published: show a plain configurable coverage statement
  without dead links.
- No WhatsApp configuration: use SMS when configured, otherwise Call.
- No hero media: render a polished color/texture treatment without a broken
  placeholder.

## Localization and routing

Tenant-domain public URLs use:

- `/` for the English homepage;
- `/es` for the Spanish homepage;
- `/service-areas/{area-slug}` for an English city page; and
- `/es/service-areas/{area-slug}` for a Spanish city page.

Internal Next.js routes remain under `/site/[slug]/...` after middleware tenant
resolution. Route components should share data loaders and render helpers to
avoid copying homepage or metadata logic.

The visible language switch links to the corresponding URL, preserving the
current service-area slug when a translated page exists. It does not only toggle
React state.

English and Spanish pages include reciprocal `hreflang` entries. English is the
default locale and receives `x-default` where appropriate. Each page has a
self-referencing canonical URL.

Client-facing interface strings live in `messages/en.json` and
`messages/es.json`. Tenant-specific content remains in the tenant data model.

## Service-area pages

Each service area stores:

- city;
- state/region;
- URL slug;
- English and Spanish headline;
- English and Spanish introduction/body;
- services available in that area;
- optional nearby areas;
- optional linked projects and reviews;
- locale-specific SEO title and description; and
- independent English and Spanish publish state.

A published page contains:

- city-specific hero copy;
- relevant available services;
- local project examples when available;
- local review/proof when available;
- nearby service areas;
- Call, Message, and Free Estimate actions; and
- no private origin address.

A locale may be published only when its required headline, useful local body
content, and metadata exist. Unpublished or incomplete locale pages must not
enter sitemaps and should return not found rather than an indexable placeholder.

## Local SEO

The homepage and area pages provide:

- unique page titles and descriptions;
- canonical URLs;
- reciprocal English/Spanish `hreflang`;
- Open Graph metadata;
- sitemap entries for every published locale;
- `LocalBusiness` structured data without a street address;
- `areaServed` data derived from active areas;
- a service/offer catalog when sufficient service data exists; and
- consistent business name and phone information.

Structured data must omit properties that are unknown rather than inventing
them. The existing local-business helper should be extended safely for
`home_services`; stylist schema behavior must remain unchanged.

## Estimate request

### Fields

- Name, required.
- Mobile number, required.
- Service needed, required.
- City or job address, required and stored privately.
- Short job description, required.
- Preferred response: call, SMS, or WhatsApp, required.
- Up to five optional job photos.
- Locale and originating page, captured by the server.

The form may be prefilled from a service card, gallery project, or service-area
page. Prefill never bypasses server validation.

### Submission flow

1. The browser submits multipart form data to a public estimate endpoint.
2. The server resolves the tenant from the trusted host/slug context. It never
   trusts a client-supplied `tenant_id`.
3. The server validates text fields and photo count, type, and size.
4. The server inserts the estimate request with notification state `pending`.
5. Valid photos are written to a private storage bucket and successful uploads
   receive `estimate_photos` records.
6. A notification adapter sends one message to the tenant's configured SMS or
   WhatsApp destination.
7. The message contains the customer details, service, private job location,
   notes, preferred response method, and secure photo links.
8. The request records provider message ID, delivery channel, and delivery
   state.
9. The customer receives an on-page confirmation with direct Call and Message
   actions.

The customer-facing success state confirms receipt; it must not promise a
specific response time unless the tenant configured one.

### Notification channel

Each tenant configures:

- `sms` or `whatsapp`;
- destination phone number; and
- optional SMS fallback number.

WhatsApp delivery depends on a configured provider sender and any required
template approval. If WhatsApp cannot be enabled for a tenant, the founder uses
SMS. The website's direct WhatsApp customer action may still use a standard
`wa.me` link independently of server-side notification support.

This release sends a one-way owner notification. It does not ingest replies.

### Photos

- Maximum: five.
- Allowed formats: JPEG, PNG, and WebP.
- Maximum size: 8 MB per image and 25 MB total.
- Storage is private and tenant-scoped.
- Outbound messages contain signed links rather than public bucket URLs.
- Signed links expire after 14 days. The founder can resend fresh links from
  internal support tooling if needed.
- Image metadata and filenames must not become executable content or trusted
  display HTML.

If one photo fails validation, the form identifies it before submission. If a
storage failure occurs after submission, the lead remains saved, the owner
message includes every successfully stored photo, and the localized confirmation
warns the customer that some photos were not attached. The confirmation offers
the direct Message action so the customer can send the missing photos without
re-entering the request.

### Abuse protection

The endpoint includes:

- a honeypot field;
- a baseline limit of five submissions per tenant and source IP per hour, kept
  behind a configurable limiter;
- field limits of 100 characters for name, 32 for phone, 120 for service, 240
  for location, and 2,000 for description;
- normalized phone validation;
- MIME and file-signature checks;
- no trust in browser-provided filenames or content types; and
- safe message escaping.

CAPTCHA is deferred unless real abuse requires it.

## Data model

All client data follows project conventions: UUID keys, `tenant_id`, timestamps,
foreign keys, indexes, and RLS.

### `home_service_areas`

Stores city identity, slug, localized content and metadata, service references,
nearby-area references, and per-locale publish state.

Required constraints:

- unique `(tenant_id, slug)`;
- tenant-scoped indexes for published lookups;
- no anonymous direct writes.

### `estimate_requests`

Stores customer fields, source locale/path, configured destination snapshot,
notification provider/channel/state, provider message ID, and timestamps.

Public requests insert through a server endpoint using a server-resolved tenant.
The browser does not receive broad table access.

### `estimate_photos`

Stores request relationship, tenant, private storage path, normalized media
type, size, and timestamps.

### Home-services configuration

Small presentation-oriented data can live in a typed home-services
configuration associated with the preview/tenant:

- trust points;
- project gallery entries;
- why-us points;
- coverage summary;
- notification preference;
- direct message links;
- response-time copy; and
- section visibility/order where supported.

Expose this object through a validated `HomeServicesConfig` TypeScript type
rather than untyped JSON access.

## Founder-only management

When the tenant is `home_services`, the founder editor shows a focused
home-services form rather than stylist booking and product settings.

The founder can manage:

- business identity and contact methods;
- notification destination/channel;
- English and Spanish homepage copy;
- services;
- trust and why-us points;
- service areas and locale publish state;
- gallery projects and captions;
- reviews;
- hours and social links;
- logo, hero media, and theme; and
- visibility of optional sections.

The editor must not show:

- calendars;
- booking providers or booking modes;
- deposits;
- products;
- appointment durations;
- booking policies; or
- contractor CRM controls.

This is internal tooling. No new contractor-facing CMS is introduced.

## Initial outdoor-services preset

The preset should include editable examples such as:

- sprinkler installation and repair;
- lawn mowing and maintenance;
- sod/grass installation;
- landscaping;
- tree trimming;
- yard cleanup;
- mulching; and
- seasonal maintenance.

The preset uses fictional business information and replaceable stock imagery.
It must not imply licenses, insurance, years in business, ratings, or customer
reviews that were not configured.

## Error handling

- Missing home-services configuration renders safe defaults, not stylist copy.
- Missing notification configuration blocks publication of the estimate form
  or changes it to direct call/message actions; it must not silently accept
  undeliverable leads.
- Message failure leaves the saved lead intact and marks delivery failed for
  founder attention.
- A provider timeout yields an accepted confirmation only after the lead is
  safely stored.
- Invalid or oversized photos return localized field-level errors.
- Missing Spanish tenant content prevents Spanish publication rather than
  exposing mixed-language pages.
- Missing service-area slugs return not found.
- Duplicate area slugs return a clear founder-editor error.
- Direct Call/Message actions use normalized, validated phone destinations.

## Testing

### Unit tests

- Business-type parsing accepts `home_services`.
- Vertical dispatch selects the home-services template.
- Home-services rendering never includes booking labels or components.
- Theme defaults meet contrast requirements.
- Phone, SMS, WhatsApp, and locale URL builders normalize safely.
- Estimate payload validation covers required fields and limits.
- Photo validation covers count, size, MIME, and file signatures.
- Notification message formatting escapes untrusted content.
- Service-area publish eligibility requires sufficient locale content.
- Metadata and structured-data builders omit private addresses.

### Integration tests

- Tenant resolution derives the correct tenant without trusting form
  `tenant_id`.
- Estimate submission stores tenant-scoped request and photo rows.
- SMS notification success records provider details.
- WhatsApp success records provider details.
- Provider failure retains the lead and marks delivery failed.
- Rate limiting and honeypot submissions are rejected safely.
- English and Spanish area routes load only published locale content.
- Sitemap output contains only published locale URLs.
- Existing stylist template and booking routes remain unchanged.

### Browser tests

At desktop and 375 px mobile widths:

- homepage sections render in the approved order;
- Call, Message, and Free Estimate actions work;
- sticky actions do not obscure content;
- service and project actions prefill the estimate form;
- up to five photos can be added and removed;
- localized validation and success states render in English and Spanish;
- language switching preserves matching area pages;
- private business address never appears; and
- no booking UI appears anywhere in the home-services vertical.

### Manual verification

- Deliver a real test SMS to an approved test number.
- Deliver a real test WhatsApp notification when provider credentials and
  templates are available.
- Open signed photo links from a phone.
- Verify metadata, canonical links, `hreflang`, sitemap, and structured data on
  a preview tenant.
- Review the site with an outdoor-service owner or comparable nontechnical user
  for clarity.

## Rollout

1. Add schema and typed domain models.
2. Add the vertical dispatch and public template with fictional preset data.
3. Add founder editing for home-services content.
4. Add estimate storage, private photos, and SMS delivery.
5. Add WhatsApp delivery behind configuration.
6. Add localized service-area routes and SEO output.
7. Create one pilot tenant and test on a real mobile device.
8. Publish only after notification delivery and both locale paths pass.

SMS is the dependable first delivery path. WhatsApp server notifications become
available per tenant only after provider setup is confirmed; direct customer
WhatsApp links do not need to wait for that step.

## Success criteria

- A founder can launch a bilingual outdoor-services site without configuring
  any booking feature.
- A customer can understand services and request an estimate from a 375 px
  phone.
- The contractor receives the complete request by configured message without
  logging into SiteForOwners.
- Submitted leads survive notification-provider failures.
- English and Spanish city pages are independently crawlable and correctly
  linked.
- No private business street address is public.
- Existing stylist sites and booking flows continue to behave as before.
