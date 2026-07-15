# /request-site Dedicated Page — Design

**Date:** 2026-07-14
**Branch:** `feat/request-site-page`

## Goal

Move the request-a-preview form off the homepage (`/#request-site` section) onto a
dedicated, polished landing page at `https://www.siteforowners.com/request-site`, and
point all existing CTAs at it. No backend changes.

## Decisions (confirmed with founder)

- Homepage section is **removed entirely**; all CTAs link out to `/request-site`.
- Page is a **polished single-page form** (no multi-step wizard, no preview-wizard tie-in).
- **Form fields unchanged:** business name, email, phone, address (optional),
  business type (Braids / Locs / Haircuts / Nails / Salon / Outdoor–home services).
- Same `POST /api/marketing-leads` endpoint and payload.

## Changes

### New route: `src/app/(marketing)/request-site/page.tsx`

Server component following the `/demo` page pattern:

- `metadata`: title "Request your website — SiteForOwners", description, and explicit
  `alternates.canonical: "/request-site"` plus `openGraph.url` (root layout otherwise
  canonicalizes every page to `/`).
- Renders `Nav`, the page content, and `Footer`.

### Page content (client component `request-site/_components/RequestSitePageContent.tsx`)

Refactor of the current `RequestSiteForm` section into a standalone landing page,
keeping the warm-cream palette, Fraunces serif headline, and `useFadeUp` motion:

- Compact hero: eyebrow, headline ("Tell me the basics. I'll build the preview."),
  one-line subhead, trust cues (free preview, no commitment, ~2 minutes).
- Desktop: two columns — left: what-happens-next as numbered visual steps + reassurance;
  right: the form card. Mobile (375px-first): stacked, form after the hero.
- Inline success/error states preserved.

`_components/RequestSiteForm.tsx` (homepage section) is deleted.

### Link updates (`#request-site` → `/request-site`)

- `Nav.tsx` CTA button; also `NAV_LINKS` anchors become `/#examples`, `/#pricing`
  so Nav works on subpages (anchors alone are dead off the homepage).
- `Hero.tsx`, `Pricing.tsx`, `FinalCTA.tsx` CTAs.
- `(marketing)/page.tsx` drops the `RequestSiteForm` section.

Old `/#request-site` links degrade gracefully (fragment never reaches the server;
visitors land on the homepage).

## Out of scope

- API/table changes, new fields, thank-you route, preview-wizard prefill
  (tracked separately as marketing-lead-requests).

## Verification

- `tsc --noEmit`, `next lint`, `next build`.
- Manual render check of `/request-site` (desktop + 375px), submit success/error,
  and all four CTAs navigating.
