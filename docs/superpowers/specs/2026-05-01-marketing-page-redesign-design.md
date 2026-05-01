# Marketing Page Redesign — Design Spec

**Date:** 2026-05-01
**Scope:** `src/app/(marketing)/page.tsx` (siteforowners.com homepage). Privacy, Terms, the preview wizard, and all other routes are out of scope.

## Why

The current homepage is generic amber-on-white SaaS. It also has live defects: pricing shows three tiers all priced at $50, the public nav exposes founder-only links (`/prospects`, `/clients`, `/previews`), and "Text us" links to a placeholder phone number. The redesign goal stated by the founder is simple: **"looks generic and just want something nicer to show my products."** Conversion mechanics are out of scope.

## Audience

Small-business owners — salons, barbers, nail shops, restaurants. CLAUDE.md's test still applies: *"Could a 55-year-old Dominican salon owner figure this out without help?"* Mobile-first, designed at 375px first.

## Visual Direction

A two-mood page anchored by a single accent color.

- **Bold Pop** — hero and final CTA. Hot pink background, cream type, oversized heavy sans, black accent buttons. Stops the scroll.
- **Warm Grounded** — every section between. Cream backgrounds (alternating), terracotta eyebrow accents, serif italic headlines, photo-forward. Reads as human, not template.
- **Pink as the through-line** — number pills, CTAs, and active states stay pink in the warm sections so the brand thread holds across both palettes.

### Color tokens

```
pop-pink:       #ff2f8a   (hero / final CTA / accents)
pop-cream:      #fff8ee   (text on pink)
warm-cream-1:   #f4e4d1   (alternating section bg)
warm-cream-2:   #fdf8f0   (alternating section bg)
warm-text:      #3a2418   (primary text on cream)
warm-text-muted:#6b4226   (secondary text)
warm-accent:    #c2410c   (terracotta italics in headlines)
warm-eyebrow:   #a05c2c   (small uppercase labels)
warm-deep:      #1f1611   (footer)
```

### Typography

- Body and Bold Pop hero headlines: existing **Geist** sans (already loaded). Heavy weights (800/900) for hero, regular for body.
- Warm section headlines: **serif italics** for the "your shop" / "no tech talk" / "in one place" emphasis. Use a Google Font pairing (Fraunces or Playfair Display) loaded via `next/font` — the project currently only loads Geist, so this is a net-new font addition.

## Page Structure

```
1. Nav                 (white, clean — admin links removed)
2. Hero                (Bold Pop)
3. How It Works        (Warm — 3 steps)
4. "Right Now"         (Warm — scattered tools)
5. What Customers See  (Warm — live client site + verticals)
6. What You See        (Warm — 4-slide dashboard tour)
7. Pricing             (Warm — single plan, free month)
8. FAQ                 (Warm)
9. Final CTA           (Bold Pop)
10. Footer             (warm-deep)
```

### 1. Nav

- Logo: `Site` + `<span class="text-pop-pink">ForOwners</span>`.
- Visible links: **Examples** (anchors `#examples`), **Pricing** (anchors `#pricing`).
- Primary action: pink pill button, "Build my preview" → `/preview`.
- **Removed from public nav:** `/preview`, `/previews`, `/prospects`, `/clients`. These are founder-only and should not be discoverable on the marketing page. The mobile dropdown is updated accordingly.

### 2. Hero (Bold Pop)

- Background: `pop-pink`. Type: `pop-cream`.
- Eyebrow: `FOR SALONS, BARBERS, NAIL SHOPS`.
- Headline: **"Get booked without the back-and-forth."**
- Subhead: **"We build your website + booking and get you live in 24 hours."**
- CTAs:
  - `Create My Free Preview →` — black pill, links to `/preview`.
  - `Text us` — outlined cream pill, linking to a real WhatsApp/SMS URL. **Required at ship time.** The current page has a broken `wa.me/1XXXXXXXXXX` placeholder; do not ship the redesign with the placeholder still in place. If the real number is not provided by the founder before merge, omit this button entirely rather than shipping another broken link.
- **Showcase:** a phone-frame-ish black-bordered card displaying a real client site preview, slightly tilted (-1.5°). The card cycles through three verticals — Locs, Barber, Nails — on auto-advance every ~4s with click tabs to override. The first cycle uses the actual `letstrylocs.com` preview; the other two use existing previews from those verticals. (The hero swap labels intentionally differ from the broader "What customers see" categories of Salon / Barber / Nail shop — the hero shows three specific sites, the customer-view section shows three category exemplars.)
- **Drop:** the current emoji vertical pill row (💇‍♀️ Hair Salon, etc.) — the showcase swap covers verticals more powerfully.

### 3. How It Works

- Eyebrow: `— How it works —`. Headline: **"Three steps. *No tech talk.*"** (italic on "No tech talk").
- 3 numbered steps with pink number circles:
  1. **We build your site** — "Tell us your business, services, photos. Site ready in 24 hours."
  2. **You approve** — "Look it over. Want a change? Text us. Done same day."
  3. **You start getting bookings** — "Customers find you, book online, you get a text."

### 4. "Right Now" (scattered tools)

- Eyebrow: `— Right now —`. Headline: **"You're juggling *five different things.*"**
- 4-card grid (2x2 on mobile). Each card: tag + value.
  - **Bookings** → Acuity / Booksy / Vagaro
  - **Customers** → Instagram DMs all day
  - **Website** → None or a Linktree
  - **Tracking** → Notebook & memory
- Closing line: "→ One place instead. **Site, booking, and a dashboard you actually like.**"
- This section reframes the "before" away from "you have no website" (often untrue) toward "you have too many tools" (almost always true for the audience).

### 5. What Customers See

- Anchor: `#examples`.
- Eyebrow: `— What customers see —`. Headline: **"A site that *looks like your shop.*"**
- Primary visual: full-bleed phone or browser-frame mockup of the live `letstrylocs.com` site.
- Below: 3 vertical thumbnails — Salon / Barber / Nail shop — each linking to the corresponding live preview where one exists. Where a preview doesn't exist yet, the thumbnail is a styled placeholder.
- Caption strip: "Mobile-first. Bilingual. Yours to own."

### 6. What You See — Dashboard Tour

- Eyebrow: `— What you see —`. Headline: **"Your shop, *in one place.*"** Subhead: "Bookings, services, leads, billing — all in a dashboard that uses your brand color."
- **4-slide carousel.** Auto-advancing every ~4s, paused on hover/focus, with prev/next arrow buttons and a row of dots showing the active slide.
- Slides:
  1. **Home** (pink, letstrylocs) — "See what's happening today." Stat tiles + visitors-this-week chart.
  2. **Schedule** (burgundy, Mariam's) — "Manage your day, set your hours." Day view with bookings + open slots.
  3. **Services** (burgundy, Mariam's) — "Update prices and deposits anytime." Deposit policy block + service list with prices.
  4. **Leads** (purple, TouchedbyDrea) — "Never miss a question." Lead inbox with NEW badges and message previews.
- **Per-client color theming is the differentiator.** The fact that the carousel itself shows three different brand colors (pink, burgundy, purple) is the point — it proves the dashboard adapts. Surface this in the subhead and ideally one inline caption.
- Source artwork: real screenshots from existing tenants (the founder has letstrylocs, Mariam's, and TouchedbyDrea), lightly polished. Avoid invented mockups.

### 7. Pricing

- Anchor: `#pricing`.
- Eyebrow: `— Pricing —`. Headline: **"Try it *free for a month.*"**
- **Single plan card** (replaces the current 3-tier-but-all-$50 section):
  - Top badge: `FREE FOR 1 MONTH` (pink).
  - Price line: `$50/month` after the free month · cancel anytime.
  - Inclusion line: `Site · booking · dashboard · hosting · domain · updates`.
  - CTA: `Start free month` → `/preview`.
  - Footer note: `No card up front · You own your domain`.

### 8. FAQ

Keep the four current questions, add one new last item to address the new pricing model:

1. Do I own my domain?
2. What if I need changes to my site?
3. Do I need to do anything technical?
4. Can I cancel anytime?
5. **What happens after the free month?** — answer copy to be confirmed against the actual Stripe trial flow before merge. The honest framing is something like: "We let you know before charging. If you don't continue, your site pauses — your settings stay in your account so you can restart later." Implementation must verify this matches the real billing behavior in `/api/stripe-webhook` and the trial conversion path.

### 9. Final CTA (Bold Pop)

- Background: `pop-pink`. Type: `pop-cream`.
- Headline: **"Ready to stop missing bookings?"**
- CTA: `Create My Free Preview →` — black pill.
- Subnote: `5 min · No card · Free for 1 month`.

### 10. Footer

- Background: `warm-deep`. One line: `SiteForOwners · Made in Brooklyn · Privacy · Terms · © {year}`.

## Motion

All motion uses **Framer Motion** (already in the stack). Five effects, all of which respect `prefers-reduced-motion` and degrade to no-op or simple fade.

1. **Hero vertical swap** — the showcase card cycles Locs → Barber → Nails on a 4s timer, with `AnimatePresence` cross-fade + small Y-offset. Click a tab to jump and reset the timer. Pause on hover/focus.
2. **Scroll-triggered reveals (site-wide)** — section eyebrows + headlines fade up from y:12 → y:0 as they enter the viewport. Stagger children for the How-It-Works steps and the Right-Now cards. Use Framer Motion `whileInView` with `once: true`.
3. **Scattered → unified** (Right Now section) — when the section enters the viewport, the 4 scattered tool cards animate from their offset positions into a single centered "One place" pink pill via Framer Motion layout animations. Triggered once.
4. **Dashboard counter + bars** (Tour slide 1) — when the Home slide is visible (initial load or carousel returns to it), `113` counts up from 0 over ~800ms, and the visitors bars rise from height 0 in a stagger. Re-trigger when the slide becomes active again after navigation.
5. **Dashboard tour carousel** — auto-advance every 4s; cross-slide via `transform: translateX` on a single track; pause on hover/focus; arrow keys advance when carousel has keyboard focus.

**Dropped motion ideas** — tilt-on-hover (decorative, no product value), client-name marquee (weak when most names are unknown to the visitor).

## File Structure

The current page is a single 316-line `page.tsx`. Split into composable section components for clarity and to keep `page.tsx` a thin shell — past bugs in this codebase have come from large monolith files (cf. CLAUDE.md note about "admin has two surfaces" review-stage misses).

```
src/app/(marketing)/
  page.tsx                   # composes the sections
  _components/
    Nav.tsx
    Hero.tsx
    HeroShowcase.tsx         # the swapping site card
    HowItWorks.tsx
    RightNow.tsx
    CustomerView.tsx
    OwnerDashboardTour.tsx   # the 4-slide carousel
    OwnerDashboardSlides/
      HomeSlide.tsx
      ScheduleSlide.tsx
      ServicesSlide.tsx
      LeadsSlide.tsx
    Pricing.tsx
    FAQ.tsx
    FinalCTA.tsx
    Footer.tsx
```

Each section component is self-contained: takes no props (the page is static), owns its motion, and is independently testable.

## Assets

- `public/marketing/hero/letstrylocs.png` — primary hero showcase (existing live site, captured at mobile width).
- `public/marketing/hero/{barber,nails}.png` — preview screenshots for the hero swap. If the founder doesn't have polished previews for both, fall back to two captures from existing previews of any vertical.
- `public/marketing/customer-view/letstrylocs.png` — full-frame customer-view screenshot.
- `public/marketing/customer-view/{salon,barber,nails}-thumb.png` — vertical thumbnails.
- `public/marketing/dashboard/{home,schedule,services,leads}.png` — the four tour slides. Re-use the screenshots already provided in the brainstorming thread (letstrylocs Home, Mariam's Schedule, Mariam's Services, TouchedbyDrea Leads).

## Accessibility

- Every showcase image has an alt text describing the business and what's shown ("letstrylocs.com — Brooklyn loctician, mobile site with booking").
- The hero swap and dashboard carousel pause on hover/focus and never autoplay when `prefers-reduced-motion: reduce`.
- Carousel controls are real `<button>` elements with `aria-label`s ("Previous slide", "Next slide", "Go to slide 2"). Active dot uses `aria-current="true"`.
- Counter animation is gated on `prefers-reduced-motion` — falls back to the final value rendered statically.
- Color contrast verified at AA: pink/cream and pink/black for the Bold Pop sections; warm-text on warm-cream-1/warm-cream-2 in the body.
- Keyboard: tabbable carousel controls, left/right arrow keys advance when carousel has focus.

## Out of Scope

- **Bilingual marketing copy.** The current marketing page is English-only. Adding `next-intl` here is real work and the founder has not asked for it. Tracked as a future ticket; not part of this redesign.
- **Testimonials.** Confirmed dropped — only one live client today; faking quotes is a trust risk for a skeptical small-biz audience. Add when 2–3 real clients agree to be quoted by name and shop.
- **Backend / database / API / admin / dashboard / auth changes.** Pure frontend redesign of one page.
- **Privacy and Terms pages.**
- **The preview wizard at `/preview`.** It remains the click-target for every CTA but is not redesigned.

## Success Criteria

- Visiting `siteforowners.com` (and `localhost:3000`) renders the new design top-to-bottom on mobile (375px), tablet, and desktop without horizontal scroll or layout breaks.
- The pricing section shows one plan with the free-month framing — the broken three-identical-tiers section is gone.
- Founder-only links (`/prospects`, `/clients`, `/previews`, `/preview` direct admin entry) are not in the public nav.
- The hero swap, scattered-to-unified animation, scroll reveals, dashboard counter, and dashboard carousel all work and respect `prefers-reduced-motion`.
- The dashboard tour visibly demonstrates per-client color theming (pink / burgundy / purple slides).
- Lighthouse mobile performance score does not regress relative to the current page.
