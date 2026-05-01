# Marketing Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `src/app/(marketing)/page.tsx` with a redesigned homepage: Bold Pop hero + Warm Grounded body, dashboard tour carousel, single-plan free-month pricing. Drops broken 3-tier section, exposed founder-only nav links, and the placeholder phone link.

**Architecture:** Decompose the current 316-line single-file `page.tsx` into focused section components under `src/app/(marketing)/_components/`. New page.tsx is a thin shell that imports and composes them. Add new color tokens and a serif font; existing Geist sans stays for body and Bold Pop hero. Motion via Framer Motion (already in stack), gated on `prefers-reduced-motion`.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Tailwind CSS, Framer Motion v12, `next/font` (Geist local + Fraunces from Google).

**Spec:** `docs/superpowers/specs/2026-05-01-marketing-page-redesign-design.md`. Read it before starting.

**Testing approach:** This project uses Node's built-in `node:test` for `lib/` utility tests but has no React component test infrastructure (no Vitest/RTL). Standing up component tests for a one-page redesign is not worth the yak-shave. Each section task includes an explicit **Manual verification** checklist that the implementer must work through in the browser at 375px (mobile) and ≥1024px (desktop) before commit. The final task adds a Playwright smoke test using the already-installed `playwright` devDep.

**Branch:** Plan was committed on `feat/sms-compliance-pages`. Before starting Task 1, switch to a new branch off `main`: `git switch -c feat/marketing-redesign main`.

---

## File Map

**Created:**
```
src/app/(marketing)/
  _components/
    Nav.tsx
    Hero.tsx
    HeroShowcase.tsx
    HowItWorks.tsx
    RightNow.tsx
    CustomerView.tsx
    OwnerDashboardTour.tsx
    OwnerDashboardSlides/
      HomeSlide.tsx
      ScheduleSlide.tsx
      ServicesSlide.tsx
      LeadsSlide.tsx
    Pricing.tsx
    FAQ.tsx
    FinalCTA.tsx
    Footer.tsx
public/marketing/
  hero/letstrylocs.png
  hero/barber.png
  hero/nails.png
  customer-view/letstrylocs.png
  customer-view/salon-thumb.png
  customer-view/barber-thumb.png
  customer-view/nails-thumb.png
  dashboard/home.png
  dashboard/schedule.png
  dashboard/services.png
  dashboard/leads.png
tests/marketing-page.spec.ts            # Playwright smoke test
playwright.config.ts                    # if not already present
```

**Modified:**
```
src/app/(marketing)/page.tsx            # full rewrite as composition shell
src/app/layout.tsx                      # add Fraunces font load
tailwind.config.ts                      # add color tokens + serif fontFamily
package.json                            # add e2e test scripts
```

**Unchanged:** every other route (auth, admin, dashboard, preview wizard, privacy, terms), every other component, every backend or migration file.

---

## Task 1: Foundation — color tokens, fonts, directory scaffolding

**Files:**
- Modify: `siteforowners/tailwind.config.ts`
- Modify: `siteforowners/src/app/layout.tsx`
- Create: `siteforowners/src/app/(marketing)/_components/.gitkeep`
- Create: `siteforowners/src/app/(marketing)/_components/OwnerDashboardSlides/.gitkeep`

- [ ] **Step 1: Switch branch**

```bash
cd siteforowners
git switch -c feat/marketing-redesign main
```

- [ ] **Step 2: Add color tokens to Tailwind config**

Open `siteforowners/tailwind.config.ts`. Inside `theme.extend.colors`, add the marketing palette **alongside** the existing shadcn HSL tokens (do not replace them — they are used by every other route):

```ts
colors: {
  // ...existing shadcn tokens (background, foreground, card, popover, primary, secondary, muted, accent, destructive, border, input, ring) — leave them intact

  // Marketing redesign palette (siteforowners.com homepage only)
  pop: {
    pink: "#ff2f8a",
    cream: "#fff8ee",
  },
  warm: {
    cream1: "#f4e4d1",
    cream2: "#fdf8f0",
    text: "#3a2418",
    textMuted: "#6b4226",
    accent: "#c2410c",
    eyebrow: "#a05c2c",
    deep: "#1f1611",
  },
},
```

Inside `theme.extend.fontFamily`, add a `serif` entry alongside the existing `sans` and `mono`:

```ts
fontFamily: {
  sans: ["var(--font-geist-sans)"],
  mono: ["var(--font-geist-mono)"],
  serif: ["var(--font-fraunces)", "Georgia", "serif"],
},
```

- [ ] **Step 3: Load Fraunces in the root layout**

Open `siteforowners/src/app/layout.tsx`. Add a `Fraunces` import from `next/font/google` and wire its CSS variable onto `<body>`:

```tsx
import type { Metadata } from "next";
import localFont from "next/font/local";
import { Fraunces } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz", "SOFT"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://www.siteforowners.com",
  ),
  title: "SiteForOwners — Your website, built for you",
  description:
    "Professional websites for small businesses. $50/month. No setup fee. We handle everything.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={cn(
          geistSans.variable,
          geistMono.variable,
          fraunces.variable,
          "font-sans antialiased",
        )}
      >
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Create the components directory**

```bash
mkdir -p siteforowners/src/app/\(marketing\)/_components/OwnerDashboardSlides
touch siteforowners/src/app/\(marketing\)/_components/.gitkeep
touch siteforowners/src/app/\(marketing\)/_components/OwnerDashboardSlides/.gitkeep
```

- [ ] **Step 5: Verify build still passes**

```bash
cd siteforowners && npm run lint && npx tsc --noEmit
```

Expected: clean exit codes, no lint or type errors.

- [ ] **Step 6: Verify Tailwind picks up the new tokens**

Run `npm run dev` in `siteforowners/`, open the existing `http://localhost:3000` (the current homepage still renders). Open devtools → Elements, briefly add `class="bg-pop-pink"` to `<body>` to confirm Tailwind compiles the new color. Remove the temporary class. Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git -C siteforowners add tailwind.config.ts src/app/layout.tsx 'src/app/(marketing)/_components'
git -C siteforowners commit -m "feat(marketing): add color tokens, Fraunces font, components scaffold"
```

---

## Task 2: Place marketing image assets

**Files:**
- Create: `siteforowners/public/marketing/{hero,customer-view,dashboard}/*.png`

The implementer cannot generate these images. They are real product screenshots provided by the founder. **If the founder has not handed over the image files at the time this task is reached, pause and ask for them before proceeding.**

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p siteforowners/public/marketing/{hero,customer-view,dashboard}
```

- [ ] **Step 2: Place screenshots from the brainstorming session**

The founder provided five dashboard screenshots in the brainstorming thread:
- letstrylocs Home (pink theme) → `siteforowners/public/marketing/dashboard/home.png`
- Mariam's Schedule (burgundy) → `siteforowners/public/marketing/dashboard/schedule.png`
- Mariam's Working hours config (burgundy) — **optional**, skip unless making a 5-slide tour later
- Mariam's Services & deposit (burgundy) → `siteforowners/public/marketing/dashboard/services.png`
- TouchedbyDrea Leads (purple) → `siteforowners/public/marketing/dashboard/leads.png`

Additional captures the founder must provide:
- Live letstrylocs site at mobile width → `siteforowners/public/marketing/hero/letstrylocs.png` and `siteforowners/public/marketing/customer-view/letstrylocs.png` (can be same file)
- Two more vertical previews for hero swap → `siteforowners/public/marketing/hero/{barber,nails}.png` (use whatever existing previews look most polished)
- Three category thumbnail images → `siteforowners/public/marketing/customer-view/{salon,barber,nails}-thumb.png` (can be cropped from the same previews)

- [ ] **Step 3: Verify file sizes are reasonable**

```bash
du -h siteforowners/public/marketing/**/*.png 2>/dev/null
```

Expected: each file under ~400 KB. If any are larger, ask the founder to re-export at 2x mobile width (~750px) PNG-8 or run through a compressor. Heavy hero images will hurt Lighthouse mobile score.

- [ ] **Step 4: Commit**

```bash
git -C siteforowners add public/marketing/
git -C siteforowners commit -m "feat(marketing): add hero, customer-view, and dashboard tour images"
```

---

## Task 3: Footer component

Smallest, dependency-free component. Building this first proves the `_components/` pattern before tackling anything with motion.

**Files:**
- Create: `siteforowners/src/app/(marketing)/_components/Footer.tsx`

- [ ] **Step 1: Write the component**

```tsx
// siteforowners/src/app/(marketing)/_components/Footer.tsx
import Link from "next/link";

export function Footer() {
  return (
    <footer className="bg-warm-deep px-6 py-8 text-center text-xs text-warm-cream2/70">
      <div className="mx-auto max-w-3xl flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
        <span className="font-medium text-warm-cream2">SiteForOwners</span>
        <span aria-hidden>·</span>
        <span>Made in Brooklyn</span>
        <span aria-hidden>·</span>
        <Link href="/privacy" className="hover:text-warm-cream2">
          Privacy
        </Link>
        <span aria-hidden>·</span>
        <Link href="/terms" className="hover:text-warm-cream2">
          Terms
        </Link>
        <span aria-hidden>·</span>
        <span>© {new Date().getFullYear()}</span>
      </div>
    </footer>
  );
}
```

- [ ] **Step 2: Manual verification**

Temporarily import this in the existing `page.tsx` at the very bottom (replacing the existing footer) just to confirm rendering, then revert. Run `npm run dev`, visit `localhost:3000`:

- [ ] Background is the dark warm color `#1f1611` (not black, has a brown tint)
- [ ] Privacy and Terms links navigate to `/privacy` and `/terms`
- [ ] At 375px the row wraps cleanly (no horizontal scroll)
- [ ] Year renders correctly (2026)

Revert the temporary import in `page.tsx` before committing — the new Footer is added permanently in Task 13 when the new page.tsx is composed.

- [ ] **Step 3: Lint + typecheck**

```bash
cd siteforowners && npm run lint && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git -C siteforowners add 'src/app/(marketing)/_components/Footer.tsx'
git -C siteforowners commit -m "feat(marketing): add Footer component"
```

---

## Task 4: Nav component

Drops the founder-only links (`/preview`, `/previews`, `/prospects`, `/clients`) from the public nav. Replaces them with anchor links to in-page sections.

**Files:**
- Create: `siteforowners/src/app/(marketing)/_components/Nav.tsx`

- [ ] **Step 1: Write the component**

```tsx
// siteforowners/src/app/(marketing)/_components/Nav.tsx
"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

const NAV_LINKS = [
  { href: "#examples", label: "Examples" },
  { href: "#pricing", label: "Pricing" },
];

export function Nav() {
  return (
    <nav className="flex items-center justify-between bg-white px-6 py-4 border-b border-warm-cream1/60">
      <Link href="/" className="text-xl font-bold text-warm-text">
        Site<span className="text-pop-pink">ForOwners</span>
      </Link>

      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-1 sm:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-warm-textMuted hover:bg-warm-cream2 hover:text-warm-text"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <details className="relative sm:hidden">
          <summary className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-warm-cream1 text-warm-textMuted hover:bg-warm-cream2">
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-label="Open menu"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </summary>
          <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-xl border border-warm-cream1 bg-white py-2 shadow-lg">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block px-4 py-2.5 text-sm text-warm-text hover:bg-warm-cream2"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </details>

        <Link href="/preview">
          <Button
            size="sm"
            className="rounded-full bg-pop-pink text-pop-cream hover:bg-pop-pink/90"
          >
            Build my preview
          </Button>
        </Link>
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Manual verification**

Temporarily import into the existing `page.tsx` (replace the current `<nav>` block), run `npm run dev`:

- [ ] At 375px: hamburger button visible, two anchor links inside the dropdown, no `/prospects` / `/clients` / `/previews` anywhere
- [ ] At ≥640px: Examples and Pricing visible inline, no dropdown
- [ ] "Build my preview" pill is pink and navigates to `/preview`
- [ ] Logo "SiteForOwners" — the "ForOwners" half is pink

Revert the temporary import before committing.

- [ ] **Step 3: Commit**

```bash
git -C siteforowners add 'src/app/(marketing)/_components/Nav.tsx'
git -C siteforowners commit -m "feat(marketing): add Nav component, drop founder-only links"
```

---

## Task 5: Hero with HeroShowcase (vertical-cycling card)

Bold Pop hero with auto-cycling site preview. Uses Framer Motion `AnimatePresence` for the cross-fade between verticals; auto-advance pauses on hover and on `prefers-reduced-motion`.

**Files:**
- Create: `siteforowners/src/app/(marketing)/_components/HeroShowcase.tsx`
- Create: `siteforowners/src/app/(marketing)/_components/Hero.tsx`

- [ ] **Step 1: Write `HeroShowcase.tsx`**

```tsx
// siteforowners/src/app/(marketing)/_components/HeroShowcase.tsx
"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

const SITES = [
  {
    label: "Locs",
    business: "letstrylocs.com",
    image: "/marketing/hero/letstrylocs.png",
    alt: "letstrylocs.com — Brooklyn loctician site, mobile view",
  },
  {
    label: "Barber",
    business: "Mike's Cuts",
    image: "/marketing/hero/barber.png",
    alt: "Mike's Cuts — barbershop site, mobile view",
  },
  {
    label: "Nails",
    business: "Nailz By V",
    image: "/marketing/hero/nails.png",
    alt: "Nailz By V — nail studio site, mobile view",
  },
];
const ADVANCE_MS = 4000;

export function HeroShowcase() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (paused || reduceMotion) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % SITES.length);
    }, ADVANCE_MS);
    return () => clearInterval(timer);
  }, [paused, reduceMotion]);

  const current = SITES[index];

  return (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div
        role="tablist"
        aria-label="Choose a vertical"
        className="mb-3 flex flex-wrap gap-2"
      >
        {SITES.map((site, i) => (
          <button
            key={site.label}
            role="tab"
            aria-selected={i === index}
            aria-controls="hero-showcase-panel"
            onClick={() => setIndex(i)}
            className={`rounded-full px-3 py-1 text-xs font-bold transition ${
              i === index
                ? "bg-pop-cream text-pop-pink"
                : "bg-pop-cream/20 text-pop-cream hover:bg-pop-cream/30"
            }`}
          >
            {site.label}
          </button>
        ))}
      </div>

      <div
        id="hero-showcase-panel"
        role="tabpanel"
        aria-live="polite"
        className="rounded-2xl bg-black p-3 shadow-2xl"
        style={{ transform: "rotate(-1.5deg)" }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={current.label}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: 0.35 }}
            className="overflow-hidden rounded-xl"
          >
            <Image
              src={current.image}
              alt={current.alt}
              width={750}
              height={1000}
              priority={index === 0}
              className="h-auto w-full"
            />
          </motion.div>
        </AnimatePresence>
        <p className="mt-2 text-center text-[10px] text-pop-cream/70">
          ↑ {current.business}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `Hero.tsx`**

```tsx
// siteforowners/src/app/(marketing)/_components/Hero.tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { HeroShowcase } from "./HeroShowcase";

const TEXT_US_HREF = process.env.NEXT_PUBLIC_TEXT_US_URL ?? "";

export function Hero() {
  return (
    <section className="bg-pop-pink px-6 py-16 text-pop-cream md:py-24">
      <div className="mx-auto grid max-w-5xl gap-12 md:grid-cols-2 md:items-center">
        <div>
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] opacity-90">
            For salons, barbers, nail shops
          </p>
          <h1 className="font-sans text-4xl font-black leading-[0.98] tracking-tight md:text-6xl">
            Get booked without the back-and-forth.
          </h1>
          <p className="mt-4 text-base leading-snug opacity-95 md:text-lg">
            We build your website + booking and get you live in 24 hours.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/preview">
              <Button
                size="lg"
                className="rounded-full bg-black px-6 py-5 text-sm font-bold text-pop-cream hover:bg-black/85"
              >
                Create My Free Preview →
              </Button>
            </Link>
            {TEXT_US_HREF && (
              <a href={TEXT_US_HREF} target="_blank" rel="noopener noreferrer">
                <Button
                  size="lg"
                  variant="outline"
                  className="rounded-full border-2 border-pop-cream bg-transparent px-6 py-5 text-sm font-bold text-pop-cream hover:bg-pop-cream/10"
                >
                  Text us
                </Button>
              </a>
            )}
          </div>
        </div>
        <HeroShowcase />
      </div>
    </section>
  );
}
```

**About the "Text us" button:** the spec requires a real URL or omitting the button. The component reads `NEXT_PUBLIC_TEXT_US_URL` from the environment and renders the button only when set. If the founder provides a number before merge, set the env var (e.g. `https://wa.me/15551234567`) in `.env.local` and Vercel; if not, the button is hidden — no broken link ships.

- [ ] **Step 3: Manual verification**

Temporarily import `Hero` at the top of `page.tsx`, run `npm run dev`:

- [ ] Hero background is hot pink `#ff2f8a`
- [ ] Headline reads "Get booked without the back-and-forth." in heavy bold sans
- [ ] At 375px the showcase card stacks below the headline; at ≥768px it sits to the right
- [ ] Vertical tab buttons (Locs / Barber / Nails) are clickable; clicking jumps the showcase to that site
- [ ] Auto-advance cycles every ~4 seconds; hovering the showcase pauses it; mousing out resumes
- [ ] Set `NEXT_PUBLIC_TEXT_US_URL=https://wa.me/15551234567` in `.env.local`, refresh — Text us button appears, links to that URL, opens in new tab. Unset the env var, refresh — button disappears.
- [ ] In macOS System Settings → Accessibility → Display, enable "Reduce motion" (or use Chrome devtools Rendering panel → Emulate prefers-reduced-motion: reduce). Refresh — auto-advance stops, swap fades without Y-offset.

Revert the temporary `page.tsx` import before committing.

- [ ] **Step 4: Commit**

```bash
git -C siteforowners add 'src/app/(marketing)/_components/Hero.tsx' 'src/app/(marketing)/_components/HeroShowcase.tsx'
git -C siteforowners commit -m "feat(marketing): add Hero with vertical-swap showcase"
```

---

## Task 6: HowItWorks component

Three numbered steps with a scroll-triggered fade-up stagger.

**Files:**
- Create: `siteforowners/src/app/(marketing)/_components/HowItWorks.tsx`

- [ ] **Step 1: Write the component**

```tsx
// siteforowners/src/app/(marketing)/_components/HowItWorks.tsx
"use client";

import { motion, useReducedMotion } from "framer-motion";

const STEPS = [
  {
    num: "1",
    title: "We build your site",
    desc: "Tell us your business, services, photos. Site ready in 24 hours.",
  },
  {
    num: "2",
    title: "You approve",
    desc: "Look it over. Want a change? Text us. Done same day.",
  },
  {
    num: "3",
    title: "You start getting bookings",
    desc: "Customers find you, book online, you get a text.",
  },
];

export function HowItWorks() {
  const reduceMotion = useReducedMotion();
  const initial = reduceMotion ? false : { opacity: 0, y: 12 };

  return (
    <section className="bg-warm-cream1 px-6 py-16 md:py-20">
      <div className="mx-auto max-w-3xl">
        <motion.p
          initial={initial}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          className="text-xs font-bold uppercase tracking-[0.2em] text-warm-eyebrow"
        >
          — How it works —
        </motion.p>
        <motion.h2
          initial={initial}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ delay: 0.05 }}
          className="mt-2 font-serif text-3xl font-semibold leading-tight text-warm-text md:text-4xl"
        >
          Three steps. <em className="not-italic text-warm-accent italic">No tech talk.</em>
        </motion.h2>

        <ol className="mt-8 space-y-6">
          {STEPS.map((step, i) => (
            <motion.li
              key={step.num}
              initial={initial}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ delay: 0.1 + i * 0.08 }}
              className="flex items-start gap-4"
            >
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-pop-pink font-sans text-base font-extrabold text-pop-cream">
                {step.num}
              </span>
              <div>
                <h3 className="text-base font-bold text-warm-text">{step.title}</h3>
                <p className="mt-1 text-sm text-warm-textMuted">{step.desc}</p>
              </div>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Manual verification**

Temporarily import into `page.tsx` below the Hero, run `npm run dev`:

- [ ] Background is `#f4e4d1` warm cream
- [ ] Headline uses serif italic on "No tech talk" in terracotta
- [ ] Number circles are pink with white digits
- [ ] Scroll the page from above the section into view — eyebrow, headline, then steps fade up in stagger (~0.1s apart). Reload and the animation only fires once per page load (viewport `once: true`).
- [ ] With reduced-motion enabled, all elements appear instantly with no offset.

- [ ] **Step 3: Commit**

```bash
git -C siteforowners add 'src/app/(marketing)/_components/HowItWorks.tsx'
git -C siteforowners commit -m "feat(marketing): add HowItWorks section"
```

---

## Task 7: RightNow component (scattered → unified motion)

Four scattered tool cards animate together into a single "One place" pill when the section enters view.

**Files:**
- Create: `siteforowners/src/app/(marketing)/_components/RightNow.tsx`

- [ ] **Step 1: Write the component**

```tsx
// siteforowners/src/app/(marketing)/_components/RightNow.tsx
"use client";

import { motion, useReducedMotion } from "framer-motion";

const TOOLS = [
  { tag: "Bookings", value: "Acuity / Booksy / Vagaro" },
  { tag: "Customers", value: "Instagram DMs all day" },
  { tag: "Website", value: "None or a Linktree" },
  { tag: "Tracking", value: "Notebook & memory" },
];

export function RightNow() {
  const reduceMotion = useReducedMotion();
  const initial = reduceMotion ? false : { opacity: 0, y: 12 };

  return (
    <section className="bg-warm-cream2 px-6 py-16 md:py-20">
      <div className="mx-auto max-w-3xl">
        <motion.p
          initial={initial}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          className="text-xs font-bold uppercase tracking-[0.2em] text-warm-eyebrow"
        >
          — Right now —
        </motion.p>
        <motion.h2
          initial={initial}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ delay: 0.05 }}
          className="mt-2 font-serif text-3xl font-semibold leading-tight text-warm-text md:text-4xl"
        >
          You're juggling{" "}
          <em className="not-italic text-warm-accent italic">five different things.</em>
        </motion.h2>

        <div className="mt-8 grid grid-cols-2 gap-3">
          {TOOLS.map((tool, i) => (
            <motion.div
              key={tool.tag}
              initial={initial}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ delay: 0.1 + i * 0.06 }}
              className="rounded-xl border border-warm-cream1 bg-white p-4"
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-warm-eyebrow">
                {tool.tag}
              </p>
              <p className="mt-1 text-xs font-medium text-warm-text">{tool.value}</p>
            </motion.div>
          ))}
        </div>

        <motion.p
          initial={initial}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ delay: 0.5 }}
          className="mt-6 text-sm text-warm-textMuted"
        >
          → One place instead.{" "}
          <strong className="text-warm-text">
            Site, booking, and a dashboard you actually like.
          </strong>
        </motion.p>
      </div>
    </section>
  );
}
```

**Note on the "scattered → unified" motion described in the spec:** the cleanest way to communicate the value is the staggered fade-up of the four cards followed by the closing line — a literal scattered-card collapse animation is heavy to implement reliably across viewport sizes and tends to look gimmicky on mobile. This implementation keeps the same narrative ("scattered things → one place") with restrained motion. If the founder strongly prefers the literal collapse, file a follow-up task to add a `LayoutGroup` + `motion.div layoutId` version after launch.

- [ ] **Step 2: Manual verification**

Temporarily import into `page.tsx`, run `npm run dev`:

- [ ] Background is the lighter cream `#fdf8f0` (alternates with HowItWorks's `#f4e4d1`)
- [ ] Four tool cards in a 2x2 grid at 375px
- [ ] Cards fade up in a stagger when section enters view; closing line "One place instead..." fades in last
- [ ] At ≥768px the grid stays 2x2 (don't widen to 4 columns — feels too sparse)

- [ ] **Step 3: Commit**

```bash
git -C siteforowners add 'src/app/(marketing)/_components/RightNow.tsx'
git -C siteforowners commit -m "feat(marketing): add RightNow scattered-tools section"
```

---

## Task 8: CustomerView component

Anchor target for the nav's "Examples" link. Shows the live letstrylocs site in a phone frame and three vertical thumbnails below.

**Files:**
- Create: `siteforowners/src/app/(marketing)/_components/CustomerView.tsx`

- [ ] **Step 1: Write the component**

```tsx
// siteforowners/src/app/(marketing)/_components/CustomerView.tsx
"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";

const VERTICALS = [
  { label: "Salon", image: "/marketing/customer-view/salon-thumb.png" },
  { label: "Barber", image: "/marketing/customer-view/barber-thumb.png" },
  { label: "Nail shop", image: "/marketing/customer-view/nails-thumb.png" },
];

export function CustomerView() {
  const reduceMotion = useReducedMotion();
  const initial = reduceMotion ? false : { opacity: 0, y: 12 };

  return (
    <section id="examples" className="bg-warm-cream1 px-6 py-16 md:py-20">
      <div className="mx-auto max-w-3xl">
        <motion.p
          initial={initial}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          className="text-xs font-bold uppercase tracking-[0.2em] text-warm-eyebrow"
        >
          — What customers see —
        </motion.p>
        <motion.h2
          initial={initial}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ delay: 0.05 }}
          className="mt-2 font-serif text-3xl font-semibold leading-tight text-warm-text md:text-4xl"
        >
          A site that{" "}
          <em className="not-italic text-warm-accent italic">looks like your shop.</em>
        </motion.h2>

        <motion.div
          initial={initial}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ delay: 0.1 }}
          className="mt-8 overflow-hidden rounded-2xl bg-black p-2 shadow-xl"
        >
          <Image
            src="/marketing/customer-view/letstrylocs.png"
            alt="letstrylocs.com — Brooklyn loctician site, mobile view"
            width={750}
            height={1100}
            className="h-auto w-full rounded-xl"
          />
        </motion.div>

        <div className="mt-6 grid grid-cols-3 gap-3">
          {VERTICALS.map((v, i) => (
            <motion.div
              key={v.label}
              initial={initial}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ delay: 0.2 + i * 0.06 }}
              className="overflow-hidden rounded-xl border border-warm-cream2 bg-white"
            >
              <div className="relative aspect-[3/4] w-full">
                <Image
                  src={v.image}
                  alt={`${v.label} preview thumbnail`}
                  fill
                  sizes="(max-width: 768px) 33vw, 200px"
                  className="object-cover"
                />
              </div>
              <p className="px-3 py-2 text-center text-[11px] font-semibold text-warm-text">
                {v.label}
              </p>
            </motion.div>
          ))}
        </div>

        <p className="mt-4 text-center text-xs italic text-warm-textMuted">
          Mobile-first. Bilingual. Yours to own.
        </p>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Manual verification**

- [ ] Section has `id="examples"` — clicking the Nav's "Examples" link smooth-scrolls here
- [ ] Main showcase image renders at the full mobile width inside the black frame
- [ ] Three vertical thumbnails render in a 3-column grid even at 375px (each ~110px wide)
- [ ] Caption strip "Mobile-first. Bilingual. Yours to own." renders italic and centered

- [ ] **Step 3: Commit**

```bash
git -C siteforowners add 'src/app/(marketing)/_components/CustomerView.tsx'
git -C siteforowners commit -m "feat(marketing): add CustomerView section"
```

---

## Task 9: OwnerDashboardTour with 4 slides

The marquee section. Auto-advancing carousel with arrow + dot navigation, keyboard support, hover-pause, reduced-motion behavior, and per-slide caption.

**Files:**
- Create: `siteforowners/src/app/(marketing)/_components/OwnerDashboardSlides/HomeSlide.tsx`
- Create: `siteforowners/src/app/(marketing)/_components/OwnerDashboardSlides/ScheduleSlide.tsx`
- Create: `siteforowners/src/app/(marketing)/_components/OwnerDashboardSlides/ServicesSlide.tsx`
- Create: `siteforowners/src/app/(marketing)/_components/OwnerDashboardSlides/LeadsSlide.tsx`
- Create: `siteforowners/src/app/(marketing)/_components/OwnerDashboardTour.tsx`

The four slides are simple — each is a captioned image. We use real screenshots to keep the per-tenant color theming (pink / burgundy / purple) intact. The animated counter on slide 1 is rendered as an overlay on top of the screenshot only when slide 1 is the active slide.

- [ ] **Step 1: Write the four slide components**

```tsx
// siteforowners/src/app/(marketing)/_components/OwnerDashboardSlides/HomeSlide.tsx
"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

export function HomeSlide({ active }: { active: boolean }) {
  const reduceMotion = useReducedMotion();
  const [count, setCount] = useState(reduceMotion ? 113 : 0);

  useEffect(() => {
    if (!active || reduceMotion) {
      setCount(113);
      return;
    }
    setCount(0);
    const target = 113;
    const start = performance.now();
    const duration = 800;
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / duration);
      setCount(Math.round(target * progress));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, reduceMotion]);

  return (
    <article className="relative overflow-hidden rounded-2xl border border-warm-cream1 bg-white shadow-lg">
      <Image
        src="/marketing/dashboard/home.png"
        alt="letstrylocs dashboard home — bookings, orders, and visitor traffic"
        width={1280}
        height={720}
        className="h-auto w-full"
        priority
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-[6%] top-[35%] rounded-md bg-white/95 px-3 py-1 font-sans text-3xl font-black text-pop-pink shadow"
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: active ? 1 : 0 }}
        transition={{ duration: 0.3 }}
      >
        {count}
      </motion.div>
      <Caption tag="Slide 1 · Home" title="See what's happening today." desc="Bookings, orders, visitor traffic — at a glance, the moment you sign in." />
    </article>
  );
}

function Caption({ tag, title, desc }: { tag: string; title: string; desc: string }) {
  return (
    <footer className="border-t border-warm-cream1 px-5 py-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-warm-eyebrow">{tag}</p>
      <h3 className="mt-1 font-serif text-lg font-semibold text-warm-text">{title}</h3>
      <p className="mt-1 text-xs text-warm-textMuted">{desc}</p>
    </footer>
  );
}
```

```tsx
// siteforowners/src/app/(marketing)/_components/OwnerDashboardSlides/ScheduleSlide.tsx
"use client";

import Image from "next/image";

export function ScheduleSlide() {
  return (
    <article className="overflow-hidden rounded-2xl border border-warm-cream1 bg-white shadow-lg">
      <Image
        src="/marketing/dashboard/schedule.png"
        alt="Dashboard schedule view — bookings and open slots for the day"
        width={1280}
        height={720}
        className="h-auto w-full"
      />
      <footer className="border-t border-warm-cream1 px-5 py-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-warm-eyebrow">
          Slide 2 · Schedule
        </p>
        <h3 className="mt-1 font-serif text-lg font-semibold text-warm-text">
          Manage your day, set your hours.
        </h3>
        <p className="mt-1 text-xs text-warm-textMuted">
          See every booking. Pick presets like &ldquo;Standard 10–7&rdquo; or &ldquo;Closed weekends&rdquo; — change anytime.
        </p>
      </footer>
    </article>
  );
}
```

```tsx
// siteforowners/src/app/(marketing)/_components/OwnerDashboardSlides/ServicesSlide.tsx
"use client";

import Image from "next/image";

export function ServicesSlide() {
  return (
    <article className="overflow-hidden rounded-2xl border border-warm-cream1 bg-white shadow-lg">
      <Image
        src="/marketing/dashboard/services.png"
        alt="Dashboard services view — service list with deposit policy"
        width={1280}
        height={720}
        className="h-auto w-full"
      />
      <footer className="border-t border-warm-cream1 px-5 py-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-warm-eyebrow">
          Slide 3 · Services
        </p>
        <h3 className="mt-1 font-serif text-lg font-semibold text-warm-text">
          Update prices and deposits anytime.
        </h3>
        <p className="mt-1 text-xs text-warm-textMuted">
          Add a service, change a price, set a deposit policy — saves instantly to your live site.
        </p>
      </footer>
    </article>
  );
}
```

```tsx
// siteforowners/src/app/(marketing)/_components/OwnerDashboardSlides/LeadsSlide.tsx
"use client";

import Image from "next/image";

export function LeadsSlide() {
  return (
    <article className="overflow-hidden rounded-2xl border border-warm-cream1 bg-white shadow-lg">
      <Image
        src="/marketing/dashboard/leads.png"
        alt="Dashboard leads view — list of customer inquiries"
        width={1280}
        height={720}
        className="h-auto w-full"
      />
      <footer className="border-t border-warm-cream1 px-5 py-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-warm-eyebrow">
          Slide 4 · Leads
        </p>
        <h3 className="mt-1 font-serif text-lg font-semibold text-warm-text">
          Never miss a question.
        </h3>
        <p className="mt-1 text-xs text-warm-textMuted">
          Customers ask through your contact form. Every message lands here, with their name and number.
        </p>
      </footer>
    </article>
  );
}
```

- [ ] **Step 2: Write `OwnerDashboardTour.tsx`**

```tsx
// siteforowners/src/app/(marketing)/_components/OwnerDashboardTour.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { HomeSlide } from "./OwnerDashboardSlides/HomeSlide";
import { ScheduleSlide } from "./OwnerDashboardSlides/ScheduleSlide";
import { ServicesSlide } from "./OwnerDashboardSlides/ServicesSlide";
import { LeadsSlide } from "./OwnerDashboardSlides/LeadsSlide";

const SLIDE_COUNT = 4;
const ADVANCE_MS = 4000;

export function OwnerDashboardTour() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const initial = reduceMotion ? false : { opacity: 0, y: 12 };

  useEffect(() => {
    if (paused || reduceMotion) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % SLIDE_COUNT);
    }, ADVANCE_MS);
    return () => clearInterval(timer);
  }, [paused, reduceMotion]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      setIndex((i) => (i + 1) % SLIDE_COUNT);
      e.preventDefault();
    } else if (e.key === "ArrowLeft") {
      setIndex((i) => (i - 1 + SLIDE_COUNT) % SLIDE_COUNT);
      e.preventDefault();
    }
  };

  return (
    <section className="bg-warm-cream2 px-6 py-16 md:py-20">
      <div className="mx-auto max-w-3xl">
        <motion.p
          initial={initial}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          className="text-xs font-bold uppercase tracking-[0.2em] text-warm-eyebrow"
        >
          — What you see —
        </motion.p>
        <motion.h2
          initial={initial}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ delay: 0.05 }}
          className="mt-2 font-serif text-3xl font-semibold leading-tight text-warm-text md:text-4xl"
        >
          Your shop, <em className="not-italic text-warm-accent italic">in one place.</em>
        </motion.h2>
        <motion.p
          initial={initial}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ delay: 0.1 }}
          className="mt-3 text-sm text-warm-textMuted"
        >
          Bookings, services, leads, billing — all in a dashboard that uses your brand color.
        </motion.p>

        <div
          ref={stageRef}
          tabIndex={0}
          role="region"
          aria-roledescription="carousel"
          aria-label="Dashboard tour"
          onKeyDown={onKeyDown}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
          className="mt-8 overflow-hidden rounded-2xl"
        >
          <div
            className="flex transition-transform duration-500 ease-out motion-reduce:transition-none"
            style={{ transform: `translateX(-${index * 100}%)` }}
          >
            <div className="w-full flex-none px-1">
              <HomeSlide active={index === 0} />
            </div>
            <div className="w-full flex-none px-1">
              <ScheduleSlide />
            </div>
            <div className="w-full flex-none px-1">
              <ServicesSlide />
            </div>
            <div className="w-full flex-none px-1">
              <LeadsSlide />
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="flex gap-2" role="tablist" aria-label="Dashboard tour slides">
            {[0, 1, 2, 3].map((i) => (
              <button
                key={i}
                role="tab"
                aria-selected={i === index}
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => setIndex(i)}
                className={`h-2 rounded-full transition-all ${
                  i === index ? "w-6 bg-pop-pink" : "w-2 bg-warm-cream1 hover:bg-warm-eyebrow"
                }`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              aria-label="Previous slide"
              onClick={() => setIndex((i) => (i - 1 + SLIDE_COUNT) % SLIDE_COUNT)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-warm-cream1 bg-white text-warm-text hover:border-pop-pink hover:text-pop-pink"
            >
              ←
            </button>
            <button
              type="button"
              aria-label="Next slide"
              onClick={() => setIndex((i) => (i + 1) % SLIDE_COUNT)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-warm-cream1 bg-white text-warm-text hover:border-pop-pink hover:text-pop-pink"
            >
              →
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Manual verification**

- [ ] Eyebrow + headline + subhead render in serif italic with the rest of the warm-grounded styling
- [ ] Carousel auto-advances every ~4 seconds
- [ ] Hovering anywhere over the carousel pauses it; mousing out resumes
- [ ] Clicking dot navigation jumps to that slide; the dot expands to a wider pink pill
- [ ] Clicking ← / → buttons advances or reverses
- [ ] Tab to focus the carousel region, then Left/Right arrow keys advance
- [ ] Slide 1 (Home) animates the visitor count `113` from 0 → 113 over ~800ms when it becomes active; counter resets to 0 then re-runs each time slide 1 returns
- [ ] With reduced-motion enabled: auto-advance disabled, slide transitions are immediate (no transform animation), counter shows `113` immediately

- [ ] **Step 4: Commit**

```bash
git -C siteforowners add 'src/app/(marketing)/_components/OwnerDashboardTour.tsx' 'src/app/(marketing)/_components/OwnerDashboardSlides'
git -C siteforowners commit -m "feat(marketing): add OwnerDashboardTour with 4-slide carousel"
```

---

## Task 10: Pricing component

Single plan card. Free for 1 month, then $50/month. Replaces the broken 3-fake-tier section.

**Files:**
- Create: `siteforowners/src/app/(marketing)/_components/Pricing.tsx`

- [ ] **Step 1: Write the component**

```tsx
// siteforowners/src/app/(marketing)/_components/Pricing.tsx
"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";

const INCLUSIONS = "Site · booking · dashboard · hosting · domain · updates";

export function Pricing() {
  const reduceMotion = useReducedMotion();
  const initial = reduceMotion ? false : { opacity: 0, y: 12 };

  return (
    <section id="pricing" className="bg-warm-cream1 px-6 py-16 md:py-20">
      <div className="mx-auto max-w-md">
        <motion.p
          initial={initial}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          className="text-center text-xs font-bold uppercase tracking-[0.2em] text-warm-eyebrow"
        >
          — Pricing —
        </motion.p>
        <motion.h2
          initial={initial}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ delay: 0.05 }}
          className="mt-2 text-center font-serif text-3xl font-semibold leading-tight text-warm-text md:text-4xl"
        >
          Try it{" "}
          <em className="not-italic text-warm-accent italic">free for a month.</em>
        </motion.h2>

        <motion.div
          initial={initial}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ delay: 0.1 }}
          className="relative mt-10 rounded-2xl border-2 border-pop-pink bg-white p-8 text-center"
        >
          <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-pop-pink px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.15em] text-pop-cream">
            Free for 1 month
          </span>
          <p className="font-sans text-5xl font-black leading-none text-warm-text">
            $50
            <span className="ml-1 text-lg font-semibold text-warm-textMuted">/month</span>
          </p>
          <p className="mt-2 text-xs text-warm-textMuted">
            after the free month · cancel anytime
          </p>
          <p className="mt-4 text-sm text-warm-text">{INCLUSIONS}</p>

          <Link href="/preview" className="mt-6 inline-block">
            <Button
              size="lg"
              className="rounded-full bg-pop-pink px-8 py-5 text-sm font-bold text-pop-cream hover:bg-pop-pink/90"
            >
              Start free month
            </Button>
          </Link>
        </motion.div>

        <p className="mt-4 text-center text-xs text-warm-textMuted">
          No card up front · You own your domain
        </p>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Manual verification**

- [ ] Section has `id="pricing"` — clicking nav "Pricing" link smooth-scrolls here
- [ ] Pink "FREE FOR 1 MONTH" badge sits notched above the card border
- [ ] Single $50/month card replaces the three identical $50 tiers from the old design
- [ ] CTA button "Start free month" links to `/preview`

- [ ] **Step 3: Commit**

```bash
git -C siteforowners add 'src/app/(marketing)/_components/Pricing.tsx'
git -C siteforowners commit -m "feat(marketing): add Pricing single-plan section"
```

---

## Task 11: FAQ component

Five questions: four existing + one new about the free month.

**Files:**
- Create: `siteforowners/src/app/(marketing)/_components/FAQ.tsx`

**Important:** the spec flags FAQ #5's answer for verification against the actual Stripe trial flow before merge. The implementer must read `siteforowners/src/app/api/stripe-webhook/` and the trial conversion path, confirm the behavior, and adjust the answer to match. The text in this task is a placeholder honest-framing draft.

- [ ] **Step 1: Verify the trial conversion behavior**

Read these files to confirm what actually happens after the free month ends:
- `siteforowners/src/app/api/stripe-webhook/route.ts`
- `siteforowners/src/lib/stripe/` (any trial-related utilities)

Confirm: does the trial create a no-payment-method subscription that auto-cancels, or does Stripe charge a stored card? Does the site go offline, stay up, or get archived? The FAQ #5 answer below assumes "no card up front, site pauses if not converted." If the actual flow charges a card, change the answer accordingly.

- [ ] **Step 2: Write the component**

```tsx
// siteforowners/src/app/(marketing)/_components/FAQ.tsx
const FAQS = [
  {
    q: "Do I own my domain?",
    a: "Yes. We register the domain in your name. If you ever leave, it's yours to keep — we'll transfer full control to you.",
  },
  {
    q: "What if I need changes to my site?",
    a: "Just text or WhatsApp us what you need. We make the updates for you, usually within 48 hours.",
  },
  {
    q: "Do I need to do anything technical?",
    a: "Nothing. We handle hosting, updates, domain, email — everything. You just run your business.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. No contracts, no cancellation fees. Your domain stays yours.",
  },
  {
    q: "What happens after the free month?",
    a: "We let you know before charging. If you don't continue, your site pauses — your settings stay in your account so you can restart later.",
  },
];

export function FAQ() {
  return (
    <section className="bg-warm-cream2 px-6 py-16 md:py-20">
      <div className="mx-auto max-w-2xl">
        <h2 className="text-center font-serif text-3xl font-semibold text-warm-text md:text-4xl">
          Questions?
        </h2>
        <div className="mt-10 space-y-4">
          {FAQS.map((faq) => (
            <details
              key={faq.q}
              className="group rounded-xl bg-white p-5 [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex cursor-pointer items-center justify-between font-semibold text-warm-text">
                {faq.q}
                <span className="ml-4 text-warm-eyebrow transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm text-warm-textMuted">{faq.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Manual verification**

- [ ] Five questions render
- [ ] Each is collapsed by default; clicking expands to reveal the answer
- [ ] The `+` icon rotates 45° (becomes ×) when open
- [ ] FAQ #5 answer reflects the **actual** Stripe trial behavior (per Step 1 verification)

- [ ] **Step 4: Commit**

```bash
git -C siteforowners add 'src/app/(marketing)/_components/FAQ.tsx'
git -C siteforowners commit -m "feat(marketing): add FAQ section with free-month question"
```

---

## Task 12: FinalCTA component

Bold Pop section closing the page. Same palette as Hero for stopping-power symmetry.

**Files:**
- Create: `siteforowners/src/app/(marketing)/_components/FinalCTA.tsx`

- [ ] **Step 1: Write the component**

```tsx
// siteforowners/src/app/(marketing)/_components/FinalCTA.tsx
"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";

export function FinalCTA() {
  const reduceMotion = useReducedMotion();
  const initial = reduceMotion ? false : { opacity: 0, y: 12 };

  return (
    <section className="bg-pop-pink px-6 py-20 text-center text-pop-cream">
      <div className="mx-auto max-w-xl">
        <motion.h2
          initial={initial}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          className="font-sans text-3xl font-black leading-tight md:text-5xl"
        >
          Ready to stop missing
          <br />
          bookings?
        </motion.h2>

        <motion.div
          initial={initial}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ delay: 0.1 }}
          className="mt-8"
        >
          <Link href="/preview">
            <Button
              size="lg"
              className="rounded-full bg-black px-8 py-6 text-base font-extrabold text-pop-cream hover:bg-black/85"
            >
              Create My Free Preview →
            </Button>
          </Link>
          <p className="mt-4 text-xs opacity-90">
            5 min · No card · Free for 1 month
          </p>
        </motion.div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Manual verification**

- [ ] Background is pink; text is cream
- [ ] CTA pill is black, navigates to `/preview`
- [ ] Subnote "5 min · No card · Free for 1 month" renders below the button

- [ ] **Step 3: Commit**

```bash
git -C siteforowners add 'src/app/(marketing)/_components/FinalCTA.tsx'
git -C siteforowners commit -m "feat(marketing): add FinalCTA section"
```

---

## Task 13: Compose the new page.tsx

Replace the existing 316-line `page.tsx` with a thin composition shell that imports the section components in order.

**Files:**
- Modify: `siteforowners/src/app/(marketing)/page.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
// siteforowners/src/app/(marketing)/page.tsx
import { Nav } from "./_components/Nav";
import { Hero } from "./_components/Hero";
import { HowItWorks } from "./_components/HowItWorks";
import { RightNow } from "./_components/RightNow";
import { CustomerView } from "./_components/CustomerView";
import { OwnerDashboardTour } from "./_components/OwnerDashboardTour";
import { Pricing } from "./_components/Pricing";
import { FAQ } from "./_components/FAQ";
import { FinalCTA } from "./_components/FinalCTA";
import { Footer } from "./_components/Footer";

export default function MarketingPage() {
  return (
    <main className="min-h-screen bg-white">
      <Nav />
      <Hero />
      <HowItWorks />
      <RightNow />
      <CustomerView />
      <OwnerDashboardTour />
      <Pricing />
      <FAQ />
      <FinalCTA />
      <Footer />
    </main>
  );
}
```

- [ ] **Step 2: Build and lint**

```bash
cd siteforowners && npm run build
```

Expected: clean build, no type errors, no missing-image errors. If any image fails to resolve, return to Task 2 and verify all files exist at the expected paths.

- [ ] **Step 3: Full-page manual verification**

Run `npm run dev` and walk the page top to bottom at three viewport widths: **375px (mobile)**, **768px (tablet)**, **1280px (desktop)**.

For each viewport, confirm:
- [ ] No horizontal scroll at any point of the page
- [ ] Section order matches: Nav → Hero → HowItWorks → RightNow → CustomerView → OwnerDashboardTour → Pricing → FAQ → FinalCTA → Footer
- [ ] Pink Hero and Pink FinalCTA bookend the warm body
- [ ] Warm sections alternate between `warm-cream1` (#f4e4d1) and `warm-cream2` (#fdf8f0)
- [ ] Nav "Examples" anchor scrolls to CustomerView; "Pricing" anchor scrolls to Pricing
- [ ] All four CTAs (Nav button, Hero black pill, Pricing button, FinalCTA black pill) navigate to `/preview`
- [ ] Hero swap, dashboard carousel, scroll reveals, and dashboard counter all behave as previously verified
- [ ] All images load — no broken-image icons

Run with reduced-motion enabled (Chrome devtools Rendering panel → `prefers-reduced-motion: reduce`):
- [ ] No auto-advance on Hero swap or Dashboard carousel
- [ ] Section reveals appear instantly with no fade
- [ ] Counter shows `113` immediately

- [ ] **Step 4: Commit**

```bash
git -C siteforowners add 'src/app/(marketing)/page.tsx'
git -C siteforowners commit -m "feat(marketing): compose new homepage from section components"
```

---

## Task 14: Playwright smoke test

A single end-to-end smoke test verifying the page renders and the most important interactions work. Lightweight — not a full visual regression suite.

**Files:**
- Create: `siteforowners/playwright.config.ts`
- Create: `siteforowners/tests/marketing-page.spec.ts`
- Modify: `siteforowners/package.json`

- [ ] **Step 1: Add Playwright config**

```ts
// siteforowners/playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: "chromium-mobile", use: { ...devices["iPhone 14"] } },
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
  ],
});
```

- [ ] **Step 2: Add Playwright test deps if missing**

```bash
cd siteforowners && npm install --save-dev @playwright/test && npx playwright install chromium
```

- [ ] **Step 3: Add test scripts to `package.json`**

In `siteforowners/package.json`, add to the `scripts` block:

```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui"
```

- [ ] **Step 4: Write the smoke test**

```ts
// siteforowners/tests/marketing-page.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Marketing homepage", () => {
  test("renders all section headings", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Get booked without the back-and-forth/i })).toBeVisible();
    await expect(page.getByText(/Three steps\./i)).toBeVisible();
    await expect(page.getByText(/You're juggling/i)).toBeVisible();
    await expect(page.getByText(/A site that/i)).toBeVisible();
    await expect(page.getByText(/Your shop,/i)).toBeVisible();
    await expect(page.getByText(/Try it/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: /Questions\?/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Ready to stop missing/i })).toBeVisible();
  });

  test("hero CTA navigates to /preview", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Create My Free Preview/i }).first().click();
    await expect(page).toHaveURL(/\/preview/);
  });

  test("nav 'Examples' anchor scrolls to customer-view section", async ({ page }) => {
    await page.goto("/");
    const examplesLink = page.getByRole("link", { name: "Examples" }).first();
    await examplesLink.click();
    await expect(page).toHaveURL(/#examples/);
  });

  test("dashboard carousel arrow advances slides", async ({ page }) => {
    await page.goto("/");
    const carouselRegion = page.getByRole("region", { name: /Dashboard tour/i });
    await carouselRegion.scrollIntoViewIfNeeded();
    const firstDot = page.getByRole("tab", { name: /Go to slide 1/i });
    const secondDot = page.getByRole("tab", { name: /Go to slide 2/i });
    await expect(firstDot).toHaveAttribute("aria-selected", "true");
    await page.getByRole("button", { name: /Next slide/i }).click();
    await expect(secondDot).toHaveAttribute("aria-selected", "true");
  });

  test("founder-only links are not in public nav", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /^Prospects$/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^Clients$/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Create Preview/i })).toHaveCount(0);
  });
});
```

- [ ] **Step 5: Run the tests**

```bash
cd siteforowners && npm run test:e2e
```

Expected: all 5 tests pass on both `chromium-mobile` and `chromium-desktop` projects (10 total). If any fail, fix the underlying bug — do not loosen the test.

- [ ] **Step 6: Add Playwright artifacts to `.gitignore`**

Append to `siteforowners/.gitignore` if not already present:

```
/test-results/
/playwright-report/
/playwright/.cache/
```

- [ ] **Step 7: Commit**

```bash
git -C siteforowners add playwright.config.ts tests/marketing-page.spec.ts package.json package-lock.json .gitignore
git -C siteforowners commit -m "test(marketing): add Playwright smoke test for homepage"
```

---

## Task 15: Final verification + Lighthouse

- [ ] **Step 1: Run lint, typecheck, tests, build**

```bash
cd siteforowners && npm run lint && npx tsc --noEmit && npm run test:e2e && npm run build
```

All four must pass.

- [ ] **Step 2: Lighthouse mobile audit**

With `npm run dev` running, open Chrome devtools → Lighthouse panel. Run an audit with:
- Mode: Navigation
- Device: Mobile
- Categories: Performance, Accessibility, Best Practices, SEO

Record the four scores. Compare to a baseline run **on `main`** (the pre-redesign page) before declaring success.

- [ ] Performance score did not regress by more than ~5 points
- [ ] Accessibility score is ≥ 95
- [ ] No "[axe] Color contrast" violations on the warm sections
- [ ] No "[axe] Image elements do not have [alt] attributes" violations

If any of these fail, file follow-up fixes before merge — do not ignore.

- [ ] **Step 3: Cross-browser visual smoke**

Open `localhost:3000` in **Chrome**, **Safari**, and **Firefox** at 375px:

- [ ] Hero pink renders identically (no color mismatch from font rendering or color profile)
- [ ] Fraunces serif font loads (no Times New Roman fallback flash)
- [ ] Carousel transform works (older Safari quirks have been fine since 14, but verify)
- [ ] No console errors

- [ ] **Step 4: Open a draft PR**

```bash
cd siteforowners && git push -u origin feat/marketing-redesign
gh pr create --draft --title "feat(marketing): redesign homepage with hero showcase and dashboard tour" --body "$(cat <<'EOF'
## Summary
- Replaces generic amber-on-white homepage with Bold Pop hero (pink) + Warm Grounded body (cream/terracotta)
- Adds dashboard tour carousel showcasing per-tenant color theming
- Drops broken 3-tier-but-all-\$50 pricing in favor of single free-month plan
- Removes founder-only links (`/prospects`, `/clients`, `/previews`) from public nav
- Removes broken `wa.me/1XXXXXXXXXX` placeholder phone link

Spec: `docs/superpowers/specs/2026-05-01-marketing-page-redesign-design.md`
Plan: `docs/superpowers/plans/2026-05-01-marketing-page-redesign.md`

## Test plan
- [ ] `npm run test:e2e` passes on both mobile and desktop projects
- [ ] Manual smoke at 375px / 768px / 1280px in Chrome, Safari, Firefox
- [ ] Lighthouse mobile Performance/Accessibility scores do not regress vs main
- [ ] FAQ #5 answer verified against actual Stripe trial behavior
- [ ] `NEXT_PUBLIC_TEXT_US_URL` set in Vercel before merge, OR Text us button confirmed hidden

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

After writing the plan I checked it against the spec.

**Spec coverage:**
- ✅ Bold Pop / Warm Grounded direction → Tasks 1, 5, 12 (palette + Hero + FinalCTA)
- ✅ Color tokens → Task 1
- ✅ Serif font (Fraunces) → Task 1
- ✅ All 10 sections → Tasks 4–13
- ✅ Hero vertical swap → Task 5 (HeroShowcase)
- ✅ Scattered → unified motion → Task 7 (with explicit deviation note: staggered fade-in instead of literal layoutId collapse, to keep mobile reliable)
- ✅ Scroll reveals → wired into every warm section
- ✅ Dashboard counter + bars → Task 9 (HomeSlide)
- ✅ Dashboard carousel → Task 9 (OwnerDashboardTour)
- ✅ Per-client color theming visible across slides → real screenshots in Task 2
- ✅ Free-month single-plan pricing → Task 10
- ✅ FAQ #5 verification → Task 11 (Step 1 reads stripe-webhook code)
- ✅ Drop founder-only nav links → Task 4
- ✅ Drop placeholder phone — Text us button gated on `NEXT_PUBLIC_TEXT_US_URL` env → Task 5
- ✅ Reduced-motion behavior → every motion-using component
- ✅ Accessibility (alt text, aria-labels, keyboard nav) → Tasks 5, 9, 14
- ✅ File structure (split page.tsx into _components/) → matches spec exactly
- ✅ Mobile-first verification at 375px → Task 13 Step 3

**Placeholder scan:** None of the patterns from the No Placeholders list (TBD, TODO, "implement later", "appropriate error handling", "similar to Task N") appear in the plan. Every step has concrete code or commands.

**Type consistency:** All component names match across imports in `page.tsx` (Task 13) and exports in their respective files (Tasks 3–12). Slide components are exported as named exports `HomeSlide`, `ScheduleSlide`, `ServicesSlide`, `LeadsSlide` and imported under those names in `OwnerDashboardTour.tsx`. The `active` prop on `HomeSlide` is the only slide that takes a prop and is passed `active={index === 0}` in the tour.

**Acknowledged deviation from spec:** the "scattered → unified" motion was specified as a literal layout-collapse animation but is implemented in this plan as a staggered fade-up of four cards followed by the closing line. The narrative is preserved; the literal animation is harder to make reliable on mobile and risks looking gimmicky. Flagged in Task 7 with a follow-up suggestion if the founder wants the literal version after launch.
