# Editorial Runway Hair Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one dedicated `runway` website template for locs and natural hair brands with a black-and-gold editorial fashion aesthetic, image-led sections, premium motion, and existing booking behavior.

**Architecture:** Add focused runway components for the visual surface area: hero, services, gallery, about, and booking CTA. Keep shared booking, testimonials, products, contact, map, footer, service modal, localization, section visibility, and booking-mode plumbing inside `TemplateOrchestrator`. Expose the new template id through TypeScript types, theme options, orchestrator selection, and the owner template override dropdown.

**Tech Stack:** Next.js 14 App Router, TypeScript, React 18, Tailwind CSS, Framer Motion, `next/image`, existing `AnimateSection`, existing booking event helpers.

---

## File Map

### Create

```text
src/components/templates/heroes/RunwayHero.tsx
src/components/templates/services/RunwayServices.tsx
src/components/templates/galleries/RunwayGallery.tsx
src/components/templates/about/RunwayAbout.tsx
src/components/templates/RunwayBookingCTA.tsx
```

### Modify

```text
src/lib/ai/types.ts
src/lib/templates/themes.ts
src/components/templates/TemplateOrchestrator.tsx
src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx
```

### Reference

```text
docs/superpowers/specs/2026-04-29-editorial-runway-hair-template-design.md
docs/editorial-runway-mockup.html
src/components/templates/services/ClassicServices.tsx
src/components/templates/galleries/BoldGallery.tsx
src/components/templates/about/BoldAbout.tsx
src/components/templates/shared/AnimateSection.tsx
```

---

## Task 1: Add `runway` To Types, Theme Options, And Owner Selector

**Files:**
- Modify: `src/lib/ai/types.ts`
- Modify: `src/lib/templates/themes.ts`
- Modify: `src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx`

- [ ] **Step 1: Extend `TemplateName`**

In `src/lib/ai/types.ts`, change the `TemplateName` type to include `runway`:

```typescript
export type TemplateName = 'classic' | 'bold' | 'elegant' | 'vibrant' | 'warm' | 'runway';
```

- [ ] **Step 2: Add `Runway Noir` to salon themes**

In `src/lib/templates/themes.ts`, append this object to the `salon` theme array after `salon_noir`:

```typescript
    {
      id: 'salon_runway_noir',
      name: 'Runway Noir',
      colors: {
        primary: '#D8B255',
        secondary: '#0A0A0A',
        accent: '#F2CD73',
        background: '#050505',
        foreground: '#FFF4D8',
        muted: '#18130C',
      },
      previewSwatch: ['#D8B255', '#0A0A0A', '#050505'],
    },
```

- [ ] **Step 3: Add `Runway Noir` to braids themes**

In `src/lib/templates/themes.ts`, append this object to the `braids` theme array after `braids_jade`:

```typescript
    {
      id: 'braids_runway_noir',
      name: 'Runway Noir',
      colors: {
        primary: '#D8B255',
        secondary: '#0A0A0A',
        accent: '#F2CD73',
        background: '#050505',
        foreground: '#FFF4D8',
        muted: '#18130C',
      },
      previewSwatch: ['#D8B255', '#0A0A0A', '#050505'],
    },
```

- [ ] **Step 4: Extend `ColorTheme` union**

In `src/lib/ai/types.ts`, add the new theme ids to the union:

```typescript
// Salon
| 'salon_gold' | 'salon_rose' | 'salon_mocha' | 'salon_lavender' | 'salon_midnight'
| 'salon_emerald' | 'salon_peach' | 'salon_noir' | 'salon_runway_noir'
// Braids
| 'braids_kente' | 'braids_royal' | 'braids_earth' | 'braids_ocean' | 'braids_sunset'
| 'braids_midnight' | 'braids_coral' | 'braids_jade' | 'braids_runway_noir';
```

- [ ] **Step 5: Add Runway to owner template dropdown**

In `src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx`, add this option after Warm:

```tsx
<option value="runway">Runway</option>
```

- [ ] **Step 6: Run type check**

Run:

```bash
cd /Users/aws/Downloads/web-project/siteforowners && npx tsc --noEmit
```

Expected: exits successfully with no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ai/types.ts src/lib/templates/themes.ts src/app/\(admin\)/clients/\[tenantId\]/edit/SiteEditor.tsx
git commit -m "feat: expose runway template option"
```

---

## Task 2: Create `RunwayHero`

**Files:**
- Create: `src/components/templates/heroes/RunwayHero.tsx`

- [ ] **Step 1: Create the hero component**

Create `src/components/templates/heroes/RunwayHero.tsx` with this implementation:

```tsx
"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import type { ThemeColors } from "@/lib/templates/themes";
import { isEmbeddableBookingUrl } from "../TemplateBooking";

interface RunwayHeroProps {
  businessName: string;
  headline: string;
  subheadline: string;
  heroImage?: string;
  heroVideo?: string;
  colors: ThemeColors;
  bookingUrl?: string;
  rating?: number;
  reviewCount?: number;
}

const RUNWAY = {
  black: "#050505",
  panel: "#0D0B08",
  gold: "#D8B255",
  ivory: "#FFF4D8",
};

function splitHeadline(headline: string): [string, string] {
  const words = headline.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 2) return [headline, "Elevated"];
  const midpoint = Math.ceil(words.length / 2);
  return [words.slice(0, midpoint).join(" "), words.slice(midpoint).join(" ")];
}

export function RunwayHero({
  businessName,
  headline,
  subheadline,
  heroImage,
  heroVideo,
  bookingUrl,
  rating,
  reviewCount,
}: RunwayHeroProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [headlineTop, headlineBottom] = splitHeadline(headline);
  const isInternal = !bookingUrl || isEmbeddableBookingUrl(bookingUrl);
  const ctaHref = bookingUrl ? (isInternal ? "#booking" : bookingUrl) : "#booking";

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !heroVideo) return;
    el.muted = true;
    const tryPlay = () => {
      el.play().catch(() => {});
    };
    tryPlay();
    const onFirstTouch = () => tryPlay();
    document.addEventListener("touchstart", onFirstTouch, { once: true, passive: true });
    return () => document.removeEventListener("touchstart", onFirstTouch);
  }, [heroVideo]);

  return (
    <section
      className="relative min-h-[92vh] overflow-hidden px-6 pb-12 pt-28 text-[#FFF4D8] md:min-h-screen md:px-[7vw] md:pb-16 md:pt-32"
      style={{
        background:
          "radial-gradient(circle at 12% 8%, rgba(216,178,85,.18), transparent 26rem), radial-gradient(circle at 88% 18%, rgba(216,178,85,.18), transparent 24rem), #050505",
      }}
    >
      <div className="grid items-end gap-10 md:grid-cols-[minmax(0,1.1fr)_minmax(280px,.72fr)]">
        <div className="relative z-10">
          <motion.p
            className="text-xs font-black uppercase tracking-[0.34em] text-[#D8B255]"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
          >
            Natural Hair Atelier
          </motion.p>

          <motion.h1
            className="mt-6 max-w-5xl text-[clamp(4.2rem,11vw,10.5rem)] font-black uppercase leading-[0.78] tracking-[-0.085em]"
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.08, ease: "easeOut" }}
          >
            <span className="block animate-[runway-drift_7s_ease-in-out_infinite]">{headlineTop}</span>
            <span className="block animate-[runway-drift_7s_ease-in-out_infinite] text-[#D8B255] [animation-delay:.18s] [text-shadow:0_0_42px_rgba(216,178,85,.38)]">
              {headlineBottom}
            </span>
          </motion.h1>

          <motion.p
            className="mt-7 max-w-md text-base leading-8 text-[#FFF4D8]/70"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.18 }}
          >
            {subheadline}
          </motion.p>

          <motion.div
            className="mt-8 flex flex-wrap gap-3"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.28 }}
          >
            <Button
              className="h-13 rounded-none border border-[#D8B255] bg-[#D8B255] px-6 text-xs font-black uppercase tracking-[0.16em] text-[#050505] shadow-[0_0_34px_rgba(216,178,85,.26)] transition-all hover:-translate-y-0.5 hover:bg-[#F2CD73] hover:shadow-[0_0_42px_rgba(216,178,85,.28)]"
              asChild
            >
              <a href={ctaHref} target={isInternal ? undefined : "_blank"} rel={isInternal ? undefined : "noopener noreferrer"}>
                Book The Chair
              </a>
            </Button>
            <Button
              variant="outline"
              className="h-13 rounded-none border-[#FFF4D8]/30 bg-transparent px-6 text-xs font-black uppercase tracking-[0.16em] text-[#FFF4D8] transition-all hover:-translate-y-0.5 hover:border-[#D8B255] hover:bg-transparent hover:text-[#D8B255]"
              asChild
            >
              <a href="#gallery">View The Work</a>
            </Button>
          </motion.div>
        </div>

        <motion.div
          className="relative z-10 min-h-[420px] md:min-h-[540px]"
          initial={{ opacity: 0, x: 44 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.75, delay: 0.2, ease: "easeOut" }}
        >
          <div className="absolute inset-0 ml-auto w-full overflow-hidden border border-white/15 bg-white/10 shadow-[0_34px_100px_rgba(0,0,0,.72)] md:w-[390px]">
            {heroVideo ? (
              <video
                ref={videoRef}
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                poster={heroImage}
                src={heroVideo}
                className="h-full w-full scale-105 object-cover object-top brightness-75 contrast-110 saturate-95 transition duration-700 hover:scale-110 hover:brightness-90"
              />
            ) : heroImage ? (
              <Image
                src={heroImage}
                alt=""
                fill
                priority
                sizes="(min-width: 768px) 390px, 100vw"
                className="scale-105 object-cover object-top brightness-75 contrast-110 saturate-95 transition duration-700 hover:scale-110 hover:brightness-90"
                unoptimized
              />
            ) : (
              <div className="h-full w-full bg-[linear-gradient(150deg,#27170f,#070707_45%,#c5963b)]" />
            )}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_15%,rgba(216,178,85,.28),transparent_16rem),linear-gradient(180deg,rgba(0,0,0,.05),rgba(0,0,0,.52))]" />
            <div className="pointer-events-none absolute inset-6 border border-[#D8B255]/45 [clip-path:polygon(0_0,100%_0,82%_100%,0_100%)]" />
          </div>

          {(rating || reviewCount) && (
            <div className="absolute bottom-5 left-5 z-20 w-[210px] border border-[#D8B255]/30 bg-[#0D0B08]/70 p-5 shadow-[0_0_50px_rgba(216,178,85,.15)] backdrop-blur-xl md:-left-20 md:bottom-16">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#D8B255]">Premium Proof</p>
              {rating && <p className="mt-1 text-3xl font-black leading-none text-[#FFF4D8]">{rating.toFixed(1)} Stars</p>}
              <p className="mt-2 text-xs leading-5 text-[#FFF4D8]/65">
                {reviewCount ? `${reviewCount} reviews for texture, shape, and lasting style.` : "Trusted for texture, shape, and lasting style."}
              </p>
            </div>
          )}
        </motion.div>
      </div>

      <style jsx>{`
        @keyframes runway-drift {
          0%, 100% { transform: translateX(0); opacity: 1; }
          45% { transform: translateX(12px); opacity: .92; }
        }
      `}</style>
    </section>
  );
}
```

- [ ] **Step 2: Run type check**

Run:

```bash
cd /Users/aws/Downloads/web-project/siteforowners && npx tsc --noEmit
```

Expected: exits successfully with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/templates/heroes/RunwayHero.tsx
git commit -m "feat: add runway hero template"
```

---

## Task 3: Create `RunwayServices`

**Files:**
- Create: `src/components/templates/services/RunwayServices.tsx`

- [ ] **Step 1: Create the services component**

Create `src/components/templates/services/RunwayServices.tsx` with this implementation:

```tsx
"use client";

import { useState } from "react";
import type { ServiceItem } from "@/lib/ai/types";
import { formatDuration } from "@/lib/availability";
import { openBookingCalendarForService, requestBookingChoice } from "@/lib/booking-events";
import type { ThemeColors } from "@/lib/templates/themes";
import { AnimateSection } from "../shared/AnimateSection";
import { groupServices } from "./groupServices";

type Mode = "in_site_only" | "external_only" | "both";

type DisplayService = {
  name: string;
  price: string;
  description?: string;
  bookingDeepLink?: string;
  durationMinutes?: number;
  image?: string;
  category?: string;
};

interface RunwayServicesProps {
  services: DisplayService[];
  categories?: string[];
  colors: ThemeColors;
  bookingMode?: Mode;
}

export function RunwayServices({ services, categories, bookingMode }: RunwayServicesProps) {
  const groups = groupServices(services as unknown as ServiceItem[], categories);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggle = (label: string) => setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));

  const renderService = (service: DisplayService, index: number) => {
    const mode = bookingMode ?? "in_site_only";
    const canBook = !(mode === "external_only" && !service.bookingDeepLink);
    const triggerBook = () => {
      if (mode === "external_only" && service.bookingDeepLink) {
        window.open(service.bookingDeepLink, "_blank", "noopener,noreferrer");
      } else if (mode === "both" && service.bookingDeepLink) {
        requestBookingChoice(service.name, service.bookingDeepLink);
      } else {
        openBookingCalendarForService(service.name);
      }
    };

    return (
      <AnimateSection key={service.name} delay={index * 0.08} animation="fade-up">
        <article
          className={`group relative min-h-[240px] overflow-hidden border border-[#D8B255]/25 bg-white/[0.045] p-6 transition duration-300 hover:-translate-y-1.5 hover:border-[#D8B255]/60 hover:shadow-[0_0_45px_rgba(216,178,85,.16)] ${
            canBook ? "cursor-pointer" : ""
          }`}
          {...(canBook
            ? {
                role: "button",
                tabIndex: 0,
                onClick: triggerBook,
                onKeyDown: (e: React.KeyboardEvent) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    triggerBook();
                  }
                },
              }
            : {})}
        >
          <div className="pointer-events-none absolute left-[-110%] top-0 h-px w-[90%] bg-gradient-to-r from-transparent via-[#D8B255] to-transparent transition-all duration-500 group-hover:left-[110%]" />
          {service.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={service.image}
              alt={service.name}
              className="-mx-6 -mt-6 mb-6 h-40 w-[calc(100%+3rem)] object-cover brightness-75 contrast-110 saturate-95 transition duration-500 group-hover:scale-105 group-hover:brightness-90"
            />
          )}
          <p className="text-xs font-black uppercase tracking-[0.34em] text-[#D8B255]">{String(index + 1).padStart(2, "0")}</p>
          <div className="mt-10 flex items-start justify-between gap-4">
            <h3 className="text-3xl font-black uppercase leading-none tracking-[-0.04em] text-[#FFF4D8]">{service.name}</h3>
            <div className="shrink-0 text-right">
              <p className="font-black text-[#D8B255]">{service.price}</p>
              <p className="mt-1 text-xs text-[#FFF4D8]/55">{formatDuration(service.durationMinutes ?? 60)}</p>
            </div>
          </div>
          {service.description && <p className="mt-4 line-clamp-4 text-sm leading-6 text-[#FFF4D8]/65">{service.description}</p>}
          {canBook && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                triggerBook();
              }}
              className="mt-6 w-full border border-[#D8B255]/70 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-[#D8B255] transition hover:bg-[#D8B255] hover:text-[#050505]"
            >
              Book This Look
            </button>
          )}
        </article>
      </AnimateSection>
    );
  };

  return (
    <section className="bg-[#050505] px-6 py-24 text-[#FFF4D8] md:px-[7vw]" id="services">
      <div className="mx-auto max-w-7xl">
        <AnimateSection>
          <div className="mb-10 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <h2 className="max-w-3xl text-5xl font-black uppercase leading-[0.86] tracking-[-0.065em] md:text-7xl">Signature Services</h2>
            <p className="max-w-sm text-sm leading-7 text-[#FFF4D8]/65">
              Sharp service cards for locs, natural hair care, protective styling, and premium appointment booking.
            </p>
          </div>
        </AnimateSection>

        {groups.map((group) => {
          const isCollapsed = group.label ? !!collapsed[group.label] : false;
          return (
            <div key={group.label ?? "_flat"} className="mb-10">
              {group.label && (
                <button
                  type="button"
                  onClick={() => toggle(group.label!)}
                  className="mb-5 flex w-full items-center justify-between border-b border-[#D8B255]/35 pb-3 text-left"
                >
                  <span className="text-xs font-black uppercase tracking-[0.28em] text-[#D8B255]">{group.label}</span>
                  <span className="text-[#FFF4D8]/65" aria-hidden>{isCollapsed ? "▸" : "▾"}</span>
                </button>
              )}
              {!isCollapsed && (
                <div className="grid gap-4 md:grid-cols-3">
                  {(group.services as DisplayService[]).map((service, index) => renderService(service, index))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Run type check**

Run:

```bash
cd /Users/aws/Downloads/web-project/siteforowners && npx tsc --noEmit
```

Expected: exits successfully with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/templates/services/RunwayServices.tsx
git commit -m "feat: add runway services section"
```

---

## Task 4: Create `RunwayGallery`, `RunwayAbout`, And `RunwayBookingCTA`

**Files:**
- Create: `src/components/templates/galleries/RunwayGallery.tsx`
- Create: `src/components/templates/about/RunwayAbout.tsx`
- Create: `src/components/templates/RunwayBookingCTA.tsx`

- [ ] **Step 1: Create `RunwayGallery`**

Create `src/components/templates/galleries/RunwayGallery.tsx`:

```tsx
"use client";

import Image from "next/image";
import type { ThemeColors } from "@/lib/templates/themes";
import { AnimateSection } from "../shared/AnimateSection";

interface RunwayGalleryProps {
  images: string[];
  colors: ThemeColors;
}

export function RunwayGallery({ images }: RunwayGalleryProps) {
  if (images.length === 0) return null;

  return (
    <section id="gallery" className="bg-[#050505] px-6 py-24 text-[#FFF4D8] md:px-[7vw]">
      <div className="mx-auto max-w-7xl">
        <AnimateSection>
          <div className="mb-10 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <h2 className="max-w-3xl text-5xl font-black uppercase leading-[0.86] tracking-[-0.065em] md:text-7xl">Gallery After The Chair</h2>
            <p className="max-w-sm text-sm leading-7 text-[#FFF4D8]/65">
              A dramatic bento gallery for model imagery, finished styles, texture, shape, and detail.
            </p>
          </div>
        </AnimateSection>

        <div className="grid gap-4 md:grid-cols-[1.2fr_.8fr_1fr]">
          {images.slice(0, 6).map((src, index) => (
            <AnimateSection key={`${src}-${index}`} delay={index * 0.08} animation="scale-in">
              <div className={`group relative overflow-hidden border border-white/15 bg-[#0D0B08] ${index === 0 || index === 2 ? "min-h-[380px]" : "min-h-[250px]"}`}>
                <Image
                  src={src}
                  alt={`Gallery image ${index + 1}`}
                  fill
                  sizes="(min-width: 768px) 33vw, 100vw"
                  className="object-cover brightness-75 contrast-110 saturate-95 transition duration-700 group-hover:scale-110 group-hover:brightness-95"
                  unoptimized
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#050505]/70 via-transparent to-transparent" />
                <div className="absolute inset-5 border border-[#D8B255]/0 transition group-hover:border-[#D8B255]/45" />
              </div>
            </AnimateSection>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Create `RunwayAbout`**

Create `src/components/templates/about/RunwayAbout.tsx`:

```tsx
"use client";

import Image from "next/image";
import type { ThemeColors } from "@/lib/templates/themes";
import { AnimateSection } from "../shared/AnimateSection";

interface RunwayAboutProps {
  paragraphs: string[];
  image?: string;
  colors: ThemeColors;
}

export function RunwayAbout({ paragraphs, image }: RunwayAboutProps) {
  const pullQuote = paragraphs[0] || "Texture respected. Style elevated.";
  const rest = paragraphs.slice(1);

  return (
    <section className="bg-[#050505] px-6 py-24 text-[#FFF4D8] md:px-[7vw]">
      <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[.9fr_1.1fr] md:items-stretch">
        {image && (
          <AnimateSection animation="slide-left">
            <div className="relative min-h-[360px] overflow-hidden border border-[#D8B255]/25 bg-[#0D0B08]">
              <Image src={image} alt="" fill sizes="(min-width: 768px) 40vw, 100vw" className="object-cover brightness-75 contrast-110 saturate-95" unoptimized />
              <div className="absolute inset-0 bg-gradient-to-t from-[#050505]/70 via-transparent to-transparent" />
            </div>
          </AnimateSection>
        )}
        <AnimateSection animation="slide-right">
          <div className="h-full border border-white/10 bg-white/[0.055] p-8 shadow-[0_0_60px_rgba(216,178,85,.08)] backdrop-blur-xl md:p-12">
            <p className="text-xs font-black uppercase tracking-[0.34em] text-[#D8B255]">Brand Story</p>
            <blockquote className="mt-6 text-4xl font-black uppercase leading-[0.92] tracking-[-0.055em] text-[#FFF4D8] md:text-6xl">
              &ldquo;{pullQuote}&rdquo;
            </blockquote>
            <div className="mt-8 space-y-5">
              {rest.map((paragraph, index) => (
                <p key={index} className="text-base leading-8 text-[#FFF4D8]/68">{paragraph}</p>
              ))}
            </div>
          </div>
        </AnimateSection>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Create `RunwayBookingCTA`**

Create `src/components/templates/RunwayBookingCTA.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";

export function RunwayBookingCTA() {
  return (
    <section className="flex flex-col gap-6 bg-gradient-to-r from-[#D8B255] to-[#8F6D22] px-6 py-12 text-[#050505] md:flex-row md:items-center md:justify-between md:px-[7vw]">
      <h2 className="max-w-xl text-5xl font-black uppercase leading-[0.86] tracking-[-0.065em] md:text-7xl">
        Ready for the chair?
      </h2>
      <Button
        className="h-14 rounded-none border border-[#050505] bg-[#050505] px-8 text-xs font-black uppercase tracking-[0.18em] text-[#FFF4D8] transition hover:-translate-y-0.5 hover:bg-[#050505] hover:shadow-[0_0_44px_rgba(5,5,5,.28)]"
        asChild
      >
        <a href="#booking">Book Now</a>
      </Button>
    </section>
  );
}
```

- [ ] **Step 4: Run type check**

Run:

```bash
cd /Users/aws/Downloads/web-project/siteforowners && npx tsc --noEmit
```

Expected: exits successfully with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/templates/galleries/RunwayGallery.tsx src/components/templates/about/RunwayAbout.tsx src/components/templates/RunwayBookingCTA.tsx
git commit -m "feat: add runway supporting sections"
```

---

## Task 5: Integrate `runway` In `TemplateOrchestrator`

**Files:**
- Modify: `src/components/templates/TemplateOrchestrator.tsx`

- [ ] **Step 1: Add imports**

Add these imports near the existing template imports:

```tsx
import { RunwayHero } from "./heroes/RunwayHero";
import { RunwayServices } from "./services/RunwayServices";
import { RunwayGallery } from "./galleries/RunwayGallery";
import { RunwayAbout } from "./about/RunwayAbout";
import { RunwayBookingCTA } from "./RunwayBookingCTA";
```

- [ ] **Step 2: Extend local template type and validation**

Change:

```tsx
type TemplateName = "classic" | "bold" | "elegant" | "vibrant" | "warm";
```

to:

```tsx
type TemplateName = "classic" | "bold" | "elegant" | "vibrant" | "warm" | "runway";
```

Change the validation array in `getTemplateName` from:

```tsx
["classic", "bold", "elegant", "vibrant", "warm"]
```

to:

```tsx
["classic", "bold", "elegant", "vibrant", "warm", "runway"]
```

- [ ] **Step 3: Add the runway render branch**

In `renderTemplate`, add this `case` before `case "bold"`:

```tsx
    case "runway":
      return (
        <div className="bg-[#050505]">
          <SiteNav items={navItems} colors={colors} locale={locale} onLocaleChange={setLocale} />
          <div id="hero">
            <RunwayHero
              businessName={data.business_name}
              headline={headline}
              subheadline={subheadline}
              heroImage={heroImage}
              heroVideo={heroVideo}
              colors={colors}
              bookingUrl={data.booking_url}
              rating={data.rating}
              reviewCount={data.review_count}
            />
          </div>
          {showServices && (
            <RunwayServices services={services} categories={categories} colors={colors} bookingMode={bookingMode} />
          )}
          <div className="overflow-hidden border-y border-[#D8B255]/25 bg-[#0A0907] py-4 text-xs font-black uppercase tracking-[0.28em] text-[#D8B255]">
            <div className="animate-[runway-marquee_18s_linear_infinite] whitespace-nowrap">
              Starter Locs · Retwist · Loc Styling · Natural Hair Care · Protective Styles · Editorial Finish · Starter Locs · Retwist · Loc Styling · Natural Hair Care · Protective Styles · Editorial Finish ·
            </div>
          </div>
          {showGallery && galleryImages.length > 0 && <RunwayGallery images={galleryImages} colors={colors} />}
          {showAbout && (
            <div id="about">
              <RunwayAbout paragraphs={aboutParagraphs} image={showAboutImage ? (aboutImageOverride || data.images?.[1]) : undefined} colors={colors} />
            </div>
          )}
          {productsSection}
          {testimonialsSection || ratingSection}
          <RunwayBookingCTA />
          {bookingSection}
          {contactSection}
          {mapSection}
          {footerSection}
          <style jsx>{`
            @keyframes runway-marquee {
              from { transform: translateX(0); }
              to { transform: translateX(-50%); }
            }
          `}</style>
        </div>
      );
```

- [ ] **Step 4: Verify section anchors**

Confirm these anchors exist in the runway branch:

```tsx
<div id="hero">...</div>
<RunwayServices ... />
<RunwayGallery ... />
<div id="about">...</div>
{bookingSection}
{contactSection}
```

Expected: `SiteNav` can scroll to visible sections using existing `navItems`.

- [ ] **Step 5: Run type check**

Run:

```bash
cd /Users/aws/Downloads/web-project/siteforowners && npx tsc --noEmit
```

Expected: exits successfully with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/templates/TemplateOrchestrator.tsx
git commit -m "feat: wire runway template renderer"
```

---

## Task 6: Verification And Visual QA

**Files:**
- Verify: `src/components/templates/TemplateOrchestrator.tsx`
- Verify: `src/components/templates/heroes/RunwayHero.tsx`
- Verify: `src/components/templates/services/RunwayServices.tsx`
- Verify: `src/components/templates/galleries/RunwayGallery.tsx`
- Verify: `src/components/templates/about/RunwayAbout.tsx`
- Verify: `src/components/templates/RunwayBookingCTA.tsx`
- Verify: `src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx`

- [ ] **Step 1: Run TypeScript**

Run:

```bash
cd /Users/aws/Downloads/web-project/siteforowners && npx tsc --noEmit
```

Expected: exits successfully with no TypeScript errors.

- [ ] **Step 2: Run lint**

Run:

```bash
cd /Users/aws/Downloads/web-project/siteforowners && npm run lint
```

Expected: exits successfully or reports only pre-existing unrelated warnings. Any new errors in runway files must be fixed.

- [ ] **Step 3: Start dev server**

Run:

```bash
cd /Users/aws/Downloads/web-project/siteforowners && npm run dev
```

Expected: Next.js starts and prints a local URL, usually `http://localhost:3000`.

- [ ] **Step 4: Manual owner selector check**

Open an owner edit page and confirm the Template Style dropdown includes:

```text
Runway
```

Expected: selecting `Runway` stores `section_settings.template_override` as `runway` and the preview renders the new template.

- [ ] **Step 5: Manual public rendering check**

Open a site preview/live route that has images and services, set `template_override` to `runway`, and verify:

```text
Hero shows large editorial headline, hero image/video, rating proof card when rating exists.
Services show image cards, price, duration, description, and Book This Look buttons.
Gallery shows image tiles when more than one image exists.
About shows image and glass text panel when enabled.
Booking CTA appears above the existing booking section.
Existing booking modal and service preselection still work.
```

- [ ] **Step 6: Manual mobile check**

Use browser responsive mode at `390x844` and verify:

```text
Headline does not overflow horizontally.
Hero media stacks below text.
Service cards are one column.
Gallery is one column.
CTA buttons remain comfortably tappable.
No horizontal page scroll appears.
```

- [ ] **Step 7: Commit verification fixes**

If verification required fixes, commit them:

```bash
git add src
git commit -m "fix: polish runway template verification issues"
```

If no fixes were needed, do not create an empty commit.

---

## Self-Review Notes

- Spec coverage: this plan covers the new `runway` variant, black/gold theme, hero, moving headline, marquee, services, gallery, about, booking CTA, existing booking behavior, owner override exposure, and verification.
- Red-flag scan: no unresolved markers or undefined future work remains in the task steps.
- Type consistency: `runway`, `RunwayHero`, `RunwayServices`, `RunwayGallery`, `RunwayAbout`, and `RunwayBookingCTA` are named consistently across creation and integration tasks.
