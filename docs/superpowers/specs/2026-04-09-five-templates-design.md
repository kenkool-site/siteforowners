# Five Website Templates — Design Spec

**Date:** 2026-04-09
**Status:** Draft
**Goal:** Replace the single template layout with 5 distinct templates, each with Framer Motion animations. Each preview generation picks 2 contrasting templates so users see genuinely different options.

---

## 1. Architecture

### Composable Sections + Layout Orchestrator

Shared components (Footer, Map, Contact, Booking) stay as-is — they're identical across templates. The 4 sections that vary (Hero, Services, Gallery, About) get template-specific variants. A new `TemplateOrchestrator` replaces `TemplateRenderer` as the entry point.

### File Structure

```
src/components/templates/
  shared/
    AnimateSection.tsx       — Framer Motion scroll-reveal wrapper
    TemplateFooter.tsx       — moved from current location
    TemplateMap.tsx           — moved from current location
    TemplateContact.tsx       — moved from current location
    TemplateBooking.tsx       — moved from current location
    TemplateProducts.tsx      — moved from current location
  heroes/
    ClassicHero.tsx
    BoldHero.tsx
    ElegantHero.tsx
    VibrantHero.tsx
    WarmHero.tsx
  services/
    ClassicServices.tsx
    BoldServices.tsx
    ElegantServices.tsx
    VibrantServices.tsx
    WarmServices.tsx
  galleries/
    ClassicGallery.tsx
    BoldGallery.tsx
    ElegantGallery.tsx
    VibrantGallery.tsx
    WarmGallery.tsx
  about/
    ClassicAbout.tsx
    BoldAbout.tsx
    ElegantAbout.tsx
    VibrantAbout.tsx
    WarmAbout.tsx
  stats/
    VibrantStats.tsx          — only used by Vibrant template
  TemplateOrchestrator.tsx    — replaces TemplateRenderer
  index.ts                    — updated exports
```

### Template Type

```typescript
type TemplateName = 'classic' | 'bold' | 'elegant' | 'vibrant' | 'warm';
```

Added to `PreviewData.template_variant` field (already exists in DB as text).

---

## 2. AnimateSection — Shared Scroll Animation Wrapper

A reusable Framer Motion component that wraps any section.

```typescript
interface AnimateSectionProps {
  children: React.ReactNode;
  animation?: 'fade-up' | 'fade-in' | 'slide-left' | 'slide-right' | 'scale-in';
  delay?: number;       // seconds, default 0
  duration?: number;    // seconds, default 0.6
  className?: string;
}
```

**Behavior:**
- Uses `useInView` from framer-motion with `once: true` and `margin: "-80px"`
- Triggers animation when section scrolls into viewport
- `fade-up` is the default (opacity 0->1, translateY 40->0)
- All animations use `easeOut` curve

---

## 3. Template Designs

### 3.1 Classic

**Vibe:** Clean, professional, trustworthy. Works for every business type.

**Section order:** Hero -> Services -> Gallery -> About -> Products -> Booking -> Contact -> Map -> Footer

**Hero (ClassicHero):**
- Full-height (90vh), background image with gradient overlay
- Logo rendered as circular badge if available (128px)
- Business name in uppercase tracking-wide, primary color
- Headline: text-5xl/7xl bold
- Subheadline: text-lg/xl, 80% opacity
- Dual CTAs: "Book Now" (filled) + "Call Us" (outline)
- Animations: fade-in title (0.6s), staggered subtitle (0.3s delay), buttons (0.5s delay)
- Bottom fade gradient to next section

**Services (ClassicServices):**
- 2-column card grid (stacks on mobile)
- Each card: rounded-xl, muted background, name + description left, price right in primary color
- Animations: staggered fade-up, 0.1s between cards

**Gallery (ClassicGallery):**
- 3-column grid (2 on mobile), aspect-square images
- Lightbox on click
- Animations: staggered fade-in, 0.05s between items

**About (ClassicAbout):**
- 2-column: image left (aspect 4:5), text right
- Stacks on mobile (image on top)
- Animations: image slides from left, text slides from right

This is the current template, polished with AnimateSection wrappers.

---

### 3.2 Bold

**Vibe:** High-energy, modern, edgy. Dark backgrounds, big type, strong contrast.

**Section order:** Hero -> Gallery -> Services -> About -> Products -> Booking -> Contact -> Map -> Footer

**Hero (BoldHero):**
- Full-height, diagonal color overlay (skewY -3deg clip-path) over background image
- No logo badge — just massive headline (text-6xl/8xl)
- No subheadline — just the punch line as headline
- Single large CTA button, no outline variant
- Animations: scale-in headline (from 0.8 to 1), slide-up CTA

**Services (BoldServices):**
- Horizontal scroll container on mobile (snap-x), grid on desktop (md:grid-cols-3)
- Each card: dark muted bg, colored left border (4px primary), name bold, description below, price top-right
- Animations: cards slide in from right, staggered

**Gallery (BoldGallery):**
- Alternating row pattern: 1 large (full-width, aspect 16:9) then 2 small (50% each, aspect square)
- No lightbox — images are already large
- Animations: parallax-style (images move at 0.8x scroll speed via translateY)

**About (BoldAbout):**
- Dark foreground background
- Large pull-quote from first about paragraph (text-2xl/3xl, italic, primary color)
- Remaining paragraphs below in normal size
- No image — text-only for contrast with the gallery above
- Animations: quote fades in first (0.6s), paragraphs stagger after (0.3s delay each)

---

### 3.3 Elegant

**Vibe:** Luxury, minimal, editorial. Whitespace, fine typography, understated.

**Section order:** Hero -> About -> Services -> Gallery -> Products -> Booking -> Contact -> Map -> Footer

**Hero (ElegantHero):**
- NO background image — plain background color
- Thin decorative line (1px, 80px wide) at top center
- Logo small (80px) and subtle above business name
- Business name in uppercase, wide letter-spacing (0.4em), small font
- Headline: text-5xl/7xl, font-light (not bold), tight leading
- Subheadline: text-base, generous margin
- Single CTA, thin border, wide padding, uppercase text
- Animations: slow fade-in (1.2s duration), decorative line grows from center (width 0 -> 80px)

**Services (ElegantServices):**
- Single-column list, max-width 600px centered
- Each row: service name left, dotted border-bottom spanning to price right
- Like a fine dining menu — elegant simplicity
- Description below name in smaller italic text
- Animations: staggered row fade-in, 0.15s between rows

**Gallery (ElegantGallery):**
- 2-column with generous gap (gap-6), rounded-2xl corners
- Alternating offset: odd images get mt-8 (shifted down) on desktop
- Animations: gentle scale-in (0.95 -> 1.0) on scroll

**About (ElegantAbout):**
- Full-width centered text block, max-w-xl
- First letter of first paragraph styled as drop-cap (text-5xl, float-left, primary color)
- Generous line-height (leading-loose)
- No image
- Animations: fade-in paragraphs sequentially, 0.2s delay between

---

### 3.4 Vibrant

**Vibe:** Fun, energetic, social-media native. Gradients, rounded shapes, playful.

**Section order:** Hero -> Services -> Stats -> Gallery -> About -> Products -> Booking -> Contact -> Map -> Footer

**Hero (VibrantHero):**
- Gradient background: linear-gradient from primary to accent (135deg)
- Decorative blurred circles (absolute positioned, 50% opacity, primary/accent colors)
- Logo in a rounded-2xl white card if available
- Headline: text-5xl/7xl bold, white text
- Pill-shaped CTAs (rounded-full, padded)
- Animations: bounce-in headline (spring physics), pop-in buttons with scale overshoot

**Services (VibrantServices):**
- Card grid (2 cols mobile, 3 desktop)
- Each card: rounded-2xl, subtle gradient background (muted to background), generous padding
- Small colored circle/dot above service name as bullet
- Price in a pill badge (rounded-full bg-primary/10)
- Animations: cards pop-in with stagger + slight rotation (rotate -2deg to 0deg)

**Stats (VibrantStats) — NEW SECTION:**
- 3 counters in a row (1 col mobile stacks, 3 col desktop)
- Derives numbers from data: service count (from services array length), "5-Star" (static — all our prospects are 4.5+), and a friendly label like "Brooklyn" or neighborhood name parsed from address. If no address, show "Professional Services" count instead.
- Each counter: large number (text-4xl bold, primary color), label below (text-sm)
- Animations: counter counts up from 0 to final number over 1.5s when in view

**Gallery (VibrantGallery):**
- Tight 3-column grid, small gap (gap-2), rounded-xl corners
- Instagram-style: all square, hover zoom + slight saturation increase
- Animations: stagger-in grid items with scale (0.8 -> 1.0)

**About (VibrantAbout):**
- Two-tone split panel: left 40% colored (primary at 10% opacity) with a big highlighted quote, right 60% white with paragraphs
- On mobile: stacks vertically, colored quote panel on top
- Animations: slide-in panels from left and right

---

### 3.5 Warm

**Vibe:** Community-focused, personal, inviting. Story-first, earthy, human.

**Section order:** Hero -> About -> Gallery -> Services -> Products -> Booking -> Contact -> Map -> Footer

**Hero (WarmHero):**
- Split-screen: left half is image/logo area (background image or gradient with logo), right half is text + CTA
- On mobile: image on top (40vh), text below
- Warm gradient accent bar (4px) between image and text on desktop
- Headline: text-4xl/6xl, not ultra-bold (font-semibold)
- Friendly CTA text: "Come Visit Us" or "Book Your Spot"
- Animations: image slides in from left, text slides in from right, both 0.7s

**Services (WarmServices):**
- Single-column cards, full-width, max-w-2xl centered
- Each card: more emphasis on description (text-base) than price
- Left border in primary color (4px, rounded)
- Price right-aligned, secondary emphasis
- Animations: fade-up stagger, 0.1s between cards

**Gallery (WarmGallery):**
- Featured image layout: 1 large image on top (aspect 16:9), 4 thumbnails below in a row
- Click thumbnail to swap featured image (with crossfade animation)
- If fewer than 5 images, just show grid
- Animations: featured image crossfade (0.4s), thumbnails fade-in on load

**About (WarmAbout):**
- Story-first layout: "Our Story" heading in a distinct style (italic, slightly larger)
- Large paragraphs, generous spacing (space-y-6)
- Image BELOW text (not beside), full-width, rounded-2xl
- Feels like reading a personal letter
- Animations: fade-in paragraph by paragraph, 0.3s delay between

---

## 4. TemplateOrchestrator

Replaces `TemplateRenderer` as the main entry point.

```typescript
interface TemplateOrchestratorProps {
  data: PreviewData;
  locale?: 'en' | 'es';
}
```

**Responsibilities:**
1. Read `data.template_variant` to determine which template to render (e.g., `"bold"`, `"elegant"`)
2. Fallback to `"classic"` if not set or unrecognized
3. Select the correct Hero, Services, Gallery, About components for that template
4. Arrange sections in the template-specific order
5. Wrap each section in `AnimateSection` with template-appropriate animation
6. Render shared components (Products, Booking, Contact, Map, Footer) in their fixed positions
7. Extract custom_colors and logo from `generated_copy` jsonb (existing logic from TemplateRenderer)

---

## 5. Template Assignment in Generate API

In `src/app/api/generate-copy/route.ts`:

**Contrast pairing map:**
```typescript
const CONTRAST_PAIRS: Record<TemplateName, TemplateName[]> = {
  classic: ['bold', 'vibrant'],
  bold: ['elegant', 'warm'],
  elegant: ['vibrant', 'bold'],
  vibrant: ['elegant', 'warm'],
  warm: ['bold', 'vibrant'],
};
```

**Assignment logic:**
1. Pick a random template for variant A
2. Pick variant B from the contrast pair list for A
3. Store the template name in `template_variant` field (already exists in DB as text)

---

## 6. Compare Page Update

Update `CompareClient.tsx` to show which template style each option uses:

```typescript
const VARIANT_STYLES: Record<string, { name: string; desc: string; icon: string }> = {
  A: { name: "Design A", desc: "", icon: "" },  // desc/icon filled dynamically from template name
  B: { name: "Design B", desc: "", icon: "" },
};

const TEMPLATE_META: Record<string, { desc: string; icon: string }> = {
  classic: { desc: "Clean & Professional", icon: "briefcase" },
  bold: { desc: "Bold & Modern", icon: "flame" },
  elegant: { desc: "Elegant & Minimal", icon: "sparkles" },
  vibrant: { desc: "Fun & Energetic", icon: "party" },
  warm: { desc: "Warm & Personal", icon: "heart" },
};
```

---

## 7. Migration Path

1. Create new directory structure under `components/templates/`
2. Move existing shared components (Footer, Map, Contact, Booking, Products) to `shared/`
3. Rename current Hero, Services, Gallery, About to ClassicHero, ClassicServices, etc.
4. Build 4 new variants for each section type (Bold, Elegant, Vibrant, Warm)
5. Build AnimateSection wrapper
6. Build TemplateOrchestrator
7. Build VibrantStats (new section)
8. Update generate-copy API with template assignment logic
9. Update CompareClient to show template metadata
10. Update all imports (PreviewClient, index.ts, etc.)
11. Delete old TemplateRenderer.tsx

---

## 8. Non-Goals

- No new database columns needed (template_variant text field already exists)
- No changes to the AI copy generation prompt (same copy fields work for all templates)
- No changes to the wizard flow
- No changes to the PreviewData type (template_variant is already there)
- Not adding template selection to the wizard (may add later)
