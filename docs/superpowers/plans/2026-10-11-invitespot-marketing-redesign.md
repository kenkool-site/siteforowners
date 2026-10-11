# InviteSpot Marketing Site Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the `invitespot.app` landing page so it shows off Invites and Memories as co-equal features with real screenshots, refresh the visual identity to a warm/romantic palette, and add sitemap/robots so the page is discoverable by Google.

**Architecture:** Split the current single `InviteSpotLandingContent.tsx` into five focused section components (Hero, Invites showcase, Memories showcase, How It Works, Pricing) composed by a thin `InviteSpotLandingContent.tsx`, matching this codebase's existing convention for larger pages. Add two new static-route files (`src/app/sitemap.ts`, `src/app/robots.ts`) using Next's native metadata-route APIs. Showcase images are referenced by a plain string path (`/invitespot/...`), not a static `import`, specifically so the build and tests succeed before the real screenshot files exist — `next/image` only validates a plain-string `src` at request time, not at build time.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Tailwind CSS, next-intl, next/image.

**Spec:** `docs/superpowers/specs/2026-10-11-invitespot-marketing-redesign-design.md`

## Global Constraints

- Full bilingual copy (English + Spanish) for every new string — no hardcoded English, no partial translation. This product is explicitly quote-based/white-glove (the team builds it manually and replies with a quote), not self-serve — new copy must not imply self-serve signup; keep the existing "tell us about your event, we'll reply with examples and a quote" framing.
- Visual palette: background `#FBF3F0`, body text `#2E1A1E`, heading/accent (dusty rose) `#6B2F3A`, secondary accent (terracotta) `#C98A8F`, muted/secondary text `#8C6B6F`, card background `#F6E8E2`, card border `#EAD9D3`. These replace the current `#F4EEE4`/`#241F1A`/`#1F3A2E`/`#5b5147`/`#8a7f70` palette throughout the landing page — not just the new sections, so the whole page reads as one consistent redesign, not old sections bolted to new ones.
- Showcase images are referenced by path only (`/invitespot/invites-showcase.jpg`, `/invitespot/memories-showcase.jpg`) — the actual image files do not exist yet and are explicitly out of scope for every task in this plan (see the final non-task note). Do not generate placeholder/stock images as a substitute; use clear `alt` text so the page remains meaningful before the real files land.
- Mobile-first: every new section must work at 375px width, matching this codebase's existing responsive conventions (the current page's `sm:`-prefixed Tailwind classes are the pattern to follow).
- Every modified/new test file must be run via `npx tsx --test "src/**/*.test.ts" "src/**/*.test.tsx"` (the quoted-glob form) for final verification — this codebase's Node test runner silently matches zero files in `[slug]`-bracketed directories if you pre-expand the glob yourself.

## Review Focus

- A guest on a 375px-wide phone (the dominant real-world case for a wedding invite link shared in a group chat) must see the new Invites/Memories sections without horizontal scroll or illegible text — the spec's screenshots are real product images with their own aspect ratios, and a careless `next/image` configuration (no `sizes`, wrong `width`/`height` ratio) is exactly the kind of thing that looks fine on a desktop preview and breaks on mobile.
- The lead form and referral-banner logic (both already working, not part of this redesign's actual problem) must survive the `InviteSpotLandingContent.tsx` refactor completely unchanged in behavior — a careless extraction is the most likely way to silently break something that already works.
- Every string shown to a Spanish-locale visitor must actually come from `es.json`, not fall back to English — the existing tests already catch missing English strings via `renderToStaticMarkup`, but nothing currently exercises the Spanish copy path for this page at all; this plan's test task must add that coverage, not just extend the English-only pattern.
- The page's own metadata (`src/app/invitespot/page.tsx`) must keep declaring its own `canonical`/`openGraph`/`twitter` values rather than inheriting the root layout's SiteForOwners branding — this exact regression was already caught once (see the existing test asserting this), and refreshing the description copy is easy to do carelessly in a way that drops the rest of the block.
- `sitemap.ts`/`robots.ts` must point at `https://www.invitespot.app`, not `https://invitespot.app` (no `www`) or `https://www.siteforowners.com` — this is a different product on a different domain from the rest of this codebase's existing SEO work, and copying an existing pattern without changing the hostname is an easy mistake.

---

### Task 1: Extract `InviteSpotHowItWorks` and `InviteSpotPricing` from `InviteSpotLandingContent`

**Files:**
- Create: `src/components/invitespot/InviteSpotHowItWorks.tsx`
- Create: `src/components/invitespot/InviteSpotPricing.tsx`
- Modify: `src/components/invitespot/InviteSpotLandingContent.tsx`

**Interfaces:**
- Produces: `export function InviteSpotHowItWorks(): JSX.Element` and `export function InviteSpotPricing(): JSX.Element` — both self-contained (own `useTranslations("invitespot")` call, no props), extracted verbatim from the current inline JSX with zero behavior change.

This is a pure mechanical refactor — no visual or content change yet (that comes in later tasks). It establishes the componentized pattern with the lowest-risk pieces first, verified by the fact that the *existing* tests must still pass completely unchanged.

- [ ] **Step 1: Create `InviteSpotHowItWorks.tsx`**

```tsx
"use client";

import { useTranslations } from "next-intl";

export function InviteSpotHowItWorks() {
  const t = useTranslations("invitespot");
  return (
    <section className="mx-auto max-w-5xl px-6 py-12">
      <p className="text-xs font-semibold uppercase tracking-wider text-[#8a7f70]">{t("howItWorks.heading")}</p>
      <div className="mt-5 grid gap-6 sm:grid-cols-3">
        {(["step1", "step2", "step3"] as const).map((key, index) => (
          <div key={key}>
            <div className="flex size-8 items-center justify-center rounded-full bg-[#1F3A2E] text-sm font-semibold text-[#F4EEE4]">{index + 1}</div>
            <h3 className="mt-3 font-semibold">{t(`howItWorks.${key}.title`)}</h3>
            <p className="mt-2 text-sm text-[#5b5147]">{t(`howItWorks.${key}.body`)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

This is a byte-for-byte extraction of the current inline JSX — same colors, same structure, nothing changed except living in its own file. Task 7 is the one place the palette actually changes, for every section at once.

- [ ] **Step 2: Create `InviteSpotPricing.tsx`**

```tsx
"use client";

import { useTranslations } from "next-intl";

export function InviteSpotPricing() {
  const t = useTranslations("invitespot");
  return (
    <section className="mx-auto max-w-5xl px-6 py-12">
      <p className="text-xs font-semibold uppercase tracking-wider text-[#8a7f70]">{t("pricing.heading")}</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {(["tier1", "tier2", "tier3"] as const).map((key) => (
          <div key={key} className="rounded-xl border border-[#e5dfd0] bg-white p-5">
            <h3 className="font-semibold">{t(`pricing.${key}.title`)}</h3>
            <p className="mt-1.5 text-sm text-[#5b5147]">{t(`pricing.${key}.body`)}</p>
            <a href="#event-form" className="mt-3 inline-block text-sm font-semibold text-[#1F3A2E] underline underline-offset-4">{t("pricing.cta")}</a>
          </div>
        ))}
      </div>
      <p className="mt-5 text-sm text-[#5b5147]">{t("pricing.note")}</p>
    </section>
  );
}
```

Same as Step 1 — a byte-for-byte extraction, no color changes.

- [ ] **Step 3: Wire both into `InviteSpotLandingContent.tsx`**

Replace the inline `<section>...howItWorks...</section>` block with `<InviteSpotHowItWorks />` and the inline pricing `<section>` with `<InviteSpotPricing />`. Add the two imports. Remove nothing else from the file yet — the "what you get" grid, hero, header, referral banner, lead form, and footer all stay exactly where they are for now.

- [ ] **Step 4: Run the existing test suite to confirm zero behavior change**

Run: `npx tsx --test src/app/invitespot/page.render.test.tsx`
Expected: PASS, all 4 existing tests, unchanged — this file's assertions don't reference How It Works or Pricing content directly, so this mainly confirms the extraction didn't break the render tree around them (hero/referral-banner assertions still passing proves the surrounding structure is intact).

- [ ] **Step 5: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/invitespot/InviteSpotHowItWorks.tsx src/components/invitespot/InviteSpotPricing.tsx src/components/invitespot/InviteSpotLandingContent.tsx
git commit -m "refactor: extract How It Works and Pricing into their own components"
```

---

### Task 2: Add `sitemap.ts` and `robots.ts`

**Files:**
- Create: `src/app/sitemap.ts`
- Create: `src/app/robots.ts`

**Interfaces:**
- Produces: Next.js's native metadata-route convention — `GET /sitemap.xml` and `GET /robots.txt` once built, handled entirely by the framework from these two files; no manual route handler needed.

Fully independent of the rest of this plan — can be implemented and tested on its own.

- [ ] **Step 1: Write the failing structural test**

Create `src/app/sitemap.test.ts`:
```ts
import assert from "node:assert/strict";
import test from "node:test";
import sitemap from "./sitemap";

test("the sitemap lists the canonical invitespot.app homepage with the www host", () => {
  const entries = sitemap();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].url, "https://www.invitespot.app/");
});
```

Create `src/app/robots.test.ts`:
```ts
import assert from "node:assert/strict";
import test from "node:test";
import robots from "./robots";

test("robots.txt allows all crawlers and points at the invitespot.app sitemap", () => {
  const result = robots();
  assert.deepEqual(result.rules, { userAgent: "*", allow: "/" });
  assert.equal(result.sitemap, "https://www.invitespot.app/sitemap.xml");
});
```

- [ ] **Step 2: Run both tests to verify they fail**

Run: `npx tsx --test src/app/sitemap.test.ts src/app/robots.test.ts`
Expected: FAIL with "Cannot find module './sitemap'" / "./robots" (files don't exist yet).

- [ ] **Step 3: Implement `src/app/sitemap.ts`**

```ts
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://www.invitespot.app/",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
```

- [ ] **Step 4: Implement `src/app/robots.ts`**

```ts
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: "https://www.invitespot.app/sitemap.xml",
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx tsx --test src/app/sitemap.test.ts src/app/robots.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck and build, confirm the routes actually appear**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors; the build's route summary includes `/sitemap.xml` and `/robots.txt`.

- [ ] **Step 7: Commit**

```bash
git add src/app/sitemap.ts src/app/sitemap.test.ts src/app/robots.ts src/app/robots.test.ts
git commit -m "feat: add sitemap.xml and robots.txt for invitespot.app"
```

---

### Task 3: Rewrite the `invitespot` translation namespace for the new sections

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/es.json`

**Interfaces:**
- Produces: new keys `invitespot.hero.subtitle` (replaced), `invitespot.invites.*`, `invitespot.memories.*` — consumed by Tasks 4–6. Removes `invitespot.whatYouGet.*` (superseded by the two new showcase sections — nothing else references it after this task, confirmed by grepping for `whatYouGet` across `src/` before removing it).

This task only touches copy — no component changes yet. Pinning exact bilingual text now means Tasks 4–6 are pure wiring, not copywriting.

- [ ] **Step 1: Update `messages/en.json`'s `invitespot` object**

Replace the `hero` object's `subtitle` field only (title, cta, microcopy stay exactly as they are — see Global Constraints on preserving the quote-based framing):
```json
"subtitle": "A custom invitation page, RSVPs people actually answer, and every guest's photos in one place — for weddings, birthdays, naming ceremonies, burials, and anniversaries.",
```

Replace the entire `whatYouGet` object with two new sibling objects, `invites` and `memories`:
```json
"invites": {
  "heading": "A page as special as your invitation",
  "body": "We design a custom page with your names, your colors, your story. Guests RSVP in seconds.",
  "bullet1": "Your own web address — not a booking code",
  "bullet2": "RSVPs people actually answer, with automatic reminders",
  "bullet3": "Set a deadline, or make an exception for latecomers — your call",
  "imageAlt": "A custom InviteSpot invitation page"
},
"memories": {
  "heading": "Every guest's photos, without the chasing",
  "body": "One printed QR code on the tables. Guests upload straight from their phones — no app, no sign-up — and every photo lands in one shared gallery you can look back on forever.",
  "bullet1": "No app or account for guests — just scan and share",
  "bullet2": "Photos appear live, during the event",
  "bullet3": "You choose who can see it — public or passcode-protected",
  "imageAlt": "A shared InviteSpot photo gallery from a real event"
},
```

- [ ] **Step 2: Update `messages/es.json`'s `invitespot` object**

Replace `hero.subtitle` only:
```json
"subtitle": "Una página de invitación personalizada, confirmaciones que la gente realmente responde, y las fotos de cada invitado en un solo lugar — para bodas, cumpleaños, ceremonias de nombramiento, funerales y aniversarios.",
```

Replace `whatYouGet` with:
```json
"invites": {
  "heading": "Una página tan especial como tu invitación",
  "body": "Diseñamos una página personalizada con tus nombres, tus colores, tu historia. Los invitados confirman su asistencia en segundos.",
  "bullet1": "Tu propia dirección web — no un código de reserva",
  "bullet2": "Confirmaciones que la gente sí responde, con recordatorios automáticos",
  "bullet3": "Define una fecha límite, o haz una excepción para los rezagados — tú decides",
  "imageAlt": "Una página de invitación personalizada de InviteSpot"
},
"memories": {
  "heading": "Las fotos de cada invitado, sin tener que perseguirlas",
  "body": "Un código QR impreso en las mesas. Los invitados suben fotos desde su teléfono — sin apps, sin registro — y cada foto llega a una galería compartida que podrás recordar para siempre.",
  "bullet1": "Sin apps ni cuentas para los invitados — solo escanear y compartir",
  "bullet2": "Las fotos aparecen en vivo, durante el evento",
  "bullet3": "Tú eliges quién puede verla — pública o protegida con clave",
  "imageAlt": "Una galería de fotos compartida de un evento real en InviteSpot"
},
```

- [ ] **Step 3: Confirm the only remaining reference to the removed `whatYouGet` key is the one Task 7 will replace**

Run: `grep -rn "whatYouGet" src/`
Expected: exactly one match, the inline grid still in `InviteSpotLandingContent.tsx` (this task only changes the JSON files — Task 7 is what removes that last reference when it rewrites `InviteSpotLandingContent.tsx`). More than one match means something else in `src/` depends on this key and needs investigation before continuing.

- [ ] **Step 4: Validate both JSON files still parse**

Run: `node -e "require('./messages/en.json'); require('./messages/es.json'); console.log('ok')"`
Expected: prints `ok`, no syntax errors.

- [ ] **Step 5: Commit**

```bash
git add messages/en.json messages/es.json
git commit -m "feat: add Invites and Memories showcase copy, en/es"
```

---

### Task 4: Build `InviteSpotHero.tsx`

**Files:**
- Create: `src/components/invitespot/InviteSpotHero.tsx`
- Modify: `src/components/invitespot/InviteSpotLandingContent.tsx`

**Interfaces:**
- Consumes: `invitespot.hero.*` from Task 3.
- Produces: `export function InviteSpotHero(): JSX.Element` — self-contained, no props (the current hero has none either).

- [ ] **Step 1: Create `InviteSpotHero.tsx`**

```tsx
"use client";

import { useTranslations } from "next-intl";

export function InviteSpotHero() {
  const t = useTranslations("invitespot");
  return (
    <section className="mx-auto max-w-3xl px-6 py-16 text-center">
      <h1 className="font-serif text-4xl font-bold leading-tight text-[#2E1A1E] sm:text-5xl">{t("hero.title")}</h1>
      <p className="mx-auto mt-5 max-w-xl text-base text-[#5b4f3f]">{t("hero.subtitle")}</p>
      <a href="#event-form" className="mt-8 inline-flex min-h-11 items-center justify-center rounded-lg bg-[#6B2F3A] px-8 py-3.5 text-base font-semibold text-[#FBF3F0] hover:bg-[#5a2630]">
        {t("hero.cta")}
      </a>
      <p className="mt-3 text-xs text-[#8C6B6F]">{t("hero.microcopy")}</p>
    </section>
  );
}
```

- [ ] **Step 2: Wire into `InviteSpotLandingContent.tsx`**

Replace the inline hero `<section>` with `<InviteSpotHero />`, add the import.

- [ ] **Step 3: Update the existing render test for the new hero copy**

In `src/app/invitespot/page.render.test.tsx`, the test `"the invitespot.app landing page renders the hero and form without a referral name"` currently asserts `/You send the details\. We build the page\./` — this string is unchanged by this task (only `hero.subtitle` changed in Task 3, not `hero.title`), so this specific assertion should still pass unmodified. Add one new assertion to the same test confirming the new subtitle text renders:
```ts
assert.match(html, /A custom invitation page, RSVPs people actually answer/);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test src/app/invitespot/page.render.test.tsx`
Expected: PASS, including the new assertion.

- [ ] **Step 5: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/invitespot/InviteSpotHero.tsx src/components/invitespot/InviteSpotLandingContent.tsx src/app/invitespot/page.render.test.tsx
git commit -m "feat: extract InviteSpotHero with refreshed subtitle copy"
```

---

### Task 5: Build `InviteSpotInvitesShowcase.tsx`

**Files:**
- Create: `src/components/invitespot/InviteSpotInvitesShowcase.tsx`

**Interfaces:**
- Consumes: `invitespot.invites.*` from Task 3.
- Produces: `export function InviteSpotInvitesShowcase(): JSX.Element` — not yet wired into `InviteSpotLandingContent.tsx` (that happens in Task 7, alongside Memories, so both showcase sections land in the page together rather than shipping Invites alone with a half-finished page).

- [ ] **Step 1: Create `InviteSpotInvitesShowcase.tsx`**

```tsx
"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";

export function InviteSpotInvitesShowcase() {
  const t = useTranslations("invitespot");
  return (
    <section className="mx-auto max-w-5xl px-6 py-14">
      <div className="grid items-center gap-8 sm:grid-cols-2">
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-[#F6E8E2] sm:order-1">
          <Image
            src="/invitespot/invites-showcase.jpg"
            alt={t("invites.imageAlt")}
            fill
            sizes="(max-width: 640px) 100vw, 50vw"
            className="object-cover"
          />
        </div>
        <div className="sm:order-2">
          <h2 className="font-serif text-2xl font-bold text-[#2E1A1E] sm:text-3xl">{t("invites.heading")}</h2>
          <p className="mt-3 text-base text-[#5b4f3f]">{t("invites.body")}</p>
          <ul className="mt-5 space-y-2.5 text-sm text-[#5b4f3f]">
            {(["bullet1", "bullet2", "bullet3"] as const).map((key) => (
              <li key={key} className="flex gap-2.5">
                <span aria-hidden="true" className="mt-0.5 text-[#C98A8F]">♥</span>
                <span>{t(`invites.${key}`)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
```

(`sm:order-1`/`sm:order-2` puts the image first on mobile regardless of DOM order — the image leads on the small screen where there's no side-by-side layout to alternate. The alternating left/right placement between this section and Memories, per the approved layout direction, is handled in Task 7 by how the two components get arranged, not inside this component — this component's own image always renders on the left at `sm:` and up.)

- [ ] **Step 2: Write a render test**

Create `src/components/invitespot/InviteSpotInvitesShowcase.test.tsx`:
```tsx
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../messages/en.json";
import esMessages from "../../../messages/es.json";
import { InviteSpotInvitesShowcase } from "./InviteSpotInvitesShowcase";

Object.assign(globalThis, { React });

function render(messages: typeof enMessages, locale: string): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <InviteSpotInvitesShowcase />
    </NextIntlClientProvider>,
  );
}

test("the Invites showcase renders its English heading, body, and all three bullets", () => {
  const html = render(enMessages, "en");
  assert.match(html, /A page as special as your invitation/);
  assert.match(html, /Your own web address — not a booking code/);
  assert.match(html, /Set a deadline, or make an exception for latecomers/);
});

test("the Invites showcase renders its Spanish copy for a Spanish-locale visitor", () => {
  const html = render(esMessages, "es");
  assert.match(html, /Una página tan especial como tu invitación/);
  assert.match(html, /Tu propia dirección web — no un código de reserva/);
});

test("the Invites showcase references the showcase image with real alt text, not an empty string", () => {
  const html = render(enMessages, "en");
  assert.match(html, /alt="A custom InviteSpot invitation page"/);
});
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `npx tsx --test src/components/invitespot/InviteSpotInvitesShowcase.test.tsx`
Expected: PASS, all 3 tests.

- [ ] **Step 4: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors. (`next/image` does not validate that `/invitespot/invites-showcase.jpg` exists on disk for a plain string `src` — the build succeeds even though that file doesn't exist yet.)

- [ ] **Step 5: Commit**

```bash
git add src/components/invitespot/InviteSpotInvitesShowcase.tsx src/components/invitespot/InviteSpotInvitesShowcase.test.tsx
git commit -m "feat: add InviteSpotInvitesShowcase component"
```

---

### Task 6: Build `InviteSpotMemoriesShowcase.tsx`

**Files:**
- Create: `src/components/invitespot/InviteSpotMemoriesShowcase.tsx`

**Interfaces:**
- Consumes: `invitespot.memories.*` from Task 3.
- Produces: `export function InviteSpotMemoriesShowcase(): JSX.Element` — same not-yet-wired status as Task 5.

- [ ] **Step 1: Create `InviteSpotMemoriesShowcase.tsx`**

```tsx
"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";

export function InviteSpotMemoriesShowcase() {
  const t = useTranslations("invitespot");
  return (
    <section className="mx-auto max-w-5xl px-6 py-14">
      <div className="grid items-center gap-8 sm:grid-cols-2">
        <div className="sm:order-1">
          <h2 className="font-serif text-2xl font-bold text-[#2E1A1E] sm:text-3xl">{t("memories.heading")}</h2>
          <p className="mt-3 text-base text-[#5b4f3f]">{t("memories.body")}</p>
          <ul className="mt-5 space-y-2.5 text-sm text-[#5b4f3f]">
            {(["bullet1", "bullet2", "bullet3"] as const).map((key) => (
              <li key={key} className="flex gap-2.5">
                <span aria-hidden="true" className="mt-0.5 text-[#C98A8F]">♥</span>
                <span>{t(`memories.${key}`)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-[#F6E8E2] sm:order-2">
          <Image
            src="/invitespot/memories-showcase.jpg"
            alt={t("memories.imageAlt")}
            fill
            sizes="(max-width: 640px) 100vw, 50vw"
            className="object-cover"
          />
        </div>
      </div>
    </section>
  );
}
```

(Mirror of Task 5's component with text and image sides swapped — this is what actually produces the "alternating rows" rhythm from the approved layout direction once both sections sit one after another in Task 7. On mobile both still stack text-then-image in DOM order; only the `sm:` grid changes which side each sits on, so there's no `sm:order` flip needed here the way Task 5 needed one — Task 5's image needed to jump ahead of its own text on mobile to lead with the visual; this component's text is already first in DOM order, which is fine for mobile.)

- [ ] **Step 2: Write a render test**

Create `src/components/invitespot/InviteSpotMemoriesShowcase.test.tsx`, mirroring Task 5's test file exactly in structure:
```tsx
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../messages/en.json";
import esMessages from "../../../messages/es.json";
import { InviteSpotMemoriesShowcase } from "./InviteSpotMemoriesShowcase";

Object.assign(globalThis, { React });

function render(messages: typeof enMessages, locale: string): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <InviteSpotMemoriesShowcase />
    </NextIntlClientProvider>,
  );
}

test("the Memories showcase renders its English heading, body, and all three bullets", () => {
  const html = render(enMessages, "en");
  assert.match(html, /Every guest&#x27;s photos, without the chasing/);
  assert.match(html, /No app or account for guests — just scan and share/);
  assert.match(html, /You choose who can see it — public or passcode-protected/);
});

test("the Memories showcase renders its Spanish copy for a Spanish-locale visitor", () => {
  const html = render(esMessages, "es");
  assert.match(html, /Las fotos de cada invitado, sin tener que perseguirlas/);
  assert.match(html, /Sin apps ni cuentas para los invitados/);
});

test("the Memories showcase references the showcase image with real alt text, not an empty string", () => {
  const html = render(enMessages, "en");
  assert.match(html, /alt="A shared InviteSpot photo gallery from a real event"/);
});
```

(Watch the apostrophe in "guest's" — `renderToStaticMarkup` HTML-escapes it to `&#x27;`, matching the existing convention already used elsewhere in this test suite, e.g. `page.render.test.tsx`'s own `You came from Mia and Lee&#x27;s page` assertion.)

- [ ] **Step 3: Run the test to verify it passes**

Run: `npx tsx --test src/components/invitespot/InviteSpotMemoriesShowcase.test.tsx`
Expected: PASS, all 3 tests.

- [ ] **Step 4: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/invitespot/InviteSpotMemoriesShowcase.tsx src/components/invitespot/InviteSpotMemoriesShowcase.test.tsx
git commit -m "feat: add InviteSpotMemoriesShowcase component"
```

---

### Task 7: Assemble the final page, apply the palette throughout, refresh metadata

**Files:**
- Modify: `src/components/invitespot/InviteSpotLandingContent.tsx`
- Modify: `src/components/invitespot/InviteSpotHowItWorks.tsx`
- Modify: `src/components/invitespot/InviteSpotPricing.tsx`
- Modify: `src/app/invitespot/page.tsx`
- Modify: `src/app/invitespot/page.render.test.tsx`

**Interfaces:**
- Consumes: `InviteSpotHero` (Task 4), `InviteSpotInvitesShowcase` (Task 5), `InviteSpotMemoriesShowcase` (Task 6), `InviteSpotHowItWorks`/`InviteSpotPricing` (Task 1).
- Produces: the finished, fully-composed landing page. This is the task where the whole redesign actually becomes visible — Tasks 1–6 are inert until this lands.

This is the task that must land as one unit: a half-wired page (e.g., new showcase sections present but still-old palette on the header/footer) would look like an unfinished redesign, not a shipped one.

- [ ] **Step 1: Rewrite `InviteSpotLandingContent.tsx`**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { InvitespotLeadForm } from "./InvitespotLeadForm";
import { InviteSpotHero } from "./InviteSpotHero";
import { InviteSpotInvitesShowcase } from "./InviteSpotInvitesShowcase";
import { InviteSpotMemoriesShowcase } from "./InviteSpotMemoriesShowcase";
import { InviteSpotHowItWorks } from "./InviteSpotHowItWorks";
import { InviteSpotPricing } from "./InviteSpotPricing";

export function InviteSpotLandingContent({ referralName, referralSlug }: { referralName: string | null; referralSlug: string | null }) {
  const t = useTranslations("invitespot");

  return (
    <main className="bg-[#FBF3F0] text-[#2E1A1E]">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <span className="font-serif text-xl font-semibold text-[#6B2F3A]">InviteSpot</span>
        <a href="#event-form" className="text-sm font-medium text-[#6B2F3A]">{t("nav.getStarted")}</a>
      </header>

      {referralName && (
        <div className="mx-auto max-w-5xl px-6">
          <p className="rounded-lg bg-[#F6E8E2] px-4 py-2.5 text-sm text-[#6B4850]">
            ♡ {t("referralBanner", { names: referralName })}
          </p>
        </div>
      )}

      <InviteSpotHero />
      <InviteSpotInvitesShowcase />
      <InviteSpotMemoriesShowcase />
      <InviteSpotHowItWorks />
      <InviteSpotPricing />

      <InvitespotLeadForm referralSlug={referralSlug} />

      <footer className="mx-auto flex max-w-5xl items-center justify-between px-6 py-8 text-xs text-[#8C6B6F]">
        <span>{t("footer.wordmark")}</span>
        <span>{t("footer.domain")}</span>
      </footer>
    </main>
  );
}
```

Note this drops the old `whatYouGet` 3-bullet grid entirely (superseded by the two showcase sections) and recolors `header`/`footer`/the referral banner to the new palette.

- [ ] **Step 2: Apply the new palette to `InviteSpotHowItWorks.tsx` and `InviteSpotPricing.tsx`**

Task 1 extracted both components byte-for-byte with the OLD colors, deliberately, so the whole page's palette changes in this one task instead of piecemeal. Now make that swap:

In `InviteSpotHowItWorks.tsx`, replace:
- `text-[#8a7f70]` (the "How it works" label) → `text-[#8C6B6F]`
- `bg-[#1F3A2E]` (the numbered circle) → `bg-[#6B2F3A]`
- `text-[#F4EEE4]` (the numbered circle's text) → `text-[#FBF3F0]`
- Add `text-[#2E1A1E]` to the `<h3>` step-title element's className (it currently has none, inheriting body text color implicitly — make it explicit to match the other headings in this redesign)

`text-[#5b5147]` (the step body text) stays as-is — it already reads fine against the new cream background and isn't part of the accent palette.

In `InviteSpotPricing.tsx`, replace:
- `text-[#8a7f70]` (the "What it costs" label) → `text-[#8C6B6F]`
- `border-[#e5dfd0]` (each tier card's border) → `border-[#EAD9D3]`
- `text-[#1F3A2E]` (the "Get a quote" link) → `text-[#6B2F3A]`

`bg-white` (card background), `text-[#5b5147]` (tier body text and the note at the bottom) stay as-is.

- [ ] **Step 3: Refresh `src/app/invitespot/page.tsx`'s metadata description**

Change every occurrence of `"Digital invitations and shared photos for your event."` (there are three: top-level `description`, `openGraph.description`, `twitter.description`) to:
```
"Custom invitation pages, RSVPs people actually answer, and every guest's photos in one place."
```
Do not touch `title`, `applicationName`, `alternates.canonical`, `openGraph.siteName`/`title`/`url`/`type`, or `twitter.card`/`title` — the existing test in Step 4 below pins those exact values and this task doesn't change them.

- [ ] **Step 4: Update `page.render.test.tsx` for the new structure**

Add new assertions to the existing `"renders the hero and form without a referral name"` test (don't create a new test, extend this one — it's already the test that renders the whole page):
```ts
assert.match(html, /A page as special as your invitation/);
assert.match(html, /Every guest&#x27;s photos, without the chasing/);
assert.doesNotMatch(html, /What you get/); // the old whatYouGet.heading text must be gone
```

The metadata test (`"the page declares its own InviteSpot-branded canonical/OpenGraph/Twitter metadata"`) needs no changes — it doesn't assert on `description`, only on `canonical`/`siteName`/`title`, none of which Step 2 touched.

- [ ] **Step 5: Run the full invitespot test surface**

Run: `npx tsx --test "src/app/invitespot/*.test.tsx" "src/components/invitespot/*.test.tsx"`
Expected: PASS — the page-level test plus both new showcase component tests from Tasks 5–6.

- [ ] **Step 6: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors; `/invitespot` still builds successfully.

- [ ] **Step 7: Full project sweep**

Run: `npx tsx --test "src/**/*.test.ts" "src/**/*.test.tsx"`
Expected: no failures anywhere in the project (confirms nothing outside `invitespot`/`sitemap`/`robots` regressed — nothing in this plan touches shared code, but this is the standard final check).

- [ ] **Step 8: Commit**

```bash
git add src/components/invitespot/InviteSpotLandingContent.tsx src/components/invitespot/InviteSpotHowItWorks.tsx src/components/invitespot/InviteSpotPricing.tsx src/app/invitespot/page.tsx src/app/invitespot/page.render.test.tsx
git commit -m "feat: assemble the redesigned invitespot.app landing page"
```

---

## After all 7 tasks: what this plan does NOT do

Two things from the spec are explicitly **not** part of any task above, and need a human, not a coding agent:

1. **Real screenshots.** `public/invitespot/invites-showcase.jpg` and `public/invitespot/memories-showcase.jpg` do not exist after this plan completes — the page will show broken-image icons (with meaningful alt text) in their place until someone captures real screenshots from the designated demo event and drops them in at those exact paths. No code change is needed once that happens.
2. **Exact demo event selection.** The spec flagged this as unresolved during brainstorming — confirm which event is safe to screenshot before capturing anything.
3. **Real-device mobile check.** This codebase's test convention (`renderToStaticMarkup`) confirms the right content and markup render, but can't verify actual visual layout — whether the alternating image/text grid genuinely looks right at 375px, whether the showcase images crop sensibly once real screenshots land, is something only a real browser can confirm. Load the finished page on an actual phone-width viewport before this goes live, the same way the earlier invitation-page-caching plan flagged its own `next/image` conversion as unverified without a live browser.
