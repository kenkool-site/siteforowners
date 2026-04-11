# Five Website Templates — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single template layout with 5 distinct templates (Classic, Bold, Elegant, Vibrant, Warm), each with Framer Motion scroll animations, so each preview generation shows 2 contrasting designs.

**Architecture:** Composable sections with a layout orchestrator. Shared components (Footer, Map, Contact, Booking, Products) stay reusable. Four section types (Hero, Services, Gallery, About) get 5 variants each. A `TemplateOrchestrator` replaces `TemplateRenderer`, selecting the right components and section order per template. One new section: `VibrantStats`.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, Framer Motion, next/image, shadcn/ui Button

---

## File Map

### New Files
```
src/components/templates/shared/AnimateSection.tsx
src/components/templates/heroes/ClassicHero.tsx
src/components/templates/heroes/BoldHero.tsx
src/components/templates/heroes/ElegantHero.tsx
src/components/templates/heroes/VibrantHero.tsx
src/components/templates/heroes/WarmHero.tsx
src/components/templates/services/ClassicServices.tsx
src/components/templates/services/BoldServices.tsx
src/components/templates/services/ElegantServices.tsx
src/components/templates/services/VibrantServices.tsx
src/components/templates/services/WarmServices.tsx
src/components/templates/galleries/ClassicGallery.tsx
src/components/templates/galleries/BoldGallery.tsx
src/components/templates/galleries/ElegantGallery.tsx
src/components/templates/galleries/VibrantGallery.tsx
src/components/templates/galleries/WarmGallery.tsx
src/components/templates/about/ClassicAbout.tsx
src/components/templates/about/BoldAbout.tsx
src/components/templates/about/ElegantAbout.tsx
src/components/templates/about/VibrantAbout.tsx
src/components/templates/about/WarmAbout.tsx
src/components/templates/stats/VibrantStats.tsx
src/components/templates/TemplateOrchestrator.tsx
```

### Modified Files
```
src/components/templates/index.ts              — update exports
src/app/(marketing)/preview/[slug]/PreviewClient.tsx — swap TemplateRenderer for TemplateOrchestrator
src/app/api/generate-copy/route.ts             — template assignment logic
src/app/(marketing)/preview/compare/[groupId]/CompareClient.tsx — show template metadata
src/lib/ai/types.ts                            — add TemplateName type
```

### Deleted Files
```
src/components/templates/TemplateRenderer.tsx   — replaced by TemplateOrchestrator
src/components/templates/TemplateHero.tsx        — replaced by heroes/ClassicHero.tsx
src/components/templates/TemplateServices.tsx    — replaced by services/ClassicServices.tsx
src/components/templates/TemplateGallery.tsx     — replaced by galleries/ClassicGallery.tsx
src/components/templates/TemplateAbout.tsx       — replaced by about/ClassicAbout.tsx
```

### Unchanged Shared Files (stay at current paths)
```
src/components/templates/TemplateFooter.tsx
src/components/templates/TemplateMap.tsx
src/components/templates/TemplateContact.tsx
src/components/templates/TemplateBooking.tsx
src/components/templates/TemplateProducts.tsx
```

---

## Task 1: Add TemplateName Type

**Files:**
- Modify: `src/lib/ai/types.ts`

- [ ] **Step 1: Add TemplateName type to types.ts**

Add this after the `ColorTheme` type definition, before `ServiceItem`:

```typescript
export type TemplateName = 'classic' | 'bold' | 'elegant' | 'vibrant' | 'warm';
```

- [ ] **Step 2: Run type check**

Run: `cd /Users/aws/Downloads/web-project/siteforowners && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/types.ts
git commit -m "feat: add TemplateName type"
```

---

## Task 2: Create AnimateSection Wrapper

**Files:**
- Create: `src/components/templates/shared/AnimateSection.tsx`

- [ ] **Step 1: Create the shared directory and AnimateSection component**

```typescript
"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";

type Animation = "fade-up" | "fade-in" | "slide-left" | "slide-right" | "scale-in";

interface AnimateSectionProps {
  children: React.ReactNode;
  animation?: Animation;
  delay?: number;
  duration?: number;
  className?: string;
}

const VARIANTS: Record<Animation, { hidden: object; visible: object }> = {
  "fade-up": {
    hidden: { opacity: 0, y: 40 },
    visible: { opacity: 1, y: 0 },
  },
  "fade-in": {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  },
  "slide-left": {
    hidden: { opacity: 0, x: -60 },
    visible: { opacity: 1, x: 0 },
  },
  "slide-right": {
    hidden: { opacity: 0, x: 60 },
    visible: { opacity: 1, x: 0 },
  },
  "scale-in": {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1 },
  },
};

export function AnimateSection({
  children,
  animation = "fade-up",
  delay = 0,
  duration = 0.6,
  className,
}: AnimateSectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  const variant = VARIANTS[animation];

  return (
    <motion.div
      ref={ref}
      initial={variant.hidden}
      animate={inView ? variant.visible : variant.hidden}
      transition={{ duration, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `cd /Users/aws/Downloads/web-project/siteforowners && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/templates/shared/AnimateSection.tsx
git commit -m "feat: add AnimateSection scroll-reveal wrapper"
```

---

## Task 3: Create ClassicHero (migrate from TemplateHero)

**Files:**
- Create: `src/components/templates/heroes/ClassicHero.tsx`

- [ ] **Step 1: Create ClassicHero based on current TemplateHero with animations**

```typescript
"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import type { ThemeColors } from "@/lib/templates/themes";

interface ClassicHeroProps {
  businessName: string;
  headline: string;
  subheadline: string;
  heroImage?: string;
  logo?: string;
  colors: ThemeColors;
  bookingUrl?: string;
  phone?: string;
}

export function ClassicHero({
  businessName,
  headline,
  subheadline,
  heroImage,
  logo,
  colors,
  bookingUrl,
  phone,
}: ClassicHeroProps) {
  const ctaHref = bookingUrl || (phone ? `tel:${phone}` : undefined);

  return (
    <section
      className="relative flex min-h-[90vh] flex-col items-center justify-center overflow-hidden px-6 py-24 text-center"
      style={{ backgroundColor: colors.foreground, color: colors.background }}
    >
      {heroImage && (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${heroImage})` }}
          />
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(to bottom, ${colors.foreground}CC, ${colors.foreground}99, ${colors.foreground}DD)`,
            }}
          />
        </>
      )}

      {logo && (
        <motion.div
          className="relative z-10 mb-6"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
        >
          <div
            className="mx-auto h-24 w-24 overflow-hidden rounded-full border-2 shadow-lg md:h-32 md:w-32"
            style={{ borderColor: `${colors.primary}40` }}
          >
            <Image
              src={logo}
              alt={`${businessName} logo`}
              width={128}
              height={128}
              className="h-full w-full object-cover"
              unoptimized
            />
          </div>
        </motion.div>
      )}

      {!logo && (
        <motion.div
          className="relative z-10 mb-8"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <div className="mx-auto h-0.5 w-16" style={{ backgroundColor: colors.primary }} />
        </motion.div>
      )}

      <div className="relative z-10 max-w-3xl">
        <motion.p
          className="mb-6 text-sm font-semibold uppercase tracking-[0.3em]"
          style={{ color: colors.primary }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
        >
          {businessName}
        </motion.p>
        <motion.h1
          className="mb-8 text-5xl font-bold leading-[1.1] md:text-7xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          {headline}
        </motion.h1>
        <motion.p
          className="mx-auto mb-12 max-w-xl text-lg opacity-80 md:text-xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          {subheadline}
        </motion.p>
        <motion.div
          className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          <Button
            size="lg"
            className="rounded-full px-12 py-7 text-base font-semibold tracking-wide shadow-lg transition-all hover:shadow-xl hover:-translate-y-0.5"
            style={{ backgroundColor: colors.primary, color: colors.background }}
            asChild={!!ctaHref}
          >
            {ctaHref ? (
              <a href={ctaHref} target={bookingUrl ? "_blank" : undefined} rel={bookingUrl ? "noopener noreferrer" : undefined}>
                Book Now
              </a>
            ) : (
              <span>Book Now</span>
            )}
          </Button>
          {phone && bookingUrl && (
            <Button
              size="lg"
              variant="outline"
              className="rounded-full px-10 py-7 text-base font-semibold"
              style={{ borderColor: `${colors.primary}80`, color: colors.background }}
              asChild
            >
              <a href={`tel:${phone}`}>Call Us</a>
            </Button>
          )}
        </motion.div>
      </div>

      <div
        className="absolute bottom-0 left-0 right-0 h-32"
        style={{ background: `linear-gradient(to top, ${colors.background}, transparent)` }}
      />
    </section>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `cd /Users/aws/Downloads/web-project/siteforowners && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/templates/heroes/ClassicHero.tsx
git commit -m "feat: add ClassicHero with Framer Motion animations"
```

---

## Task 4: Create BoldHero

**Files:**
- Create: `src/components/templates/heroes/BoldHero.tsx`

- [ ] **Step 1: Create BoldHero**

```typescript
"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import type { ThemeColors } from "@/lib/templates/themes";

interface BoldHeroProps {
  businessName: string;
  headline: string;
  subheadline: string;
  heroImage?: string;
  colors: ThemeColors;
  bookingUrl?: string;
  phone?: string;
}

export function BoldHero({
  headline,
  heroImage,
  colors,
  bookingUrl,
  phone,
}: BoldHeroProps) {
  const ctaHref = bookingUrl || (phone ? `tel:${phone}` : undefined);

  return (
    <section
      className="relative flex min-h-[100vh] flex-col items-center justify-center overflow-hidden px-6 py-24 text-center"
      style={{ backgroundColor: colors.foreground, color: colors.background }}
    >
      {heroImage && (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${heroImage})` }}
          />
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(135deg, ${colors.foreground}EE, ${colors.primary}66, ${colors.foreground}DD)`,
            }}
          />
        </>
      )}

      {/* Diagonal accent overlay */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          background: `linear-gradient(135deg, transparent 40%, ${colors.primary}40 40%, ${colors.primary}40 60%, transparent 60%)`,
        }}
      />

      <div className="relative z-10 max-w-4xl">
        <motion.h1
          className="mb-10 text-6xl font-black leading-[0.95] tracking-tight md:text-8xl"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        >
          {headline}
        </motion.h1>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <Button
            size="lg"
            className="rounded-full px-14 py-8 text-lg font-bold uppercase tracking-wider shadow-2xl transition-all hover:shadow-xl hover:-translate-y-1"
            style={{ backgroundColor: colors.primary, color: colors.background }}
            asChild={!!ctaHref}
          >
            {ctaHref ? (
              <a href={ctaHref} target={bookingUrl ? "_blank" : undefined} rel={bookingUrl ? "noopener noreferrer" : undefined}>
                Book Now
              </a>
            ) : (
              <span>Book Now</span>
            )}
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/templates/heroes/BoldHero.tsx
git commit -m "feat: add BoldHero with scale-in animation"
```

---

## Task 5: Create ElegantHero

**Files:**
- Create: `src/components/templates/heroes/ElegantHero.tsx`

- [ ] **Step 1: Create ElegantHero**

```typescript
"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import type { ThemeColors } from "@/lib/templates/themes";

interface ElegantHeroProps {
  businessName: string;
  headline: string;
  subheadline: string;
  logo?: string;
  colors: ThemeColors;
  bookingUrl?: string;
  phone?: string;
}

export function ElegantHero({
  businessName,
  headline,
  subheadline,
  logo,
  colors,
  bookingUrl,
  phone,
}: ElegantHeroProps) {
  const ctaHref = bookingUrl || (phone ? `tel:${phone}` : undefined);

  return (
    <section
      className="flex min-h-[90vh] flex-col items-center justify-center px-6 py-32 text-center"
      style={{ backgroundColor: colors.background, color: colors.foreground }}
    >
      {/* Decorative line */}
      <motion.div
        className="mb-10 h-px"
        style={{ backgroundColor: colors.primary }}
        initial={{ width: 0 }}
        animate={{ width: 80 }}
        transition={{ duration: 1.2, ease: "easeOut" }}
      />

      {logo && (
        <motion.div
          className="mb-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, delay: 0.2 }}
        >
          <Image
            src={logo}
            alt={`${businessName} logo`}
            width={80}
            height={80}
            className="mx-auto h-20 w-20 rounded-full object-cover opacity-80"
            unoptimized
          />
        </motion.div>
      )}

      <motion.p
        className="mb-8 text-xs font-medium uppercase tracking-[0.4em]"
        style={{ color: colors.primary }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2, delay: 0.3 }}
      >
        {businessName}
      </motion.p>

      <motion.h1
        className="mb-8 max-w-3xl text-5xl font-light leading-[1.15] md:text-7xl"
        style={{ color: colors.foreground }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2, delay: 0.4 }}
      >
        {headline}
      </motion.h1>

      <motion.p
        className="mb-14 max-w-md text-base opacity-60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.6 }}
        transition={{ duration: 1.2, delay: 0.6 }}
      >
        {subheadline}
      </motion.p>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.8 }}
      >
        <Button
          size="lg"
          variant="outline"
          className="rounded-none border px-12 py-7 text-xs font-medium uppercase tracking-[0.2em]"
          style={{ borderColor: colors.foreground, color: colors.foreground }}
          asChild={!!ctaHref}
        >
          {ctaHref ? (
            <a href={ctaHref} target={bookingUrl ? "_blank" : undefined} rel={bookingUrl ? "noopener noreferrer" : undefined}>
              Book an Appointment
            </a>
          ) : (
            <span>Book an Appointment</span>
          )}
        </Button>
      </motion.div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/templates/heroes/ElegantHero.tsx
git commit -m "feat: add ElegantHero with minimal typography-focused design"
```

---

## Task 6: Create VibrantHero

**Files:**
- Create: `src/components/templates/heroes/VibrantHero.tsx`

- [ ] **Step 1: Create VibrantHero**

```typescript
"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import type { ThemeColors } from "@/lib/templates/themes";

interface VibrantHeroProps {
  businessName: string;
  headline: string;
  subheadline: string;
  logo?: string;
  colors: ThemeColors;
  bookingUrl?: string;
  phone?: string;
}

export function VibrantHero({
  businessName,
  headline,
  subheadline,
  logo,
  colors,
  bookingUrl,
  phone,
}: VibrantHeroProps) {
  const ctaHref = bookingUrl || (phone ? `tel:${phone}` : undefined);

  return (
    <section
      className="relative flex min-h-[90vh] flex-col items-center justify-center overflow-hidden px-6 py-24 text-center"
      style={{
        background: `linear-gradient(135deg, ${colors.primary}, ${colors.accent})`,
        color: "#FFFFFF",
      }}
    >
      {/* Decorative blurred circles */}
      <div
        className="absolute -left-20 -top-20 h-72 w-72 rounded-full opacity-30 blur-3xl"
        style={{ backgroundColor: colors.secondary }}
      />
      <div
        className="absolute -bottom-32 -right-20 h-96 w-96 rounded-full opacity-20 blur-3xl"
        style={{ backgroundColor: colors.accent }}
      />

      {logo && (
        <motion.div
          className="relative z-10 mb-8"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
        >
          <div className="mx-auto h-24 w-24 overflow-hidden rounded-2xl bg-white/90 p-2 shadow-xl md:h-28 md:w-28">
            <Image
              src={logo}
              alt={`${businessName} logo`}
              width={112}
              height={112}
              className="h-full w-full rounded-xl object-cover"
              unoptimized
            />
          </div>
        </motion.div>
      )}

      <motion.p
        className="relative z-10 mb-4 text-sm font-semibold uppercase tracking-[0.2em] opacity-80"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.8 }}
        transition={{ duration: 0.5 }}
      >
        {businessName}
      </motion.p>

      <motion.h1
        className="relative z-10 mb-6 max-w-3xl text-5xl font-bold leading-[1.1] md:text-7xl"
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 100, damping: 12, delay: 0.2 }}
      >
        {headline}
      </motion.h1>

      <motion.p
        className="relative z-10 mb-12 max-w-xl text-lg opacity-90 md:text-xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 0.9, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
      >
        {subheadline}
      </motion.p>

      <motion.div
        className="relative z-10 flex flex-col items-center gap-4 sm:flex-row"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 150, damping: 12, delay: 0.5 }}
      >
        <Button
          size="lg"
          className="rounded-full bg-white px-12 py-7 text-base font-bold shadow-xl transition-all hover:-translate-y-1 hover:shadow-2xl"
          style={{ color: colors.primary }}
          asChild={!!ctaHref}
        >
          {ctaHref ? (
            <a href={ctaHref} target={bookingUrl ? "_blank" : undefined} rel={bookingUrl ? "noopener noreferrer" : undefined}>
              Book Now
            </a>
          ) : (
            <span>Book Now</span>
          )}
        </Button>
        {phone && bookingUrl && (
          <Button
            size="lg"
            variant="outline"
            className="rounded-full border-2 border-white/40 px-10 py-7 text-base font-semibold text-white hover:bg-white/10"
            asChild
          >
            <a href={`tel:${phone}`}>Call Us</a>
          </Button>
        )}
      </motion.div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/templates/heroes/VibrantHero.tsx
git commit -m "feat: add VibrantHero with gradient and spring animations"
```

---

## Task 7: Create WarmHero

**Files:**
- Create: `src/components/templates/heroes/WarmHero.tsx`

- [ ] **Step 1: Create WarmHero**

```typescript
"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import type { ThemeColors } from "@/lib/templates/themes";

interface WarmHeroProps {
  businessName: string;
  headline: string;
  subheadline: string;
  heroImage?: string;
  logo?: string;
  colors: ThemeColors;
  bookingUrl?: string;
  phone?: string;
}

export function WarmHero({
  businessName,
  headline,
  subheadline,
  heroImage,
  logo,
  colors,
  bookingUrl,
  phone,
}: WarmHeroProps) {
  const ctaHref = bookingUrl || (phone ? `tel:${phone}` : undefined);

  return (
    <section className="min-h-[90vh] md:grid md:grid-cols-2">
      {/* Left: Image/Logo area */}
      <motion.div
        className="relative flex h-[40vh] items-center justify-center overflow-hidden md:h-auto"
        style={{ backgroundColor: colors.muted }}
        initial={{ opacity: 0, x: -60 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      >
        {heroImage ? (
          <>
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${heroImage})` }}
            />
            <div
              className="absolute inset-0"
              style={{ backgroundColor: `${colors.foreground}40` }}
            />
          </>
        ) : null}
        {logo && (
          <div className="relative z-10">
            <div
              className="h-28 w-28 overflow-hidden rounded-full border-4 shadow-2xl md:h-36 md:w-36"
              style={{ borderColor: colors.background }}
            >
              <Image
                src={logo}
                alt={`${businessName} logo`}
                width={144}
                height={144}
                className="h-full w-full object-cover"
                unoptimized
              />
            </div>
          </div>
        )}
      </motion.div>

      {/* Accent bar — desktop only */}
      <div
        className="hidden h-auto w-1 md:block"
        style={{ background: `linear-gradient(to bottom, ${colors.primary}, ${colors.accent})` }}
      />

      {/* Right: Text + CTA */}
      <motion.div
        className="flex flex-col justify-center px-8 py-16 md:px-16 md:py-24"
        style={{ backgroundColor: colors.background }}
        initial={{ opacity: 0, x: 60 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      >
        <p
          className="mb-4 text-sm font-medium uppercase tracking-[0.2em]"
          style={{ color: colors.primary }}
        >
          {businessName}
        </p>
        <h1
          className="mb-6 text-4xl font-semibold leading-[1.15] md:text-6xl"
          style={{ color: colors.foreground }}
        >
          {headline}
        </h1>
        <p
          className="mb-10 max-w-md text-lg opacity-70"
          style={{ color: colors.foreground }}
        >
          {subheadline}
        </p>
        <div className="flex flex-col gap-4 sm:flex-row">
          <Button
            size="lg"
            className="rounded-full px-10 py-7 text-base font-semibold shadow-lg transition-all hover:-translate-y-0.5"
            style={{ backgroundColor: colors.primary, color: colors.background }}
            asChild={!!ctaHref}
          >
            {ctaHref ? (
              <a href={ctaHref} target={bookingUrl ? "_blank" : undefined} rel={bookingUrl ? "noopener noreferrer" : undefined}>
                Come Visit Us
              </a>
            ) : (
              <span>Come Visit Us</span>
            )}
          </Button>
          {phone && (
            <Button
              size="lg"
              variant="outline"
              className="rounded-full px-10 py-7 text-base font-semibold"
              style={{ borderColor: colors.primary, color: colors.primary }}
              asChild
            >
              <a href={`tel:${phone}`}>Call Us</a>
            </Button>
          )}
        </div>
      </motion.div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/templates/heroes/WarmHero.tsx
git commit -m "feat: add WarmHero with split-screen layout"
```

---

## Task 8: Create All 5 Services Variants

**Files:**
- Create: `src/components/templates/services/ClassicServices.tsx`
- Create: `src/components/templates/services/BoldServices.tsx`
- Create: `src/components/templates/services/ElegantServices.tsx`
- Create: `src/components/templates/services/VibrantServices.tsx`
- Create: `src/components/templates/services/WarmServices.tsx`

All services variants share the same props interface:

```typescript
interface ServicesProps {
  services: { name: string; price: string; description?: string }[];
  colors: ThemeColors;
}
```

- [ ] **Step 1: Create ClassicServices (migrate from TemplateServices with animations)**

```typescript
"use client";

import type { ThemeColors } from "@/lib/templates/themes";
import { AnimateSection } from "../shared/AnimateSection";

interface ServicesProps {
  services: { name: string; price: string; description?: string }[];
  colors: ThemeColors;
}

export function ClassicServices({ services, colors }: ServicesProps) {
  return (
    <section className="px-6 py-20" style={{ backgroundColor: colors.background }}>
      <div className="mx-auto max-w-4xl">
        <AnimateSection>
          <h2 className="mb-12 text-center text-3xl font-bold md:text-4xl" style={{ color: colors.foreground }}>
            Our Services
          </h2>
        </AnimateSection>
        <div className="grid gap-4 md:grid-cols-2">
          {services.map((service, i) => (
            <AnimateSection key={service.name} delay={i * 0.1}>
              <div
                className="flex items-start justify-between rounded-xl p-5 transition-shadow hover:shadow-md"
                style={{ backgroundColor: colors.muted }}
              >
                <div className="flex-1">
                  <h3 className="text-lg font-semibold" style={{ color: colors.foreground }}>
                    {service.name}
                  </h3>
                  {service.description && (
                    <p className="mt-1 text-sm opacity-70" style={{ color: colors.foreground }}>
                      {service.description}
                    </p>
                  )}
                </div>
                <span className="ml-4 whitespace-nowrap text-lg font-bold" style={{ color: colors.primary }}>
                  {service.price}
                </span>
              </div>
            </AnimateSection>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Create BoldServices**

```typescript
"use client";

import type { ThemeColors } from "@/lib/templates/themes";
import { AnimateSection } from "../shared/AnimateSection";

interface ServicesProps {
  services: { name: string; price: string; description?: string }[];
  colors: ThemeColors;
}

export function BoldServices({ services, colors }: ServicesProps) {
  return (
    <section className="px-6 py-20" style={{ backgroundColor: colors.foreground }}>
      <div className="mx-auto max-w-5xl">
        <AnimateSection>
          <h2 className="mb-12 text-3xl font-black uppercase tracking-wider md:text-4xl" style={{ color: colors.background }}>
            Services
          </h2>
        </AnimateSection>

        {/* Horizontal scroll on mobile, grid on desktop */}
        <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory md:grid md:grid-cols-3 md:overflow-visible md:pb-0">
          {services.map((service, i) => (
            <AnimateSection key={service.name} animation="slide-right" delay={i * 0.1}>
              <div
                className="min-w-[260px] snap-start rounded-xl border-l-4 p-6 md:min-w-0"
                style={{ backgroundColor: colors.muted, borderLeftColor: colors.primary }}
              >
                <div className="mb-2 flex items-start justify-between">
                  <h3 className="text-lg font-bold" style={{ color: colors.background }}>
                    {service.name}
                  </h3>
                  <span className="ml-3 whitespace-nowrap font-bold" style={{ color: colors.primary }}>
                    {service.price}
                  </span>
                </div>
                {service.description && (
                  <p className="text-sm opacity-60" style={{ color: colors.background }}>
                    {service.description}
                  </p>
                )}
              </div>
            </AnimateSection>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Create ElegantServices**

```typescript
"use client";

import type { ThemeColors } from "@/lib/templates/themes";
import { AnimateSection } from "../shared/AnimateSection";

interface ServicesProps {
  services: { name: string; price: string; description?: string }[];
  colors: ThemeColors;
}

export function ElegantServices({ services, colors }: ServicesProps) {
  return (
    <section className="px-6 py-20" style={{ backgroundColor: colors.background }}>
      <div className="mx-auto max-w-xl">
        <AnimateSection>
          <h2 className="mb-16 text-center text-3xl font-light md:text-4xl" style={{ color: colors.foreground }}>
            Services
          </h2>
        </AnimateSection>

        <div className="space-y-6">
          {services.map((service, i) => (
            <AnimateSection key={service.name} animation="fade-in" delay={i * 0.15}>
              <div className="group">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-lg font-medium" style={{ color: colors.foreground }}>
                    {service.name}
                  </h3>
                  <div className="mx-4 flex-1 border-b border-dotted" style={{ borderColor: `${colors.foreground}30` }} />
                  <span className="text-lg" style={{ color: colors.primary }}>
                    {service.price}
                  </span>
                </div>
                {service.description && (
                  <p className="mt-1 text-sm italic opacity-50" style={{ color: colors.foreground }}>
                    {service.description}
                  </p>
                )}
              </div>
            </AnimateSection>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Create VibrantServices**

```typescript
"use client";

import type { ThemeColors } from "@/lib/templates/themes";
import { AnimateSection } from "../shared/AnimateSection";

interface ServicesProps {
  services: { name: string; price: string; description?: string }[];
  colors: ThemeColors;
}

export function VibrantServices({ services, colors }: ServicesProps) {
  return (
    <section className="px-6 py-20" style={{ backgroundColor: colors.background }}>
      <div className="mx-auto max-w-5xl">
        <AnimateSection>
          <h2 className="mb-12 text-center text-3xl font-bold md:text-4xl" style={{ color: colors.foreground }}>
            What We Offer
          </h2>
        </AnimateSection>

        <div className="grid gap-4 grid-cols-2 md:grid-cols-3">
          {services.map((service, i) => (
            <AnimateSection key={service.name} animation="scale-in" delay={i * 0.08}>
              <div
                className="rounded-2xl p-6 transition-shadow hover:shadow-lg"
                style={{ background: `linear-gradient(135deg, ${colors.muted}, ${colors.background})` }}
              >
                <div
                  className="mb-3 h-3 w-3 rounded-full"
                  style={{ backgroundColor: colors.primary }}
                />
                <h3 className="mb-1 text-base font-bold" style={{ color: colors.foreground }}>
                  {service.name}
                </h3>
                {service.description && (
                  <p className="mb-3 text-sm opacity-60" style={{ color: colors.foreground }}>
                    {service.description}
                  </p>
                )}
                <span
                  className="inline-block rounded-full px-3 py-1 text-sm font-semibold"
                  style={{ backgroundColor: `${colors.primary}15`, color: colors.primary }}
                >
                  {service.price}
                </span>
              </div>
            </AnimateSection>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Create WarmServices**

```typescript
"use client";

import type { ThemeColors } from "@/lib/templates/themes";
import { AnimateSection } from "../shared/AnimateSection";

interface ServicesProps {
  services: { name: string; price: string; description?: string }[];
  colors: ThemeColors;
}

export function WarmServices({ services, colors }: ServicesProps) {
  return (
    <section className="px-6 py-20" style={{ backgroundColor: colors.background }}>
      <div className="mx-auto max-w-2xl">
        <AnimateSection>
          <h2 className="mb-12 text-center text-3xl font-semibold md:text-4xl" style={{ color: colors.foreground }}>
            Our Services
          </h2>
        </AnimateSection>

        <div className="space-y-4">
          {services.map((service, i) => (
            <AnimateSection key={service.name} delay={i * 0.1}>
              <div
                className="rounded-xl border-l-4 p-6"
                style={{ backgroundColor: colors.muted, borderLeftColor: colors.primary }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold" style={{ color: colors.foreground }}>
                      {service.name}
                    </h3>
                    {service.description && (
                      <p className="mt-2 text-base leading-relaxed opacity-70" style={{ color: colors.foreground }}>
                        {service.description}
                      </p>
                    )}
                  </div>
                  <span className="ml-4 text-base font-medium opacity-70" style={{ color: colors.foreground }}>
                    {service.price}
                  </span>
                </div>
              </div>
            </AnimateSection>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Run type check**

Run: `cd /Users/aws/Downloads/web-project/siteforowners && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/components/templates/services/
git commit -m "feat: add 5 services section variants"
```

---

## Task 9: Create All 5 Gallery Variants

**Files:**
- Create: `src/components/templates/galleries/ClassicGallery.tsx`
- Create: `src/components/templates/galleries/BoldGallery.tsx`
- Create: `src/components/templates/galleries/ElegantGallery.tsx`
- Create: `src/components/templates/galleries/VibrantGallery.tsx`
- Create: `src/components/templates/galleries/WarmGallery.tsx`

All galleries share:

```typescript
interface GalleryProps {
  images: string[];
  colors: ThemeColors;
}
```

- [ ] **Step 1: Create ClassicGallery (migrate from TemplateGallery with animations)**

```typescript
"use client";

import { useState } from "react";
import Image from "next/image";
import type { ThemeColors } from "@/lib/templates/themes";
import { AnimateSection } from "../shared/AnimateSection";

interface GalleryProps {
  images: string[];
  colors: ThemeColors;
}

export function ClassicGallery({ images, colors }: GalleryProps) {
  const [selected, setSelected] = useState<string | null>(null);

  if (images.length === 0) return null;

  return (
    <section className="px-6 py-20" style={{ backgroundColor: colors.muted }}>
      <div className="mx-auto max-w-5xl">
        <AnimateSection>
          <h2 className="mb-12 text-center text-3xl font-bold md:text-4xl" style={{ color: colors.foreground }}>
            Gallery
          </h2>
        </AnimateSection>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {images.map((src, i) => (
            <AnimateSection key={i} animation="fade-in" delay={i * 0.05}>
              <button
                className="group relative aspect-square overflow-hidden rounded-xl"
                onClick={() => setSelected(src)}
              >
                <Image
                  src={src}
                  alt={`Gallery image ${i + 1}`}
                  fill
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                  sizes="(max-width: 768px) 50vw, 33vw"
                  unoptimized
                />
              </button>
            </AnimateSection>
          ))}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setSelected(null)}>
          <div className="relative max-h-[90vh] max-w-[90vw]">
            <Image src={selected} alt="Gallery preview" width={900} height={600} className="rounded-lg object-contain" unoptimized />
          </div>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Create BoldGallery**

```typescript
"use client";

import Image from "next/image";
import type { ThemeColors } from "@/lib/templates/themes";
import { AnimateSection } from "../shared/AnimateSection";

interface GalleryProps {
  images: string[];
  colors: ThemeColors;
}

export function BoldGallery({ images, colors }: GalleryProps) {
  if (images.length === 0) return null;

  // Build alternating rows: 1 large, then 2 small
  const rows: string[][] = [];
  let idx = 0;
  while (idx < images.length) {
    rows.push([images[idx]]);
    idx++;
    if (idx < images.length) {
      const pair = [images[idx]];
      idx++;
      if (idx < images.length) {
        pair.push(images[idx]);
        idx++;
      }
      rows.push(pair);
    }
  }

  return (
    <section className="py-20" style={{ backgroundColor: colors.foreground }}>
      <div className="mx-auto max-w-5xl space-y-4 px-6">
        {rows.map((row, ri) => (
          <AnimateSection key={ri} delay={ri * 0.1}>
            {row.length === 1 ? (
              <div className="relative aspect-[16/9] overflow-hidden rounded-xl">
                <Image
                  src={row[0]}
                  alt={`Gallery ${ri}`}
                  fill
                  className="object-cover"
                  sizes="100vw"
                  unoptimized
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {row.map((src, i) => (
                  <div key={i} className="relative aspect-square overflow-hidden rounded-xl">
                    <Image src={src} alt={`Gallery ${ri}-${i}`} fill className="object-cover" sizes="50vw" unoptimized />
                  </div>
                ))}
              </div>
            )}
          </AnimateSection>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Create ElegantGallery**

```typescript
"use client";

import Image from "next/image";
import type { ThemeColors } from "@/lib/templates/themes";
import { AnimateSection } from "../shared/AnimateSection";

interface GalleryProps {
  images: string[];
  colors: ThemeColors;
}

export function ElegantGallery({ images, colors }: GalleryProps) {
  if (images.length === 0) return null;

  return (
    <section className="px-6 py-20" style={{ backgroundColor: colors.background }}>
      <div className="mx-auto max-w-4xl">
        <div className="grid grid-cols-2 gap-6">
          {images.map((src, i) => (
            <AnimateSection key={i} animation="scale-in" delay={i * 0.1}>
              <div
                className={`relative overflow-hidden rounded-2xl ${
                  i % 2 === 1 ? "md:mt-8" : ""
                }`}
                style={{ aspectRatio: "4/5" }}
              >
                <Image
                  src={src}
                  alt={`Gallery image ${i + 1}`}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 50vw, 40vw"
                  unoptimized
                />
              </div>
            </AnimateSection>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Create VibrantGallery**

```typescript
"use client";

import Image from "next/image";
import type { ThemeColors } from "@/lib/templates/themes";
import { AnimateSection } from "../shared/AnimateSection";

interface GalleryProps {
  images: string[];
  colors: ThemeColors;
}

export function VibrantGallery({ images, colors }: GalleryProps) {
  if (images.length === 0) return null;

  return (
    <section className="px-6 py-20" style={{ backgroundColor: colors.muted }}>
      <div className="mx-auto max-w-5xl">
        <AnimateSection>
          <h2 className="mb-12 text-center text-3xl font-bold md:text-4xl" style={{ color: colors.foreground }}>
            Our Work
          </h2>
        </AnimateSection>
        <div className="grid grid-cols-3 gap-2">
          {images.map((src, i) => (
            <AnimateSection key={i} animation="scale-in" delay={i * 0.06}>
              <div className="group relative aspect-square overflow-hidden rounded-xl">
                <Image
                  src={src}
                  alt={`Gallery image ${i + 1}`}
                  fill
                  className="object-cover transition-all duration-300 group-hover:scale-110 group-hover:saturate-[1.2]"
                  sizes="33vw"
                  unoptimized
                />
              </div>
            </AnimateSection>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Create WarmGallery**

```typescript
"use client";

import { useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import type { ThemeColors } from "@/lib/templates/themes";
import { AnimateSection } from "../shared/AnimateSection";

interface GalleryProps {
  images: string[];
  colors: ThemeColors;
}

export function WarmGallery({ images, colors }: GalleryProps) {
  const [featured, setFeatured] = useState(0);

  if (images.length === 0) return null;

  // If fewer than 2 images, just show a simple grid
  if (images.length < 2) {
    return (
      <section className="px-6 py-20" style={{ backgroundColor: colors.muted }}>
        <div className="mx-auto max-w-4xl">
          <div className="relative aspect-[16/9] overflow-hidden rounded-2xl">
            <Image src={images[0]} alt="Gallery" fill className="object-cover" sizes="100vw" unoptimized />
          </div>
        </div>
      </section>
    );
  }

  const thumbnails = images.slice(0, 5);

  return (
    <section className="px-6 py-20" style={{ backgroundColor: colors.muted }}>
      <div className="mx-auto max-w-4xl">
        <AnimateSection>
          <h2 className="mb-12 text-center text-3xl font-semibold md:text-4xl" style={{ color: colors.foreground }}>
            Gallery
          </h2>
        </AnimateSection>

        {/* Featured image */}
        <div className="relative mb-4 aspect-[16/9] overflow-hidden rounded-2xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={featured}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="absolute inset-0"
            >
              <Image
                src={images[featured]}
                alt={`Featured gallery image`}
                fill
                className="object-cover"
                sizes="100vw"
                unoptimized
              />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Thumbnails */}
        <div className="grid grid-cols-5 gap-2">
          {thumbnails.map((src, i) => (
            <button
              key={i}
              onClick={() => setFeatured(i)}
              className={`relative aspect-square overflow-hidden rounded-xl transition-all ${
                featured === i ? "ring-2 ring-offset-2" : "opacity-70 hover:opacity-100"
              }`}
              style={{ ringColor: colors.primary }}
            >
              <Image src={src} alt={`Thumbnail ${i + 1}`} fill className="object-cover" sizes="20vw" unoptimized />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Run type check**

Run: `cd /Users/aws/Downloads/web-project/siteforowners && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/components/templates/galleries/
git commit -m "feat: add 5 gallery section variants"
```

---

## Task 10: Create All 5 About Variants

**Files:**
- Create: `src/components/templates/about/ClassicAbout.tsx`
- Create: `src/components/templates/about/BoldAbout.tsx`
- Create: `src/components/templates/about/ElegantAbout.tsx`
- Create: `src/components/templates/about/VibrantAbout.tsx`
- Create: `src/components/templates/about/WarmAbout.tsx`

- [ ] **Step 1: Create ClassicAbout (migrate from TemplateAbout with animations)**

```typescript
import Image from "next/image";
import type { ThemeColors } from "@/lib/templates/themes";
import { AnimateSection } from "../shared/AnimateSection";

interface AboutProps {
  paragraphs: string[];
  image?: string;
  colors: ThemeColors;
}

export function ClassicAbout({ paragraphs, image, colors }: AboutProps) {
  return (
    <section className="px-6 py-20" style={{ backgroundColor: colors.background }}>
      <div className="mx-auto grid max-w-5xl items-center gap-12 md:grid-cols-2">
        {image && (
          <AnimateSection animation="slide-left">
            <div className="relative aspect-[4/5] overflow-hidden rounded-2xl">
              <Image src={image} alt="About us" fill className="object-cover" sizes="(max-width: 768px) 100vw, 50vw" unoptimized />
            </div>
          </AnimateSection>
        )}
        <AnimateSection animation={image ? "slide-right" : "fade-up"}>
          <div className={image ? "" : "md:col-span-2 md:mx-auto md:max-w-2xl"}>
            <h2 className="mb-8 text-3xl font-bold md:text-4xl" style={{ color: colors.foreground }}>
              About Us
            </h2>
            {paragraphs.map((p, i) => (
              <p key={i} className="mb-4 text-base leading-relaxed opacity-80 md:text-lg" style={{ color: colors.foreground }}>
                {p}
              </p>
            ))}
          </div>
        </AnimateSection>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Create BoldAbout**

```typescript
"use client";

import type { ThemeColors } from "@/lib/templates/themes";
import { AnimateSection } from "../shared/AnimateSection";

interface AboutProps {
  paragraphs: string[];
  colors: ThemeColors;
}

export function BoldAbout({ paragraphs, colors }: AboutProps) {
  const pullQuote = paragraphs[0] || "";
  const rest = paragraphs.slice(1);

  return (
    <section className="px-6 py-20" style={{ backgroundColor: colors.foreground }}>
      <div className="mx-auto max-w-3xl">
        <AnimateSection animation="fade-in">
          <blockquote
            className="mb-10 text-2xl font-medium italic leading-relaxed md:text-3xl"
            style={{ color: colors.primary }}
          >
            &ldquo;{pullQuote}&rdquo;
          </blockquote>
        </AnimateSection>
        {rest.map((p, i) => (
          <AnimateSection key={i} delay={0.3 + i * 0.15}>
            <p className="mb-4 text-base leading-relaxed opacity-70 md:text-lg" style={{ color: colors.background }}>
              {p}
            </p>
          </AnimateSection>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Create ElegantAbout**

```typescript
import type { ThemeColors } from "@/lib/templates/themes";
import { AnimateSection } from "../shared/AnimateSection";

interface AboutProps {
  paragraphs: string[];
  colors: ThemeColors;
}

export function ElegantAbout({ paragraphs, colors }: AboutProps) {
  return (
    <section className="px-6 py-20" style={{ backgroundColor: colors.background }}>
      <div className="mx-auto max-w-xl text-center">
        <AnimateSection>
          <h2 className="mb-12 text-3xl font-light md:text-4xl" style={{ color: colors.foreground }}>
            Our Story
          </h2>
        </AnimateSection>
        {paragraphs.map((p, i) => (
          <AnimateSection key={i} animation="fade-in" delay={i * 0.2}>
            <p className="mb-6 text-base leading-loose opacity-70 md:text-lg" style={{ color: colors.foreground }}>
              {i === 0 ? (
                <>
                  <span className="float-left mr-2 text-5xl font-light leading-none" style={{ color: colors.primary }}>
                    {p.charAt(0)}
                  </span>
                  {p.slice(1)}
                </>
              ) : (
                p
              )}
            </p>
          </AnimateSection>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Create VibrantAbout**

```typescript
import type { ThemeColors } from "@/lib/templates/themes";
import { AnimateSection } from "../shared/AnimateSection";

interface AboutProps {
  paragraphs: string[];
  colors: ThemeColors;
}

export function VibrantAbout({ paragraphs, colors }: AboutProps) {
  const highlight = paragraphs[0] || "";
  const rest = paragraphs.slice(1);

  return (
    <section className="px-6 py-20" style={{ backgroundColor: colors.background }}>
      <div className="mx-auto max-w-5xl md:grid md:grid-cols-5 md:gap-8">
        <AnimateSection animation="slide-left" className="md:col-span-2">
          <div className="mb-8 rounded-2xl p-8 md:mb-0" style={{ backgroundColor: `${colors.primary}10` }}>
            <p className="text-xl font-bold leading-relaxed md:text-2xl" style={{ color: colors.primary }}>
              &ldquo;{highlight}&rdquo;
            </p>
          </div>
        </AnimateSection>
        <AnimateSection animation="slide-right" className="md:col-span-3">
          <div>
            <h2 className="mb-6 text-3xl font-bold md:text-4xl" style={{ color: colors.foreground }}>
              About Us
            </h2>
            {rest.map((p, i) => (
              <p key={i} className="mb-4 text-base leading-relaxed opacity-70 md:text-lg" style={{ color: colors.foreground }}>
                {p}
              </p>
            ))}
            {rest.length === 0 && (
              <p className="text-base leading-relaxed opacity-70 md:text-lg" style={{ color: colors.foreground }}>
                {highlight}
              </p>
            )}
          </div>
        </AnimateSection>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Create WarmAbout**

```typescript
import Image from "next/image";
import type { ThemeColors } from "@/lib/templates/themes";
import { AnimateSection } from "../shared/AnimateSection";

interface AboutProps {
  paragraphs: string[];
  image?: string;
  colors: ThemeColors;
}

export function WarmAbout({ paragraphs, image, colors }: AboutProps) {
  return (
    <section className="px-6 py-20" style={{ backgroundColor: colors.background }}>
      <div className="mx-auto max-w-2xl">
        <AnimateSection>
          <h2 className="mb-8 text-center text-3xl italic font-medium md:text-4xl" style={{ color: colors.foreground }}>
            Our Story
          </h2>
        </AnimateSection>
        <div className="space-y-6">
          {paragraphs.map((p, i) => (
            <AnimateSection key={i} animation="fade-in" delay={i * 0.3}>
              <p className="text-base leading-loose opacity-80 md:text-lg" style={{ color: colors.foreground }}>
                {p}
              </p>
            </AnimateSection>
          ))}
        </div>
        {image && (
          <AnimateSection delay={0.4}>
            <div className="relative mt-10 aspect-[16/9] overflow-hidden rounded-2xl">
              <Image src={image} alt="Our story" fill className="object-cover" sizes="100vw" unoptimized />
            </div>
          </AnimateSection>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Run type check**

Run: `cd /Users/aws/Downloads/web-project/siteforowners && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/components/templates/about/
git commit -m "feat: add 5 about section variants"
```

---

## Task 11: Create VibrantStats

**Files:**
- Create: `src/components/templates/stats/VibrantStats.tsx`

- [ ] **Step 1: Create VibrantStats**

```typescript
"use client";

import { useRef, useEffect, useState } from "react";
import { useInView } from "framer-motion";
import type { ThemeColors } from "@/lib/templates/themes";

interface VibrantStatsProps {
  serviceCount: number;
  address?: string;
  colors: ThemeColors;
}

function useCountUp(target: number, inView: boolean, duration = 1500): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const step = Math.ceil(target / (duration / 16));
    const timer = setInterval(() => {
      start += step;
      if (start >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(start);
      }
    }, 16);
    return () => clearInterval(timer);
  }, [target, inView, duration]);
  return count;
}

export function VibrantStats({ serviceCount, address, colors }: VibrantStatsProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  const servicesNum = useCountUp(serviceCount, inView);
  const ratingNum = useCountUp(5, inView, 800);

  // Try to extract neighborhood from address
  const neighborhood = address
    ? address.split(",").find((part) => part.trim().match(/brooklyn|queens|bronx|manhattan|harlem|flatbush|bed-stuy|crown heights|bushwick/i))?.trim() || "NYC"
    : null;

  const stats = [
    { value: servicesNum, suffix: "+", label: "Services Offered" },
    { value: ratingNum, suffix: "★", label: "Star Rating" },
    { value: null, suffix: null, label: neighborhood ? `Proudly in ${neighborhood}` : `${serviceCount}+ Happy Clients` },
  ];

  return (
    <section className="px-6 py-16" style={{ background: `linear-gradient(135deg, ${colors.primary}10, ${colors.accent}10)` }}>
      <div ref={ref} className="mx-auto grid max-w-3xl grid-cols-1 gap-8 text-center md:grid-cols-3">
        {stats.map((stat, i) => (
          <div key={i}>
            {stat.value !== null ? (
              <p className="text-4xl font-bold md:text-5xl" style={{ color: colors.primary }}>
                {stat.value}{stat.suffix}
              </p>
            ) : (
              <p className="text-2xl font-bold md:text-3xl" style={{ color: colors.primary }}>
                {stat.label.includes("Proudly") ? "📍" : "💯"}
              </p>
            )}
            <p className="mt-2 text-sm font-medium opacity-60" style={{ color: colors.foreground }}>
              {stat.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `cd /Users/aws/Downloads/web-project/siteforowners && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/templates/stats/VibrantStats.tsx
git commit -m "feat: add VibrantStats with counter animation"
```

---

## Task 12: Create TemplateOrchestrator

**Files:**
- Create: `src/components/templates/TemplateOrchestrator.tsx`

- [ ] **Step 1: Create the orchestrator**

```typescript
"use client";

import type { PreviewData, GeneratedCopy } from "@/lib/ai/types";
import type { ThemeColors } from "@/lib/templates/themes";
import { THEMES_BY_VERTICAL } from "@/lib/templates/themes";

// Heroes
import { ClassicHero } from "./heroes/ClassicHero";
import { BoldHero } from "./heroes/BoldHero";
import { ElegantHero } from "./heroes/ElegantHero";
import { VibrantHero } from "./heroes/VibrantHero";
import { WarmHero } from "./heroes/WarmHero";

// Services
import { ClassicServices } from "./services/ClassicServices";
import { BoldServices } from "./services/BoldServices";
import { ElegantServices } from "./services/ElegantServices";
import { VibrantServices } from "./services/VibrantServices";
import { WarmServices } from "./services/WarmServices";

// Galleries
import { ClassicGallery } from "./galleries/ClassicGallery";
import { BoldGallery } from "./galleries/BoldGallery";
import { ElegantGallery } from "./galleries/ElegantGallery";
import { VibrantGallery } from "./galleries/VibrantGallery";
import { WarmGallery } from "./galleries/WarmGallery";

// About
import { ClassicAbout } from "./about/ClassicAbout";
import { BoldAbout } from "./about/BoldAbout";
import { ElegantAbout } from "./about/ElegantAbout";
import { VibrantAbout } from "./about/VibrantAbout";
import { WarmAbout } from "./about/WarmAbout";

// Stats (Vibrant only)
import { VibrantStats } from "./stats/VibrantStats";

// Shared
import { TemplateProducts } from "./TemplateProducts";
import { TemplateBooking } from "./TemplateBooking";
import { TemplateContact } from "./TemplateContact";
import { TemplateMap } from "./TemplateMap";
import { TemplateFooter } from "./TemplateFooter";

type TemplateName = "classic" | "bold" | "elegant" | "vibrant" | "warm";

interface TemplateOrchestratorProps {
  data: PreviewData;
  locale?: "en" | "es";
}

function getTemplateName(data: PreviewData): TemplateName {
  const variant = data.template_variant;
  if (variant && ["classic", "bold", "elegant", "vibrant", "warm"].includes(variant)) {
    return variant as TemplateName;
  }
  return "classic";
}

function getColors(data: PreviewData): ThemeColors {
  const customColors = (data.generated_copy as unknown as Record<string, unknown>)?.custom_colors as ThemeColors | undefined;
  if (customColors && customColors.primary) {
    return customColors;
  }
  const themes = THEMES_BY_VERTICAL[data.business_type];
  const theme = themes?.find((t) => t.id === data.color_theme);
  return theme?.colors ?? themes?.[0]?.colors ?? {
    primary: "#B8860B",
    secondary: "#FFFDD0",
    accent: "#DAA520",
    background: "#FFF8F0",
    foreground: "#2D2017",
    muted: "#F5E6D3",
  };
}

function getLogo(data: PreviewData): string | undefined {
  return (data.generated_copy as unknown as Record<string, unknown>)?.logo as string | undefined;
}

function getCopy(data: PreviewData, locale: "en" | "es"): GeneratedCopy["en"] | null {
  if (!data.generated_copy) return null;
  return data.generated_copy[locale];
}

export function TemplateOrchestrator({ data, locale = "en" }: TemplateOrchestratorProps) {
  const template = getTemplateName(data);
  const colors = getColors(data);
  const logo = getLogo(data);
  const copy = getCopy(data, locale);

  const services = data.services.map((s) => ({
    ...s,
    description: copy?.service_descriptions?.[s.name] ?? s.description,
  }));

  const heroProps = {
    businessName: data.business_name,
    headline: copy?.hero_headline ?? `Welcome to ${data.business_name}`,
    subheadline: copy?.hero_subheadline ?? "Your neighborhood destination for quality service.",
    heroImage: data.images?.[0],
    logo,
    colors,
    bookingUrl: data.booking_url,
    phone: data.phone,
  };

  const galleryImages = data.images && data.images.length > 1 ? data.images.slice(1) : [];
  const aboutParagraphs = copy?.about_paragraphs ?? [
    `${data.business_name} is dedicated to providing excellent service to our community.`,
    "Visit us today and experience the difference.",
  ];

  // Shared sections rendered in all templates
  const productsSection = data.products && data.products.length > 0 ? (
    <TemplateProducts products={data.products} colors={colors} />
  ) : null;

  const bookingSection = (
    <TemplateBooking phone={data.phone} bookingUrl={data.booking_url} colors={colors} />
  );

  const contactSection = <TemplateContact colors={colors} previewMode />;
  const mapSection = <TemplateMap address={data.address} colors={colors} />;
  const footerSection = (
    <TemplateFooter
      businessName={data.business_name}
      tagline={copy?.footer_tagline}
      address={data.address}
      phone={data.phone}
      hours={data.hours}
      colors={colors}
    />
  );

  // Template-specific section rendering
  switch (template) {
    case "bold":
      return (
        <div>
          <BoldHero {...heroProps} />
          {galleryImages.length > 0 && <BoldGallery images={galleryImages} colors={colors} />}
          <BoldServices services={services} colors={colors} />
          <BoldAbout paragraphs={aboutParagraphs} colors={colors} />
          {productsSection}
          {bookingSection}
          {contactSection}
          {mapSection}
          {footerSection}
        </div>
      );

    case "elegant":
      return (
        <div>
          <ElegantHero {...heroProps} />
          <ElegantAbout paragraphs={aboutParagraphs} colors={colors} />
          <ElegantServices services={services} colors={colors} />
          {galleryImages.length > 0 && <ElegantGallery images={galleryImages} colors={colors} />}
          {productsSection}
          {bookingSection}
          {contactSection}
          {mapSection}
          {footerSection}
        </div>
      );

    case "vibrant":
      return (
        <div>
          <VibrantHero {...heroProps} />
          <VibrantServices services={services} colors={colors} />
          <VibrantStats serviceCount={services.length} address={data.address} colors={colors} />
          {galleryImages.length > 0 && <VibrantGallery images={galleryImages} colors={colors} />}
          <VibrantAbout paragraphs={aboutParagraphs} colors={colors} />
          {productsSection}
          {bookingSection}
          {contactSection}
          {mapSection}
          {footerSection}
        </div>
      );

    case "warm":
      return (
        <div>
          <WarmHero {...heroProps} />
          <WarmAbout paragraphs={aboutParagraphs} image={data.images?.[1]} colors={colors} />
          {galleryImages.length > 0 && <WarmGallery images={galleryImages} colors={colors} />}
          <WarmServices services={services} colors={colors} />
          {productsSection}
          {bookingSection}
          {contactSection}
          {mapSection}
          {footerSection}
        </div>
      );

    case "classic":
    default:
      return (
        <div>
          <ClassicHero {...heroProps} />
          <ClassicServices services={services} colors={colors} />
          {galleryImages.length > 0 && <ClassicGallery images={galleryImages} colors={colors} />}
          <ClassicAbout paragraphs={aboutParagraphs} image={data.images?.[1]} colors={colors} />
          {productsSection}
          {bookingSection}
          {contactSection}
          {mapSection}
          {footerSection}
        </div>
      );
  }
}
```

- [ ] **Step 2: Run type check**

Run: `cd /Users/aws/Downloads/web-project/siteforowners && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/templates/TemplateOrchestrator.tsx
git commit -m "feat: add TemplateOrchestrator with 5 template layouts"
```

---

## Task 13: Update Exports and Swap TemplateRenderer

**Files:**
- Modify: `src/components/templates/index.ts`
- Modify: `src/app/(marketing)/preview/[slug]/PreviewClient.tsx`

- [ ] **Step 1: Update index.ts exports**

Replace the entire contents of `src/components/templates/index.ts` with:

```typescript
export { TemplateOrchestrator } from "./TemplateOrchestrator";
export { TemplateFooter } from "./TemplateFooter";
export { TemplateMap } from "./TemplateMap";
export { TemplateContact } from "./TemplateContact";
export { TemplateBooking } from "./TemplateBooking";
export { TemplateProducts } from "./TemplateProducts";
```

- [ ] **Step 2: Update PreviewClient to use TemplateOrchestrator**

In `src/app/(marketing)/preview/[slug]/PreviewClient.tsx`, change:

```typescript
import { TemplateRenderer } from "@/components/templates";
```

to:

```typescript
import { TemplateOrchestrator } from "@/components/templates";
```

And change the JSX from:

```typescript
<TemplateRenderer data={data} locale={locale} />
```

to:

```typescript
<TemplateOrchestrator data={data} locale={locale} />
```

- [ ] **Step 3: Delete old files**

```bash
rm src/components/templates/TemplateRenderer.tsx
rm src/components/templates/TemplateHero.tsx
rm src/components/templates/TemplateServices.tsx
rm src/components/templates/TemplateGallery.tsx
rm src/components/templates/TemplateAbout.tsx
```

- [ ] **Step 4: Run type check**

Run: `cd /Users/aws/Downloads/web-project/siteforowners && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: swap TemplateRenderer for TemplateOrchestrator, clean up old files"
```

---

## Task 14: Update Generate-Copy API with Template Assignment

**Files:**
- Modify: `src/app/api/generate-copy/route.ts`

- [ ] **Step 1: Add template assignment logic**

Add this after the `darken` function and before the `POST` handler:

```typescript
type TemplateName = 'classic' | 'bold' | 'elegant' | 'vibrant' | 'warm';

const ALL_TEMPLATES: TemplateName[] = ['classic', 'bold', 'elegant', 'vibrant', 'warm'];

const CONTRAST_PAIRS: Record<TemplateName, TemplateName[]> = {
  classic: ['bold', 'vibrant'],
  bold: ['elegant', 'warm'],
  elegant: ['vibrant', 'bold'],
  vibrant: ['elegant', 'warm'],
  warm: ['bold', 'vibrant'],
};

function pickTwoTemplates(): [TemplateName, TemplateName] {
  const a = ALL_TEMPLATES[Math.floor(Math.random() * ALL_TEMPLATES.length)];
  const pairs = CONTRAST_PAIRS[a];
  const b = pairs[Math.floor(Math.random() * pairs.length)];
  return [a, b];
}
```

- [ ] **Step 2: Update the preview row creation**

In the `POST` handler, add template picking and change the `template_variant` field. Find the line:

```typescript
    const variantLabels = ["A", "B"];
```

Add after it:

```typescript
    const [templateA, templateB] = pickTwoTemplates();
    const templates = [templateA, templateB];
```

Then change the `template_variant` line inside `previewRows` from:

```typescript
      template_variant: `${business_type}_${variant.style}`,
```

to:

```typescript
      template_variant: templates[i],
```

- [ ] **Step 3: Run type check**

Run: `cd /Users/aws/Downloads/web-project/siteforowners && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/app/api/generate-copy/route.ts
git commit -m "feat: assign contrasting template layouts to preview variants"
```

---

## Task 15: Update CompareClient with Template Metadata

**Files:**
- Modify: `src/app/(marketing)/preview/compare/[groupId]/CompareClient.tsx`

- [ ] **Step 1: Replace VARIANT_STYLES with dynamic template metadata**

Replace the `VARIANT_STYLES` constant:

```typescript
const VARIANT_STYLES: Record<string, { name: string; desc: string; icon: string }> = {
  A: { name: "Design A", desc: "Bold & Energetic", icon: "🔥" },
  B: { name: "Design B", desc: "Warm & Personal", icon: "🤝" },
};
```

with:

```typescript
const TEMPLATE_META: Record<string, { desc: string; icon: string }> = {
  classic: { desc: "Clean & Professional", icon: "💼" },
  bold: { desc: "Bold & Modern", icon: "🔥" },
  elegant: { desc: "Elegant & Minimal", icon: "✨" },
  vibrant: { desc: "Fun & Energetic", icon: "🎉" },
  warm: { desc: "Warm & Personal", icon: "🤝" },
};
```

- [ ] **Step 2: Update the card rendering to use template metadata**

In the `previews.map` callback, replace:

```typescript
            const label = preview.variant_label || "A";
            const style = VARIANT_STYLES[label] || VARIANT_STYLES.A;
```

with:

```typescript
            const label = preview.variant_label || "A";
            const templateName = preview.template_variant || "classic";
            const meta = TEMPLATE_META[templateName] || TEMPLATE_META.classic;
```

Then update the card's info section. Replace:

```typescript
                        <span className="text-xl">{style.icon}</span>
                        <h3 className="text-lg font-semibold text-gray-900">
                          {style.name}
                        </h3>
                        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-500">
                          {style.desc}
                        </span>
```

with:

```typescript
                        <span className="text-xl">{meta.icon}</span>
                        <h3 className="text-lg font-semibold text-gray-900">
                          Design {label}
                        </h3>
                        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-500">
                          {meta.desc}
                        </span>
```

- [ ] **Step 3: Run type check**

Run: `cd /Users/aws/Downloads/web-project/siteforowners && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/app/(marketing)/preview/compare/
git commit -m "feat: show template style metadata on compare page"
```

---

## Task 16: Build and Verify

- [ ] **Step 1: Run full build**

Run: `cd /Users/aws/Downloads/web-project/siteforowners && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Fix any build errors**

If ESLint or type errors occur, fix them and re-run the build.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: fix any build issues from template migration"
```

(Only needed if Step 2 found issues. Skip if build passed clean.)
