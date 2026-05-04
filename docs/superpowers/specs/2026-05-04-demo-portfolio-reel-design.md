# /demo Portfolio Reel Design

## Purpose

`/demo` is the QR destination for the founder's personal business card. Visitors are likely prospects who just met the founder, scanned the card, and need to quickly understand the quality of Site For Owners work.

The page should feel like a luxury/editorial beauty portfolio reel, not a generic SaaS landing page. Its job is to showcase polished customer-facing sites and booking experiences first, then prove that owner tools exist behind the scenes, and finally invite interested businesses to submit their contact details.

## Audience

Primary audience:

- Beauty and appointment-based service owners.
- Especially nails, hair, locs, lashes, brows, barbers, grooming, spa, and skincare businesses.
- Mobile-first visitors coming from a business-card QR code.

Secondary audience:

- Prospects who want to quickly see what Site For Owners builds before sharing their information.
- Prospects comparing Site For Owners to generic link-in-bio pages, booking apps, or DIY sites.

## Success Criteria

- A mobile visitor understands within a few seconds that Site For Owners builds premium customer-facing websites with booking.
- The page visually proves range across beauty businesses without feeling scattered.
- The owner dashboard is visible as supporting proof, but it does not distract from the customer-facing portfolio.
- The lead form is obvious and easy to complete after the showcase.
- The page remains performant and accessible despite video usage.

## Design Direction

Tone: luxury/editorial beauty portfolio.

The page should use a darker, more premium presentation than the main marketing homepage while still feeling related to the existing Site For Owners brand. The visual language should feel like a lookbook: large media, strong type, confident spacing, and selective pink/cream brand accents.

Avoid a generic "AI startup" look. The page should feel made for beauty businesses and QR-scan browsing: dramatic, visual, quick to scan, and conversion-focused.

## Page Structure

### 1. Hero: Portfolio Reel

The hero introduces the promise and immediately shows the work.

Content:

- Small brand mark or compact Site For Owners identity.
- Headline: "Beauty websites that make clients book."
- Supporting line: "Custom sites, booking, and owner tools for beauty businesses."
- Primary CTA: "Like this? Request yours."
- Secondary link: "See examples" or scroll anchor into the showcase.
- Large video-led visual reel.

Video behavior:

- Use a short muted looping MP4/WebM as the main hero media when available.
- The reel should show customer-facing moments first: home page, services, choosing a service, booking, confirmation.
- Owner dashboard moments should appear as quick supporting flashes, not the dominant scene.
- Include a poster image for load and reduced-motion fallback.
- Use `playsInline`, `muted`, `loop`, and avoid requiring sound.
- Respect reduced motion by showing the poster or a still framed preview.

### 2. Beauty Portfolio Grid

This is the core proof section.

Show five polished vertical cards in a beauty-first order:

- Nails
- Locs / hair
- Lashes / brows
- Barber / grooming
- Spa / skincare

Each card should emphasize the customer-facing site:

- Large preview image or short loop.
- Business category label.
- One concrete customer action, such as "Choose service", "Book appointment", or "View services".
- A small "owner dashboard included" proof badge or mini panel.

The cards should look like a curated portfolio, not a uniform feature grid. They can vary in color, cropping, and composition while sharing one editorial system.

### 3. Customer Journey Strip

A short section turns the portfolio visuals into a simple product story:

1. Customers land on a beautiful site.
2. They choose a service and book.
3. The owner manages bookings, services, leads, and updates.

This section should be compact. It exists to make the portfolio understandable, not to become a full product explainer.

### 4. Owner Dashboard Proof

Show the admin experience as a supporting section.

Focus areas:

- Schedule / bookings.
- Leads.
- Services.
- Business updates.
- Simple owner stats.

The dashboard should be framed as "Behind every site is the dashboard that helps you run it." It should reinforce that Site For Owners is more than a pretty page, while keeping the customer-facing showcase as the main draw.

### 5. Lead Form CTA

The final CTA should invite visitors who like the work to submit their details.

Headline:

- "Like one of these? Request yours."

Fields:

- Name.
- Phone number.
- Business name.
- Business type.
- Instagram, website, or booking link.
- Optional notes.

Behavior:

- Reuse the existing marketing lead pattern if possible.
- Keep the form short and mobile-friendly.
- Make phone number a first-class field because this is a founder-driven sales flow.
- After submission, show a clear success state that says the founder will follow up.

## Technical Approach

Route:

- Add `/demo` under the marketing route group so it resolves to the public endpoint without adding `/marketing` to the URL.
- Keep the implementation isolated from the current homepage so the business-card QR page can have a sharper visual direction.

Components:

- Create focused `/demo` components rather than overloading the current homepage sections.
- Reuse existing shared primitives where they fit, such as brand logo, button styling, and form submission logic.
- Reuse the existing marketing lead submission pattern. If the current API payload is too narrow, extend it in a backwards-compatible way so the homepage form keeps working.

Media:

- Store demo reel assets under `public/marketing` or a dedicated child folder such as `public/marketing/demo`.
- Use optimized MP4/WebM files, short duration, and poster images.
- Use available beauty media such as the existing nails video as the first implementation asset, then replace or expand the reel as better recordings become available.
- Avoid true live streaming for the first version. A polished screen-recorded reel gives the "live" feeling with far less complexity and better reliability.

Accessibility:

- Do not rely on video alone to explain the offer.
- Provide text labels for each showcase card.
- Respect `prefers-reduced-motion`.
- Ensure form labels are explicit.
- Keep contrast strong in the darker editorial theme.

Performance:

- Keep hero media short and compressed.
- Lazy-load below-the-fold videos where possible.
- Use poster images so the first view is stable.
- Avoid iframes in the first version unless a single live preview is clearly worth the cost.

## Out of Scope For First Version

- True real-time livestreaming.
- A full interactive demo tenant embedded in-page.
- Multi-step quiz onboarding.
- Account creation.
- Payment or checkout from `/demo`.
- Rebuilding the main marketing homepage.

## First-Version Defaults

- Hero headline: "Beauty websites that make clients book."
- CTA copy: "Like this? Request yours."
- Portfolio examples are visual-first in the first version. Live preview links can be added later if the examples are ready and stable.
- Use the existing nails video as a first hero/demo media asset if no better compiled reel exists yet.
- Extend the existing lead flow only as much as needed for the `/demo` form fields.

## Recommended First Version

Build a tight single-page `/demo` route:

1. Luxury/editorial hero with video reel, headline, and CTA.
2. Beauty portfolio grid with five visual cards.
3. Compact customer journey strip.
4. Short owner dashboard proof section.
5. Lead form CTA.

This version maximizes the QR-scan impact while keeping implementation realistic and maintainable.
