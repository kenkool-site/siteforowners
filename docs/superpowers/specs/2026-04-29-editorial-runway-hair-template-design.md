# Editorial Runway Hair Template Design

## Summary

Create one new dedicated website template for hair and beauty brands specializing in locs, natural hairstyles, protective styling, and premium salon experiences. The template should not replace the existing `classic`, `bold`, `elegant`, `vibrant`, or `warm` variants. It should be added as a distinct template option with a luxury black-and-gold Editorial Runway aesthetic.

The design direction is high-end fashion: sharp edges, bold typography, high contrast, dramatic model-forward hero imagery, glassmorphism panels, smooth gradients, subtle glow, moving text accents, and polished motion. The template must stay mobile-first and preserve the existing booking, service, gallery, testimonial, product, contact, map, and footer data flows.

## Goals

- Add a new dedicated hair/beauty template variant for locs and natural hair brands.
- Deliver a visually striking homepage that feels premium, clean, modern, and fashion-led.
- Keep the existing booking behavior intact, including in-site booking, external booking, and dual booking mode behavior.
- Reuse current data structures from `PreviewData`, `GeneratedCopy`, services, categories, images, reviews, products, and booking settings.
- Use motion intentionally: hero text movement, staggered section reveals, marquee-style service text, hover glow, and subtle image/card transitions.
- Maintain accessibility basics: readable contrast, keyboard-operable service booking cards, meaningful text hierarchy, and reduced-motion compatibility where the existing animation provider disables animations.

## Template Positioning

Final variant id: `runway`.

Reasoning: the existing template ids are style names (`classic`, `bold`, `elegant`, `vibrant`, `warm`). `runway` fits that naming pattern better than a vertical-specific id while still describing the high-fashion editorial direction.

## Visual System

### Color

The default palette should be noir and gold:

- Background: near black, `#050505`
- Elevated panel: soft black, `#0D0B08`
- Primary gold: `#D4AF37` or refined muted gold, `#D8B255`
- Deep gold: `#8F6D22`
- Warm ivory text: `#FFF4D8`
- Muted text: translucent ivory, about 65-75 percent opacity
- Borders: translucent gold and white hairlines

The template should still accept `ThemeColors`, but for this design it should strongly favor the supplied gold/black palette. If the tenant has custom colors, map them carefully to preserve contrast.

### Typography

Use the existing font stack unless project-level typography is expanded later. Within the template, create a fashion/editorial feel through:

- Extra-large uppercase hero text.
- Tight tracking on large headings.
- Wide letter spacing for eyebrow labels.
- Compact uppercase button labels.
- Strong font weight contrast between headings and body copy.

### Shape And Texture

- Prefer sharp rectangles and subtle hairline borders over rounded cards.
- Use glass panels for nav, proof badges, and selected content blocks.
- Use radial gold gradients for glow and depth.
- Use image overlays and diagonal crops to create a model/editorial feel.
- Use soft shadows and gold glows only where they reinforce hierarchy.

## Homepage Structure

### 1. Minimal Navigation

Use the existing `SiteNav` behavior for the first implementation. The visual direction should be a fixed, translucent, glassy top bar with:

- Brand/business name.
- Minimal section links on larger screens.
- Compact menu treatment on mobile.
- Locale toggle support if the existing template flow requires it.

The nav must remain lightweight and not obscure the hero.

### 2. Hero

Create a new `RunwayHero` component.

Hero content:

- Business name.
- Headline from generated copy.
- Subheadline from generated copy.
- Primary CTA to booking.
- Secondary CTA to gallery or services.
- Hero image or video from existing data.
- Floating trust/rating card when rating data is available.

Visual behavior:

- Full viewport height on desktop and near-full viewport height on mobile.
- Black/gold radial gradient background.
- Large editorial headline with one highlighted gold line.
- Professional model imagery, preferably the tenant hero image, framed in a sharp glass card.
- Moving text effect on headline lines using subtle horizontal drift or reveal.
- Marquee strip below hero listing signature services or brand phrases.
- CTA hover glow and lift.

### 3. Signature Services

Create a new `RunwayServices` component.

Use existing service data and category grouping behavior. Cards should:

- Use sharp rectangular panels with gold border accents.
- Show service image if available.
- Show service name, price, duration, and short description.
- Support category collapse using the same `groupServices` pattern used by existing service templates.
- Trigger the same booking behavior as current service sections:
  - external mode opens service deep link when available.
  - both mode requests booking choice when deep link exists.
  - in-site mode opens calendar with the selected service.
- Preserve keyboard interaction for clickable cards.

Motion:

- Stagger cards on scroll.
- Add hover glow and slight lift.
- Use a subtle gold line sweep on card hover.

### 4. Gallery

Create a new `RunwayGallery` component.

Visual direction:

- Bento/editorial image grid.
- Mixed image sizes on desktop.
- Single-column or horizontal-scroll treatment on mobile.
- Dark overlays with thin gold borders.
- Hover scale and glow on desktop.

If no gallery images are available, the section should be skipped using the existing `TemplateOrchestrator` visibility logic.

### 5. About / Brand Story

Create a new `RunwayAbout` component.

Content:

- Existing about paragraphs.
- Optional about image when provided.
- Editorial pull quote or short brand statement.

Visual direction:

- Split layout on desktop.
- Glass text panel.
- Gold eyebrow label.
- Sharp image frame.

### 6. Testimonials / Rating

Reuse `TemplateTestimonials` for the first implementation, passing the runway palette through existing color props. Do not create a separate testimonials component in this pass.

The section should feel like client notes from a premium studio:

- Dark background.
- Glass review cards.
- Gold stars.
- Short review excerpts.

### 7. Booking CTA

Continue using `TemplateBooking` for full booking behavior.

Add an above-booking runway CTA strip:

- “Ready for the chair?”
- Gold-to-deep-gold gradient.
- Sharp black button.
- Scroll or open booking via existing `#booking` behavior.

Do not duplicate booking state logic. The new template should pass through the existing `bookingSection`.

### 8. Shared Sections

Keep the existing shared components for:

- Products
- Contact
- Map
- Footer
- Service booking modal

These can inherit the noir/gold color palette through `ThemeColors`.

## Integration

Update `TemplateOrchestrator` to include the new template variant.

Expected changes:

- Extend `TemplateName` to include `runway`.
- Update `getTemplateName` validation to accept `runway`.
- Import new runway components.
- Add a `case "runway"` render branch.
- Preserve the shared section construction already used by other templates.
- Ensure section visibility settings still work.
- Ensure nav items still match visible sections.

The runway branch should render:

1. `SiteNav`.
2. `RunwayHero`.
3. `RunwayServices`.
4. `RunwayGallery`.
5. `RunwayAbout`.
6. Products if present.
7. Testimonials or rating.
8. Booking.
9. Contact.
10. Map.
11. Footer.

## Theme Integration

Add a black-and-gold theme entry for salon and braids verticals named `Runway Noir`. The existing `salon_noir`, `barbershop_black_gold`, `restaurant_noir`, and `nails_champagne` themes show similar palettes, but this template default should use:

- primary: `#D8B255`
- secondary: `#0A0A0A`
- accent: `#F2CD73`
- background: `#050505`
- foreground: `#FFF4D8`
- muted: `#18130C`

If the data already includes `custom_colors`, the template should respect them where contrast remains acceptable.

## Motion Requirements

Use Framer Motion where components already run client-side, and keep effects restrained:

- Hero: staggered load for eyebrow, headline, copy, CTAs, and model frame.
- Hero headline: subtle moving text or animated reveal.
- Marquee: CSS-only horizontal text strip for service keywords.
- Services: staggered scroll reveal through `AnimateSection`.
- Cards: hover lift, glow, and border intensity.
- Gallery: hover scale and overlay fade.
- Booking CTA: soft gold pulse or glow on hover, not constant distraction.

Animations must honor `disable_animations` through the existing `AnimationProvider` where applicable. CSS-only decorative animation should be minimal enough that the page remains usable even when disabled animations are configured.

## Responsive Behavior

Mobile-first requirements:

- Hero stacks text above image/frame.
- CTAs are full-width or comfortably tappable.
- Service cards use horizontal scroll or one-column stack.
- Gallery becomes one-column or two-column simplified grid.
- Nav remains compact.
- No text should overflow narrow screens.
- Large typography should use responsive sizes and tight but readable line height.

## Testing And Verification

Focused checks:

- TypeScript compiles.
- Lint diagnostics do not introduce new errors.
- New template renders without runtime errors.
- Existing template variants still render.
- Booking CTA from hero opens the current booking behavior.
- Service card booking behavior works for in-site, external-only, and both modes.
- Mobile viewport layout is usable.
- No severe contrast issues in the default black/gold palette.

Manual visual checks:

- Hero image/video fits without distortion.
- Gold text remains readable against black and image overlays.
- Motion feels premium, not distracting.
- Gallery and service sections retain rhythm when data is sparse.

## Out Of Scope

- Replacing all existing templates.
- Rewriting booking logic.
- Adding a new CMS/editor workflow unless needed to expose the new template id.
- Changing database schema unless template variants are currently constrained outside TypeScript.
- Adding external font dependencies.
