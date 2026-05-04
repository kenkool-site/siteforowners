# /demo Portfolio Reel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/demo` as a luxury/editorial beauty portfolio reel for the founder's business-card QR flow, ending in a short lead form.

**Architecture:** Add a focused marketing route at `src/app/(marketing)/demo/page.tsx` with local demo components so the homepage remains unchanged. Extract marketing lead validation into a small tested helper, then reuse the existing `/api/marketing-leads` endpoint for both the homepage and `/demo` form with backwards-compatible optional fields.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, Framer Motion, node:test with `tsx`, Resend email API.

---

## File Structure

- Create `src/lib/marketing-lead.ts`: shared validation, sanitization, business type list, and HTML escaping for marketing lead submissions.
- Create `src/lib/marketing-lead.test.ts`: unit coverage for homepage-compatible leads and `/demo`-specific optional fields.
- Modify `src/app/api/marketing-leads/route.ts`: use the shared helper and include optional `/demo` fields in logging/email.
- Create `src/app/(marketing)/demo/_components/DemoLeadForm.tsx`: client-side form for `/demo`, posting to the existing lead endpoint.
- Create `src/app/(marketing)/demo/_components/DemoShowcase.tsx`: visual portfolio reel, journey strip, and dashboard proof data/rendering.
- Create `src/app/(marketing)/demo/page.tsx`: public `/demo` page shell and metadata.
- Modify `.env.example`: document the existing email variables if needed for lead delivery, without adding a new scheduler URL.

---

### Task 1: Extract And Test Marketing Lead Validation

**Files:**
- Create: `src/lib/marketing-lead.ts`
- Create: `src/lib/marketing-lead.test.ts`

- [ ] **Step 1: Create the failing test**

Create `src/lib/marketing-lead.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BUSINESS_TYPES,
  escapeHtml,
  parseMarketingLead,
} from "./marketing-lead";

test("BUSINESS_TYPES includes existing homepage options and new beauty demo options", () => {
  assert.ok(BUSINESS_TYPES.includes("Braids"));
  assert.ok(BUSINESS_TYPES.includes("Locs"));
  assert.ok(BUSINESS_TYPES.includes("Nails"));
  assert.ok(BUSINESS_TYPES.includes("Lashes / brows"));
  assert.ok(BUSINESS_TYPES.includes("Spa / skincare"));
});

test("parseMarketingLead accepts the existing homepage payload", () => {
  const result = parseMarketingLead({
    businessName: "  Crown Nails  ",
    email: " owner@example.com ",
    phone: " 555-123-4567 ",
    businessAddress: " 123 Main St ",
    businessType: "Nails",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.businessName, "Crown Nails");
  assert.equal(result.value.email, "owner@example.com");
  assert.equal(result.value.phone, "555-123-4567");
  assert.equal(result.value.businessAddress, "123 Main St");
  assert.equal(result.value.businessType, "Nails");
  assert.equal(result.value.source, "homepage");
});

test("parseMarketingLead accepts the /demo portfolio payload", () => {
  const result = parseMarketingLead({
    businessName: "Velvet Lash Studio",
    email: "lash@example.com",
    phone: "555-444-3333",
    businessType: "Lashes / brows",
    businessLink: "https://instagram.com/velvetlash",
    notes: "I want something premium like the demo.",
    source: "demo",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.source, "demo");
  assert.equal(result.value.businessLink, "https://instagram.com/velvetlash");
  assert.equal(result.value.notes, "I want something premium like the demo.");
});

test("parseMarketingLead rejects missing required fields", () => {
  const result = parseMarketingLead({
    businessName: "",
    email: "owner@example.com",
    phone: "555-123-4567",
    businessType: "Nails",
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error, "Business name, email, phone, and business type are required.");
});

test("parseMarketingLead rejects unsupported business type", () => {
  const result = parseMarketingLead({
    businessName: "Any Shop",
    email: "owner@example.com",
    phone: "555-123-4567",
    businessType: "Restaurant",
  });

  assert.equal(result.ok, false);
});

test("parseMarketingLead trims long optional notes to the accepted maximum", () => {
  const result = parseMarketingLead({
    businessName: "Crown Nails",
    email: "owner@example.com",
    phone: "555-123-4567",
    businessType: "Nails",
    notes: "x".repeat(1300),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.notes.length, 1200);
});

test("escapeHtml escapes email body values", () => {
  assert.equal(escapeHtml(`<script>"x" & 'y'</script>`), "&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx tsx --test src/lib/marketing-lead.test.ts
```

Expected: FAIL because `src/lib/marketing-lead.ts` does not exist.

- [ ] **Step 3: Create the validation helper**

Create `src/lib/marketing-lead.ts`:

```ts
export const BUSINESS_TYPES = [
  "Braids",
  "Locs",
  "Haircuts",
  "Nails",
  "Salon",
  "Hair",
  "Lashes / brows",
  "Barber / grooming",
  "Spa / skincare",
  "Other beauty business",
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];
export type LeadSource = "homepage" | "demo";

export type MarketingLead = {
  businessName: string;
  email: string;
  phone: string;
  businessAddress: string;
  businessType: BusinessType;
  businessLink: string;
  notes: string;
  source: LeadSource;
};

type ParseResult =
  | { ok: true; value: MarketingLead }
  | { ok: false; error: string };

function cleanString(value: unknown, maxLength = 240): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function isBusinessType(value: string): value is BusinessType {
  return BUSINESS_TYPES.includes(value as BusinessType);
}

function parseSource(value: string): LeadSource {
  return value === "demo" ? "demo" : "homepage";
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function parseMarketingLead(body: unknown): ParseResult {
  const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const businessName = cleanString(data.businessName);
  const email = cleanString(data.email);
  const phone = cleanString(data.phone);
  const businessAddress = cleanString(data.businessAddress);
  const businessType = cleanString(data.businessType);
  const businessLink = cleanString(data.businessLink, 500);
  const notes = cleanString(data.notes, 1200);
  const source = parseSource(cleanString(data.source, 40));

  if (!businessName || !email || !phone || !isBusinessType(businessType)) {
    return {
      ok: false,
      error: "Business name, email, phone, and business type are required.",
    };
  }

  return {
    ok: true,
    value: {
      businessName,
      email,
      phone,
      businessAddress,
      businessType,
      businessLink,
      notes,
      source,
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
npx tsx --test src/lib/marketing-lead.test.ts
```

Expected: PASS with all `marketing-lead` tests passing.

- [ ] **Step 5: Commit**

Only commit if the user has explicitly asked for commits in the implementation session. If committing, use:

```bash
git add src/lib/marketing-lead.ts src/lib/marketing-lead.test.ts
git commit -m "$(cat <<'EOF'
Add marketing lead validation helper.

EOF
)"
```

---

### Task 2: Extend The Existing Marketing Lead API

**Files:**
- Modify: `src/app/api/marketing-leads/route.ts`
- Test: `src/lib/marketing-lead.test.ts`

- [ ] **Step 1: Replace inline validation with the helper**

Modify imports and remove the local `BUSINESS_TYPES`, `cleanString`, `escapeHtml`, and `isBusinessType` helpers from `src/app/api/marketing-leads/route.ts`.

Use this import block:

```ts
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { checkRateLimit, getClientIp, hashIp } from "@/lib/api-rate-limit";
import { escapeHtml, parseMarketingLead } from "@/lib/marketing-lead";
```

Replace the parsing/required-field section with:

```ts
  const parsed = parseMarketingLead(body);

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const {
    businessName,
    email,
    phone,
    businessAddress,
    businessType,
    businessLink,
    notes,
    source,
  } = parsed.value;
```

- [ ] **Step 2: Include `/demo` fields in logging**

Replace the existing `console.log` payload inside the `if (!resend || !ADMIN_EMAIL)` block with:

```ts
    console.log("Skipping marketing lead email — RESEND_API_KEY or ADMIN_EMAIL not set", {
      businessName,
      email,
      phone,
      businessAddress,
      businessType,
      businessLink,
      notes,
      source,
    });
```

- [ ] **Step 3: Include `/demo` fields in the email**

Add safe values after the existing safe constants:

```ts
  const safeBusinessLink = businessLink ? escapeHtml(businessLink) : "";
  const safeNotes = notes ? escapeHtml(notes) : "";
  const safeSource = escapeHtml(source);
```

Change the subject to:

```ts
    subject: source === "demo" ? `New demo request: ${businessName}` : `New site request: ${businessName}`,
```

Add these rows after the business type row in the email table:

```ts
            <tr>
              <td style="padding: 8px 0; width: 132px; color: #6b7280; font-size: 14px;">Source</td>
              <td style="padding: 8px 0; color: #111827; font-weight: 700;">${safeSource}</td>
            </tr>
```

Add these optional blocks after the address block:

```ts
            ${safeBusinessLink ? `
              <tr>
                <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Link</td>
                <td style="padding: 8px 0;"><a href="${safeBusinessLink}" style="color: #db2777;">${safeBusinessLink}</a></td>
              </tr>
            ` : ""}
            ${safeNotes ? `
              <tr>
                <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Notes</td>
                <td style="padding: 8px 0; color: #111827;">${safeNotes}</td>
              </tr>
            ` : ""}
```

- [ ] **Step 4: Verify validation still passes**

Run:

```bash
npx tsx --test src/lib/marketing-lead.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run static checks**

Run:

```bash
npm run lint
```

Expected: PASS or the same pre-existing lint state as before implementation. Fix any new issues in files touched by this task.

- [ ] **Step 6: Commit**

Only commit if the user has explicitly asked for commits in the implementation session. If committing, use:

```bash
git add src/app/api/marketing-leads/route.ts src/lib/marketing-lead.ts src/lib/marketing-lead.test.ts
git commit -m "$(cat <<'EOF'
Support demo leads in marketing lead API.

EOF
)"
```

---

### Task 3: Build The `/demo` Lead Form

**Files:**
- Create: `src/app/(marketing)/demo/_components/DemoLeadForm.tsx`
- Uses: `src/lib/marketing-lead.ts`

- [ ] **Step 1: Create the client form component**

Create `src/app/(marketing)/demo/_components/DemoLeadForm.tsx`:

```tsx
"use client";

import { FormEvent, useState } from "react";
import { BUSINESS_TYPES } from "@/lib/marketing-lead";
import { Button } from "@/components/ui/button";

type FormState = "idle" | "submitting" | "success" | "error";

export function DemoLeadForm() {
  const [state, setState] = useState<FormState>("idle");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setError("");

    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      source: "demo",
      businessName: String(formData.get("businessName") ?? ""),
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      businessType: String(formData.get("businessType") ?? ""),
      businessLink: String(formData.get("businessLink") ?? ""),
      notes: String(formData.get("notes") ?? ""),
    };

    try {
      const response = await fetch("/api/marketing-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || "Could not send request.");
      }

      form.reset();
      setState("success");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Could not send request.");
    }
  }

  return (
    <section id="request-yours" className="bg-[#100b0b] px-6 py-20 text-pop-cream">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-pop-pink">
            Request yours
          </p>
          <h2 className="mt-4 font-serif text-4xl font-semibold leading-none md:text-5xl">
            Like one of these? I can build your preview next.
          </h2>
          <p className="mt-5 max-w-md text-sm leading-6 text-pop-cream/70">
            Send the basics. I will review your business and follow up with the best way to turn your services, photos, and booking flow into a polished site.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-[2rem] border border-pop-cream/15 bg-pop-cream p-5 text-warm-deep shadow-2xl md:p-7"
        >
          <div className="grid gap-4">
            <DemoField label="Business name" name="businessName" autoComplete="organization" required />
            <div className="grid gap-4 sm:grid-cols-2">
              <DemoField label="Email" name="email" type="email" autoComplete="email" required />
              <DemoField label="Phone number" name="phone" type="tel" autoComplete="tel" required />
            </div>
            <label className="grid gap-1.5">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-warm-eyebrow">
                Business type
              </span>
              <select
                name="businessType"
                required
                defaultValue=""
                className="h-12 rounded-xl border border-warm-cream1 bg-white px-4 text-sm font-semibold text-warm-text outline-none ring-pop-pink/25 transition focus:border-pop-pink focus:ring-4"
              >
                <option value="" disabled>
                  Choose one
                </option>
                {BUSINESS_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <DemoField
              label="Instagram, website, or booking link"
              name="businessLink"
              type="url"
              autoComplete="url"
            />
            <label className="grid gap-1.5">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-warm-eyebrow">
                Notes
              </span>
              <textarea
                name="notes"
                rows={4}
                maxLength={1200}
                className="rounded-xl border border-warm-cream1 bg-white px-4 py-3 text-sm font-medium text-warm-text outline-none ring-pop-pink/25 transition placeholder:text-warm-textMuted/50 focus:border-pop-pink focus:ring-4"
                placeholder="Tell me what you liked, what you sell, or what booking flow you use."
              />
            </label>
          </div>

          <Button
            type="submit"
            disabled={state === "submitting"}
            className="mt-6 w-full rounded-full bg-pop-pink py-6 text-base font-extrabold text-pop-cream hover:bg-pop-pink/90 disabled:opacity-70"
          >
            {state === "submitting" ? "Sending..." : "Request my preview"}
          </Button>

          {state === "success" && (
            <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
              Got it. I will review your details and follow up.
            </p>
          )}
          {state === "error" && (
            <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
              {error}
            </p>
          )}
        </form>
      </div>
    </section>
  );
}

function DemoField({
  label,
  name,
  type = "text",
  autoComplete,
  required = false,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-black uppercase tracking-[0.16em] text-warm-eyebrow">
        {label}
      </span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        className="h-12 rounded-xl border border-warm-cream1 bg-white px-4 text-sm font-semibold text-warm-text outline-none ring-pop-pink/25 transition placeholder:text-warm-textMuted/50 focus:border-pop-pink focus:ring-4"
      />
    </label>
  );
}
```

- [ ] **Step 2: Run static checks**

Run:

```bash
npm run lint
```

Expected: PASS or only pre-existing issues. Fix new issues in `DemoLeadForm.tsx`.

- [ ] **Step 3: Commit**

Only commit if the user has explicitly asked for commits in the implementation session. If committing, use:

```bash
git add "src/app/(marketing)/demo/_components/DemoLeadForm.tsx"
git commit -m "$(cat <<'EOF'
Add demo lead form.

EOF
)"
```

---

### Task 4: Build The `/demo` Portfolio Reel Page

**Files:**
- Create: `src/app/(marketing)/demo/_components/DemoShowcase.tsx`
- Create: `src/app/(marketing)/demo/page.tsx`
- Uses media: `public/marketing/hero-defaults/nails.mp4`

- [ ] **Step 1: Create the showcase component**

Create `src/app/(marketing)/demo/_components/DemoShowcase.tsx`:

```tsx
import Link from "next/link";
import { MarketingBrandLogo } from "@/components/MarketingBrandLogo";
import { Button } from "@/components/ui/button";

const PORTFOLIO_CARDS = [
  {
    category: "Nails",
    title: "Polished service menus that feel premium on mobile.",
    accent: "bg-pop-pink",
    tone: "from-pink-500/35 to-rose-950",
    action: "Book a gel set",
  },
  {
    category: "Locs / hair",
    title: "Beautiful service pages for styles, maintenance, and add-ons.",
    accent: "bg-amber-400",
    tone: "from-amber-400/30 to-stone-950",
    action: "Choose retwist",
  },
  {
    category: "Lashes / brows",
    title: "Soft, high-trust booking flows for repeat beauty clients.",
    accent: "bg-fuchsia-300",
    tone: "from-fuchsia-300/30 to-neutral-950",
    action: "Reserve refill",
  },
  {
    category: "Barber / grooming",
    title: "Fast booking for cuts, fades, beard work, and packages.",
    accent: "bg-orange-400",
    tone: "from-orange-400/30 to-zinc-950",
    action: "Pick a time",
  },
  {
    category: "Spa / skincare",
    title: "Calm, editorial pages that make services easy to understand.",
    accent: "bg-emerald-300",
    tone: "from-emerald-300/30 to-slate-950",
    action: "View treatments",
  },
] as const;

export function DemoShowcase() {
  return (
    <>
      <section className="relative isolate overflow-hidden bg-[#100b0b] px-6 pb-16 pt-8 text-pop-cream md:pb-24">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(219,39,119,0.35),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(255,248,238,0.18),transparent_30%)]" />
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <MarketingBrandLogo
            href="/"
            heightClass="h-16"
            linkClassName="rounded-xl ring-offset-[#100b0b]"
          />
          <Button
            asChild
            className="rounded-full bg-pop-cream px-5 py-5 text-sm font-black text-warm-deep hover:bg-pop-cream/90"
          >
            <Link href="#request-yours">Request yours</Link>
          </Button>
        </div>

        <div className="mx-auto mt-12 grid max-w-6xl gap-10 lg:grid-cols-[0.88fr_1.12fr] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-pop-pink">
              Beauty portfolio reel
            </p>
            <h1 className="mt-5 font-serif text-5xl font-semibold leading-[0.9] tracking-[-0.05em] md:text-7xl">
              Beauty websites that make clients book.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-pop-cream/75 md:text-lg">
              Custom sites, booking, and owner tools for beauty businesses that need to look polished the second a client opens the link.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                asChild
                size="lg"
                className="rounded-full bg-pop-pink px-7 py-6 text-sm font-black text-pop-cream hover:bg-pop-pink/90"
              >
                <Link href="#request-yours">Like this? Request yours</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="rounded-full border-pop-cream/35 bg-transparent px-7 py-6 text-sm font-black text-pop-cream hover:bg-pop-cream/10"
              >
                <Link href="#examples">See examples</Link>
              </Button>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-5 rounded-[2.5rem] bg-pop-pink/20 blur-3xl" />
            <div className="relative overflow-hidden rounded-[2.25rem] border border-pop-cream/15 bg-black shadow-2xl">
              <video
                className="aspect-[4/5] w-full object-cover opacity-90 md:aspect-[5/4]"
                src="/marketing/hero-defaults/nails.mp4"
                autoPlay
                muted
                loop
                playsInline
                aria-label="Looping beauty website and booking demo reel"
              />
              <div className="absolute inset-x-4 bottom-4 rounded-[1.5rem] border border-white/15 bg-black/65 p-4 backdrop-blur">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-pop-cream/65">
                  Customer view first
                </p>
                <p className="mt-2 text-2xl font-black leading-none">
                  Site → services → booking → owner dashboard
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="examples" className="bg-pop-cream px-6 py-20 text-warm-deep">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-pop-pink">
              Portfolio examples
            </p>
            <h2 className="mt-4 font-serif text-4xl font-semibold leading-none md:text-5xl">
              A different look for every beauty brand.
            </h2>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {PORTFOLIO_CARDS.map((card, index) => (
              <article
                key={card.category}
                className={`group overflow-hidden rounded-[2rem] bg-gradient-to-br ${card.tone} p-4 text-pop-cream shadow-xl ${
                  index === 0 ? "md:col-span-2" : ""
                }`}
              >
                <div className="rounded-[1.5rem] border border-white/15 bg-black/30 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-pop-cream/65">
                      {card.category}
                    </p>
                    <span className={`h-3 w-3 rounded-full ${card.accent}`} />
                  </div>
                  <div className="mt-8 rounded-[1.25rem] bg-pop-cream p-3 text-warm-deep">
                    <div className={`h-28 rounded-2xl ${card.accent}`} />
                    <div className="mt-4 h-3 w-3/4 rounded-full bg-warm-deep/20" />
                    <div className="mt-2 h-3 w-1/2 rounded-full bg-warm-deep/15" />
                    <div className="mt-5 inline-flex rounded-full bg-warm-deep px-4 py-2 text-xs font-black text-pop-cream">
                      {card.action}
                    </div>
                  </div>
                  <h3 className="mt-5 text-2xl font-black leading-tight">{card.title}</h3>
                  <p className="mt-4 inline-flex rounded-full border border-white/20 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-pop-cream/75">
                    Owner dashboard included
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#160f0e] px-6 py-20 text-pop-cream">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-pop-pink">
              How it works
            </p>
            <h2 className="mt-4 font-serif text-4xl font-semibold leading-none md:text-5xl">
              Pretty on the outside. Useful behind the scenes.
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {["Clients land on a beautiful site", "They choose a service and book", "You manage bookings and leads"].map((item, index) => (
              <div key={item} className="rounded-[1.5rem] border border-pop-cream/15 bg-pop-cream/5 p-5">
                <p className="text-sm font-black text-pop-pink">0{index + 1}</p>
                <p className="mt-8 text-xl font-black leading-tight">{item}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto mt-12 max-w-6xl rounded-[2rem] border border-pop-cream/15 bg-pop-cream p-5 text-warm-deep md:p-7">
          <div className="grid gap-4 md:grid-cols-4">
            {[
              ["28", "visits this week"],
              ["7", "new leads"],
              ["4", "bookings today"],
              ["12", "services managed"],
            ].map(([value, label]) => (
              <div key={label} className="rounded-2xl border border-warm-cream1 bg-white p-5">
                <p className="text-4xl font-black">{value}</p>
                <p className="mt-2 text-xs font-bold uppercase tracking-[0.14em] text-warm-textMuted">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
```

- [ ] **Step 2: Create the route page**

Create `src/app/(marketing)/demo/page.tsx`:

```tsx
import type { Metadata } from "next";
import { DemoLeadForm } from "./_components/DemoLeadForm";
import { DemoShowcase } from "./_components/DemoShowcase";
import { Footer } from "../_components/Footer";

export const metadata: Metadata = {
  title: "Demo — SiteForOwners Beauty Website Portfolio",
  description:
    "A beauty-focused portfolio reel of customer-facing websites, booking flows, and owner tools from SiteForOwners.",
  alternates: {
    canonical: "/demo",
  },
  openGraph: {
    title: "SiteForOwners Demo",
    description:
      "See beauty websites, booking flows, and owner dashboards built for appointment-based businesses.",
    url: "/demo",
  },
};

export default function DemoPage() {
  return (
    <main className="min-h-screen bg-[#100b0b]">
      <DemoShowcase />
      <DemoLeadForm />
      <Footer />
    </main>
  );
}
```

- [ ] **Step 3: Run static checks**

Run:

```bash
npm run lint
```

Expected: PASS or only pre-existing issues. Fix new lint issues in the new `/demo` files.

- [ ] **Step 4: Run a production build**

Run:

```bash
npm run build
```

Expected: PASS. If the video asset path is wrong, the build will still pass, so also manually check the page in Task 5.

- [ ] **Step 5: Commit**

Only commit if the user has explicitly asked for commits in the implementation session. If committing, use:

```bash
git add "src/app/(marketing)/demo/page.tsx" "src/app/(marketing)/demo/_components/DemoShowcase.tsx" "src/app/(marketing)/demo/_components/DemoLeadForm.tsx"
git commit -m "$(cat <<'EOF'
Add demo portfolio reel page.

EOF
)"
```

---

### Task 5: Verify The QR Landing Experience

**Files:**
- Verify: `src/app/(marketing)/demo/page.tsx`
- Verify: `src/app/(marketing)/demo/_components/DemoShowcase.tsx`
- Verify: `src/app/(marketing)/demo/_components/DemoLeadForm.tsx`
- Modify: `.env.example` only if email variable documentation is missing or unclear.

- [ ] **Step 1: Start the app locally**

Run:

```bash
npm run dev
```

Expected: Next dev server starts and prints a local URL, usually `http://localhost:3000`.

- [ ] **Step 2: Open `/demo`**

Open:

```text
http://localhost:3000/demo
```

Expected:

- The page renders without route errors.
- The hero appears above the fold on mobile width.
- The nails video displays or the browser shows a valid video frame.
- The CTA scrolls to `#request-yours`.
- The portfolio section shows five beauty categories.
- The owner dashboard proof appears after the journey strip.

- [ ] **Step 3: Test reduced-motion fallback manually**

In the browser devtools rendering settings, enable reduced motion. Reload `/demo`.

Expected:

- The page remains readable.
- If the first implementation still autoplays video under reduced motion, add a follow-up component split: move the hero video into a client component that uses `window.matchMedia("(prefers-reduced-motion: reduce)")` and renders a non-autoplay poster frame when reduced motion is enabled.

- [ ] **Step 4: Test the form with missing required fields**

Submit the form empty.

Expected:

- Browser native validation blocks submission for required fields.
- No request is sent until required fields are filled.

- [ ] **Step 5: Test the form with valid fields**

Fill:

```text
Business name: Velvet Lash Studio
Email: owner@example.com
Phone number: 555-444-3333
Business type: Lashes / brows
Instagram, website, or booking link: https://instagram.com/velvetlash
Notes: I scanned your card and like the portfolio reel.
```

Expected:

- In local development without `RESEND_API_KEY` or `ADMIN_EMAIL`, the API returns `{ ok: true }`.
- The form resets.
- The success message appears.
- The terminal log includes `source: "demo"` and the optional link/notes.

- [ ] **Step 6: Run final checks**

Run:

```bash
npx tsx --test src/lib/marketing-lead.test.ts
npm run lint
npm run build
```

Expected:

- Marketing lead tests pass.
- Lint passes or only reports known pre-existing issues.
- Build passes.

- [ ] **Step 7: Commit**

Only commit if the user has explicitly asked for commits in the implementation session. If committing, use:

```bash
git add .
git commit -m "$(cat <<'EOF'
Verify demo QR landing experience.

EOF
)"
```

---

## Self-Review Notes

- Spec coverage: The plan implements the `/demo` route, video-led luxury hero, five beauty portfolio cards, compact customer journey, owner dashboard proof, and lead form CTA.
- Testing: Lead parsing is covered with `node:test`; route/page behavior is verified with lint, build, and manual QR-flow checks.
- Scope: The first version avoids true live streaming, embedded tenants, account creation, payment, and homepage redesign.
- Type consistency: The form payload, validation helper, and API route all use `businessName`, `email`, `phone`, `businessType`, `businessLink`, `notes`, and `source`.
