# Marketing-lead Requests v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a clickable lead-detail modal in the admin Requests tab, highlight optional fields on the `/demo` form, and split the single link field into separate Instagram + Booking URL inputs (with matching DB columns).

**Architecture:** Rename `business_link`→`booking_url` and add `instagram_url` (migration 031). Thread the rename through the parser, API insert, email, prefill-URL helper, and wizard. Split the admin Requests table into a client `RequestsTable` (clickable rows) + `RequestDetailModal`, reusing the existing `RequestActions`.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Supabase service-role, Tailwind, node:test + tsx.

**Spec:** design approved inline (this session). Builds on `2026-06-06-marketing-lead-requests.md`.

---

## Task 1: Migration 031 (rename + add column)

**Files:** Create `supabase/migrations/031_marketing_leads_split_links.sql`

```sql
-- Split the single link into a dedicated booking URL + an Instagram handle/URL.
ALTER TABLE marketing_leads RENAME COLUMN business_link TO booking_url;
ALTER TABLE marketing_leads ADD COLUMN IF NOT EXISTS instagram_url text;
```

- [ ] Create the file, confirm 031 is the next number, commit `feat: split marketing_leads link into booking_url + instagram_url`.

---

## Task 2: Backend lib + tests (`src/lib/marketing-lead.ts`, `.test.ts`)

Changes:
- `MarketingLead` type: remove `businessLink`, add `bookingUrl: string` and `instagramUrl: string`.
- `parseMarketingLead`: parse `bookingUrl` and `instagramUrl` (both optional, `cleanString(..., 500)`); keep everything else. (No new required fields.)
- Add exported `type MarketingLeadStatus = "new" | "contacted" | "archived";`
- Add exported `interface MarketingLeadRow` with: id, business_name, email, phone, business_address (string|null), business_type, booking_url (string|null), instagram_url (string|null), notes (string|null), source, status (MarketingLeadStatus), preview_group_id (string|null), created_at.
- `buildWizardPrefillUrl`: change param shape to read `booking_url` and `instagram_url`; set `link` from `booking_url`, set new `instagram` param from `instagram_url`. (Keep `lead`,`name`,`type`,`phone`,`address`,`desc`.)
- Update tests: rename businessLink assertions; assert booking_url→`link`, instagram_url→`instagram`; parser accepts bookingUrl+instagramUrl.

- [ ] TDD where practical (helper/parser tests first), `npx tsx --test src/lib/marketing-lead.test.ts`, `npx tsc --noEmit`, `npm run lint`, commit `feat: booking_url + instagram_url in marketing-lead lib`.

---

## Task 3: API route (`src/app/api/marketing-leads/route.ts`)

- Destructure `bookingUrl, instagramUrl` from parsed value (instead of `businessLink`).
- Insert `booking_url: bookingUrl || null, instagram_url: instagramUrl || null` (replace the `business_link` insert key).
- Email: replace the single "Link" row with two conditional rows — "Instagram" (`safeInstagram`) and "Booking" (`safeBooking`), each `escapeHtml`'d.
- Keep insert-before-email + best-effort behavior.

- [ ] `npx tsc --noEmit`, `npm run lint`, commit `feat: persist split booking/instagram links`.

---

## Task 4: `/demo` form (`src/app/(marketing)/demo/_components/DemoLeadForm.tsx`)

- Replace the single `businessLink` DemoField with two: `instagramUrl` (label "Instagram (optional)", autoComplete off/url) and `bookingUrl` (label "Booking link (optional)"). Update `payload` to send `instagramUrl` and `bookingUrl` (drop `businessLink`).
- Append "(optional)" to the Business address and Notes labels (Notes is a `<label>` with a span — update its text). Required fields unchanged.

- [ ] `npx tsc --noEmit`, `npm run lint`, commit `feat: split link + mark optional fields on demo form`.

---

## Task 5: Wizard prefill (`src/app/(marketing)/preview/page.tsx`)

- In the prefill-from-lead effect, also read `const insta = searchParams.get("instagram");` and `if (insta) setInstagramUrl(insta);`. Add `insta` to the all-absent early-return guard. (Booking already flows via `link`→`setImportUrl`.)

- [ ] `npx tsc --noEmit`, `npm run lint`, commit `feat: prefill instagram from lead deep link`.

---

## Task 6: Admin Requests — clickable rows + detail modal

**Files:**
- Modify `src/app/(admin)/requests/page.tsx` — keep data fetch + stat cards; replace the inline `<table>` with `<RequestsTable leads={leads} />`. Use the shared `MarketingLeadRow` type for the query result.
- Create `src/app/(admin)/requests/RequestsTable.tsx` (`"use client"`) — renders the table; each `<tr>` has `onClick` to set `selectedLead`; the contact anchors and the `RequestActions` cell are wrapped so they `stopPropagation`. Computes `buildWizardPrefillUrl(lead)` per row. Renders `<RequestDetailModal lead={selectedLead} onClose={() => setSelectedLead(null)} />` when set. Keeps the same columns/styling as today (Business, Contact, Link→show booking/instagram, Notes, When, actions) and the `timeAgo` helper.
- Create `src/app/(admin)/requests/RequestDetailModal.tsx` (`"use client"`) — fixed-overlay dialog (click backdrop / Esc / close button to dismiss) showing all fields: business name, type, source, status, email (mailto), phone (tel), address, Instagram (link), Booking URL (link), full notes, created date, and a "View preview" link if `preview_group_id`. Includes `<RequestActions ... />`.
- `RequestActions.tsx` unchanged (already a client component).

Notes:
- The "Link" column should show booking + instagram (whichever present) instead of the old single link.
- Modal accessibility: `role="dialog"`, `aria-modal`, Escape-to-close, focus the close button on open is a nice-to-have; backdrop click closes.

- [ ] `npx tsc --noEmit`, `npm run lint`, commit `feat: clickable lead rows with detail modal`.

---

## Task 7: Final verification

- [ ] `npx tsx --test src/lib/marketing-lead.test.ts` (green), `npx tsc --noEmit`, `npm run lint`, `npm run build` (all clean; `/requests` builds).
