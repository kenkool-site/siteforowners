# InviteSpot Marketing Site Redesign — Design Spec

## Goal

Redesign the InviteSpot marketing/landing page (`https://www.invitespot.app/`, served by `src/app/invitespot/page.tsx`) so it actually shows off what the product does — real screenshots of an invitation page and a guest photo gallery, not just descriptive bullet points — and add basic SEO infrastructure so the page is discoverable via Google search.

## Background

The current landing page (`src/app/invitespot/page.tsx` + `src/components/invitespot/InviteSpotLandingContent.tsx`, ~80 lines) is a single scrolling page: header, optional referral banner, hero (text only), a 3-item "what you get" grid (address/RSVPs/photos — Memories is one bullet among three), a 3-step "how it works," a 3-tier pricing grid, a lead-capture form, and a footer. It has no screenshots or visuals of the product at all, and no dedicated showcase for Memories (the guest photo-sharing feature). There is also no `sitemap.xml` or `robots.txt` anywhere in the app — not for this page, not for siteforowners.com either — so the site currently has zero deliberate Google-crawling support.

## Scope

In scope:
- Restructure the landing page's middle sections to give Invites and Memories each a full, co-equal showcase section with a real product screenshot.
- A visual refresh (new palette + typography direction), not just a content restructure.
- `src/app/sitemap.ts` and `src/app/robots.ts` using Next.js's native metadata-route conventions.
- Bilingual (English/Spanish) content throughout, per this codebase's standing rule — no exceptions.

Out of scope (explicitly deferred, not forgotten):
- Open Graph/Twitter preview image (currently empty `images: []` — a real, separate bug, worth its own small follow-up).
- Structured data (JSON-LD / schema.org markup).
- Splitting the marketing site into multiple pages (per-feature pages, a blog, etc.) — everything stays on the one page.
- Changing the pricing tiers' actual content/numbers — only their visual styling changes to match the refresh.

## Page structure

The page keeps its current section order, with the old 3-bullet "what you get" grid replaced by two full showcase sections:

1. **Header** — logo + "Get started" link. Unchanged.
2. **Referral banner** — shown when a guest arrives via `?from={slug}`. Unchanged (existing `getInvitationReferralDisplayName` lookup, with its existing error-swallowing behavior preserved — a referral lookup hiccup must never break the whole page).
3. **Hero** — headline + subtext + CTA, restyled for the new visual direction; a supporting visual (screenshot or crop) alongside the text rather than text-only.
4. **Invites showcase** *(new)* — real screenshot of an actual invitation page, with copy on what a host gets: a custom-designed page, RSVP tracking, deadline flexibility (including the RSVP-override toggle hosts can use to accept late RSVPs), passcode protection for private events.
5. **Memories showcase** *(new)* — real screenshot of an actual guest photo gallery, with copy on the guest experience: no app to download, photos appear instantly, everyone's photos end up in one shared place, host can moderate.
6. **How it works** — kept as-is (3 steps), still useful context after the two feature showcases.
7. **Pricing** — kept as-is structurally (3 tiers, same content), restyled to match the new visual direction.
8. **Lead form + footer** — unchanged (`InvitespotLeadForm`).

## Visual design direction

A genuine visual refresh, not a restyle-in-place: **Warm & Romantic** — blush, dusty rose, warm cream, soft terracotta accents, replacing today's cream/forest-green palette. Elegant serif headlines (unchanged type choice, Georgia/Times-New-Roman-class serif), clean sans-serif body text. This leans further into the wedding-editorial feel appropriate for the product's primary use case, while the real screenshots (which carry each actual event's own design) supply additional visual variety the flat palette can't.

Representative direction, confirmed via the visual companion:
- Background: warm cream/blush (`#FBF3F0`-class)
- Primary accent: deep dusty rose (`#6B2F3A`-class)
- Secondary accents: terracotta (`#C98A8F`-class), warm tan (`#E8C4A2`-class)
- Headline example: *"Every memory, beautifully shared"*

The implementation plan should finalize an exact token palette (hex values, hover/focus states, accessible contrast ratios against the existing WCAG expectations this codebase already follows) rather than treating the mockup's approximate colors as final.

## Copy direction

- **Hero**: lead with the emotional payoff ("every memory, beautifully shared") rather than a feature list.
- **Invites section**: host-facing benefits — custom design, RSVP tracking, deadline flexibility, passcode protection.
- **Memories section**: guest-facing benefits — no app, instant sharing, everyone's angle in one place.
- Both sections, like every other string on this page today, go through `next-intl` (`invitespot` namespace in `messages/en.json`/`messages/es.json`) — full Spanish copy is required, not optional, per this codebase's bilingual rule.

## Screenshot assets

Real screenshots (not illustrated mockups), captured from a **dedicated demo event** set aside specifically for public marketing use — not a real couple's private event. **The specific demo event (URL/slug) was left undecided during brainstorming and must be confirmed before implementation captures any screenshots** — this is the one open item blocking the start of implementation.

Screenshots are static image files, checked into the repo (e.g. `public/invitespot/invites-showcase.png`, `public/invitespot/memories-showcase.png`) and referenced directly — not rendered dynamically at request time. A marketing page's core visuals shouldn't depend on a live data fetch to render; this also keeps the page simple and fast.

## Component architecture

`InviteSpotLandingContent.tsx` currently holds the entire page body in one ~80-line file. Adding two full showcase sections plus a visual refresh will roughly triple its content, so it should be split into focused section components under `src/components/invitespot/`, matching this codebase's existing convention of small, single-purpose files — for example:

- `InviteSpotHero.tsx`
- `InviteSpotInvitesShowcase.tsx`
- `InviteSpotMemoriesShowcase.tsx`
- `InviteSpotHowItWorks.tsx` (extracted from the existing inline section)
- `InviteSpotPricing.tsx` (extracted from the existing inline section)

`InviteSpotLandingContent.tsx` itself becomes a thin composition of these, same role `PublicInvitation.tsx` plays relative to its own sub-components elsewhere in this codebase. The referral-banner logic and the `InvitespotLeadForm` integration stay exactly as they are today (both already working, not part of this redesign's actual problem).

## SEO

- **`src/app/sitemap.ts`** — Next.js's native `MetadataRoute.Sitemap` convention (distinct from the custom hand-rolled XML route the multi-tenant `/site/[slug]/sitemap` uses — that pattern exists because tenant sites are dynamic and multi-page; `invitespot.app`'s marketing site is a single static page, so the simpler native convention fits). Lists the one canonical URL (`https://www.invitespot.app/`) for now.
- **`src/app/robots.ts`** — Next.js's native `MetadataRoute.Robots` convention: allow all crawlers, point at the sitemap.
- Existing page metadata (`title`, `description`, `alternates.canonical`, `openGraph`, `twitter` in `src/app/invitespot/page.tsx`) is kept as the base structure; only the description/OG copy gets refreshed to match the new hero copy. The empty `openGraph.images`/`twitter.images` arrays are left as-is (explicitly out of scope — noted above as a worthwhile separate follow-up).

## Testing

Extend the existing `src/app/invitespot/page.render.test.tsx` pattern (structural/render assertions against `InviteSpotLandingContent`) to cover: each new section renders with its expected heading/copy, the Invites and Memories showcase sections both render an `<img>`/screenshot element, and the overall section order matches the structure above. No new test infrastructure — this codebase's existing render-test convention (seen throughout `src/app/invite/[slug]/*.render.test.tsx` and sibling files) already covers exactly this shape of component.

## Open items before implementation can start

1. **Demo event selection** — confirm which event (slug/URL) is safe to screenshot publicly, or create one if none exists yet. Implementation cannot capture real screenshots without this.
2. **Exact palette tokens** — the visual companion mockup used approximate hex values; the implementation plan should pin exact, contrast-checked values.
