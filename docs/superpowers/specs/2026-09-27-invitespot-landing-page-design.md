# InviteSpot Landing Page & Lead Capture Design

**Goal:** Replace the invitespot.app apex placeholder with a real landing
page that explains InviteSpot as a done-for-you service, personalizes
itself for guests referred from a specific invitation, and captures leads
for the founder to follow up with by email or phone.

## Context

Today `invitespot.app` (bare apex) renders a two-line placeholder
(`src/app/invitespot/page.tsx`). The invitation footer's marketing CTA
("Hosting your own event? Create your invitation with InviteSpot") already
links there, so every guest who scrolls to the bottom of any InviteSpot
invitation is a real, if small, source of traffic.

The business model this page needs to represent is **not** self-serve
signup — it mirrors how the founder's other product (SiteForOwners) already
works: the founder builds each customer's page personally, based on details
collected up front, and follows up personally by email or phone. This
matches the existing `marketing_leads` / admin "Requests" pattern already
shipped for SiteForOwners' own lead funnel
(`supabase/migrations/030_create_marketing_leads.sql`,
`src/app/api/marketing-leads/route.ts`, `src/app/(admin)/requests/`) — this
design mirrors that pattern closely, with its own dedicated table rather
than reusing SiteForOwners' (different business line, different fields:
event type instead of business type, a phone number alongside email, guest
count, a referral source).

Earlier drafts of this design assumed every lead reaches the founder over
WhatsApp, since the shared mockup this was built from used it exclusively.
That assumption doesn't hold — it isn't safe to assume every prospective
customer uses WhatsApp, and the product's own guest-notification system
only ever sends email and SMS (confirmed by grep — `InvitationNotificationChannel
= "email" | "sms"` in `src/lib/invitations/types.ts`, no WhatsApp anywhere
in the codebase), so a landing page claiming WhatsApp reminders would be
advertising a capability that doesn't exist. Both the lead form's own
contact field and the "RSVPs people actually answer" feature copy are
corrected below to email/phone throughout.

## Decisions

- **Visual direction:** Cream background, dark forest-green accent
  (`#F4EEE4` / `#1F3A2E`-family), serif "InviteSpot" wordmark — confirmed
  via mockup comparison, closest to the guest-facing invitation pages
  guests already saw before landing here.
- **No invented pricing.** The three guest-count tiers show what's
  included, not a dollar figure — each tier links to the lead form instead
  of a `[PRICE]` placeholder. Same treatment for turnaround time and data
  retention: stated as "confirmed when we reach out" rather than a specific
  number of days/months, since none has been committed to yet. This can be
  swapped for real numbers later by editing the page copy directly — no
  structural change needed.
- **New dedicated `invitespot_leads` table + admin tab**, not a reuse of
  `marketing_leads` — different business line, different fields, kept
  separate on purpose (matches this codebase's own precedent of not mixing
  the two admin surfaces — see `feedback_admin_two_surfaces` project
  history).
- **Referral personalization ships now**, not deferred — the invitation
  footer's CTA link carries `?from={slug}`, and the landing page looks up
  just that event's honoree names (nothing else) to render "You came from
  {names}'s page."
- **No automated outreach.** Submitting the form persists a lead and
  best-effort emails the founder (identical pattern to `marketing_leads`) —
  the founder manually emails or calls/texts themselves, matching the
  existing "manual follow-up, no automation" precedent for the sibling
  feature.
- **Contact field is email and/or phone, not WhatsApp-only.** The lead
  chooses how they'd rather be reached — at least one of the two is
  required, neither is mandatory on its own.

## Architecture

### 1. Page content and structure

`src/app/invitespot/page.tsx` becomes a real page with these sections, top
to bottom, in the confirmed cream/forest-green direction:

1. **Header** — "InviteSpot" wordmark, "Get started" nav link (anchors to
   the form at the bottom).
2. **Referral banner** (conditional — only when a valid `?from={slug}` is
   present and resolves to a live, published event): "♡ You came from
   **{honoreeNames}**'s page."
3. **Hero** — H1 "You send the details. We build the page." Subhead:
   "Invitations, RSVPs, and guest photos — for weddings, birthdays, naming
   ceremonies, burials, and anniversaries. Nothing to design yourself."
   Primary CTA "Tell us about your event" (anchors to the form). Microcopy:
   "We'll reply by email or phone with examples and a quote."
4. **What you get** (3 cards): "Your own web address" / "RSVPs people
   actually answer" (mentions the product's real reminder channels — text
   and email, not just one the guest might miss) / "Every guest's photos,
   in one place" (mentions the printed-QR-code-on-tables workflow already
   built for the Memories feature).
5. **How it works** (3 numbered steps): "Send us the details" (a quick
   message is enough) / "We build it and send you the link" (you never
   touch an editor) / "Share it, and we do the chasing" (QR cards +
   reminders before and after the day).
6. **What it costs** (3 tiers by guest count, no dollar figures — each
   tier's price slot is a "Get a quote" link to the form): "Up to 150
   guests" (one event) / "150–400 guests" (two events — traditional and
   white wedding) / "400 guests and up" (managed guest messaging included).
   One line beneath: "One payment, no subscription — every plan includes
   your page and photo gallery. We'll confirm exact pricing and how long
   everything stays up when we reach out."
7. **Lead capture form** (dark forest-green section, `id="event-form"` for
   the anchor links above). Heading "Tell us about your event", subhead "A
   few questions. We reply by email or phone with a real example and a
   quote." Fields: **Your name**; **Email** and **Phone number** (two
   separate fields — at least one required, neither mandatory alone, since
   the lead picks how they'd rather be reached); **What are you planning?**
   (single-select chips: Birthday, Wedding, Naming, Burial, Anniversary,
   Something else); **Roughly when** (free text, not a date picker — most
   leads this early don't have a locked date) and **Guests** (optional
   number) side by side; a **Send** button; reassurance line "We reply
   once. No list, no newsletter." See section 3 below for the backing table,
   API, and validation.
8. **Footer** — "InviteSpot" / "invitespot.app".

All copy lives in `messages/en.json` / `messages/es.json` under a new
`invitespot` namespace, matching this codebase's i18n convention
everywhere else in the invitation product.

### 2. Referral personalization

`InvitationFooter.tsx` gains a required `slug: string` prop (its one
caller, `PublicInvitation.tsx:376`, already has `event.slug` in scope). Its
marketing-CTA `href` becomes
`` `https://www.invitespot.app/?from=${encodeURIComponent(slug)}` `` instead
of the bare apex URL.

A new function in `src/lib/invitations/public-access.ts`:

```ts
export async function getInvitationReferralDisplayName(slug: string): Promise<string | null> {
  const invitation = await getPublicInvitationBySlug(slug);
  if (!invitation) return null;
  const state = getEffectiveEventState(invitation.event, new Date());
  // Only a state a stranger could already see by visiting the invitation
  // directly — never leak a draft's existence or name via a guessed slug.
  if (state !== "published" && state !== "rsvp_closed") return null;
  return invitation.event.honoreeNames;
}
```

`invitation.event.honoreeNames` is already fully public on the invitation
page itself — this exposes nothing a visitor couldn't already see by
visiting `{slug}`'s own invitation directly, it just saves them the trip.

`src/app/invitespot/page.tsx` reads `searchParams.from`, calls this
function when present, and renders the banner only when it resolves to a
non-null name. Any other value (missing, malformed, unknown slug, non-public
state) — no banner, no error, page renders normally.

### 3. Lead capture: table, API, admin tab

**Migration** `supabase/migrations/064_invitespot_leads.sql` (064 is the
next available number as of this spec): `invitespot_leads`, mirroring
`marketing_leads`' shape and RLS posture:

```sql
CREATE TABLE IF NOT EXISTS invitespot_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  email            text,            -- at least one of email/phone required — enforced in parseInvitespotLead, not a DB constraint (matches this codebase's existing validation-at-the-app-layer convention)
  phone            text,
  event_type       text NOT NULL,   -- 'birthday' | 'wedding' | 'naming' | 'burial' | 'anniversary' | 'other'
  rough_date       text,            -- free text ("March", "next spring") — guests rarely have an exact date yet
  guest_count      integer,
  referral_slug    text,            -- the inviting event's slug, when the visitor arrived via ?from=
  status           text NOT NULL DEFAULT 'new',   -- 'new' | 'contacted' | 'archived'
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invitespot_leads_created_at
  ON invitespot_leads (created_at DESC);

-- No public policies: all access is via the service-role admin client,
-- matching marketing_leads.
ALTER TABLE invitespot_leads ENABLE ROW LEVEL SECURITY;
```

**Validation lib** `src/lib/invitespot-lead.ts` — same shape as
`src/lib/marketing-lead.ts`: an `EVENT_TYPES` const array (`birthday`,
`wedding`, `naming`, `burial`, `anniversary`, `other`), a `parseInvitespotLead`
function, and an `InvitespotLeadRow` type for the admin table.
`parseInvitespotLead` rejects the submission (a validation error, same as a
missing name) when both `email` and `phone` are empty — the one piece of
cross-field validation this form needs beyond per-field checks.

**API route** `src/app/api/invitespot-leads/route.ts` — mirrors
`src/app/api/marketing-leads/route.ts` exactly: same rate-limit helper
(`checkRateLimit`, `getClientIp`, `hashIp`), insert into `invitespot_leads`
first (never lose the lead if email fails), then best-effort Resend email to
`ADMIN_EMAIL` with the lead's details, wrapped in try/catch that never fails
the request.

**Admin tab**: `src/app/(admin)/invitespot-leads/page.tsx`, mirroring
`src/app/(admin)/requests/page.tsx`'s structure (`StatCards` + a table
component listing non-archived leads, newest first, capped at 200). Add
`/invitespot-leads` to:
- `ADMIN_ROUTES` in `src/middleware.ts` (founder-session gating — same
  mechanism already protecting `/requests`).
- `FOUNDER_ADMIN_LINKS` in `src/lib/admin-navigation.ts`, labeled
  "InviteSpot Leads".

## Testing

- `parseInvitespotLead` — pure function, unit-tested directly (valid input,
  missing required fields, invalid `event_type`, string length/trimming) —
  same test shape as the existing `marketing-lead.ts` coverage.
- `getInvitationReferralDisplayName` — unit-tested against fixture
  invitations in each lifecycle state (published, rsvp_closed, draft,
  expired, offline, not-found), asserting the state gate.
- The API route and admin page follow this codebase's established
  structural-test convention for Supabase-dependent code with no
  credentials in this test environment (same as every other route touched
  this migration) — same-origin/rate-limit/validation branches tested where
  they don't require a live database; DB-dependent behavior tested
  structurally.
- The landing page's own render is verified via `npm run build` (matching
  how the placeholder page itself was verified) plus a render test for the
  referral-banner conditional logic, given it's the one piece of real
  business logic on an otherwise-static page.

## Out of scope

- Real pricing figures, turnaround time, and retention period — the page
  ships with honest "we'll confirm when we reach out" language; swapping in
  real numbers later is a copy-only change.
- Any automated outreach integration (auto-reply emails/texts, templated
  follow-ups) — purely manual follow-up by the founder, matching the
  sibling feature's own scope.
- A public detail/edit view for `invitespot_leads` beyond the founder admin
  tab — no self-serve access for leads to see their own submission status.
- Styling the rest of the InviteSpot brand (favicon, OG image asset,
  robots.txt) beyond what the canonical/OpenGraph metadata fix already
  covered for the placeholder page.
