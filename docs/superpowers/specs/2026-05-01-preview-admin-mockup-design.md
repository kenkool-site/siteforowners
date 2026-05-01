# Preview Admin Mockup

**Date:** 2026-05-01
**Status:** Approved (design)
**Surface:** New route tree at `/preview/[slug]/admin/*`

## Goal

Let a prospect (or the founder showing one off) click into a working-feeling owner dashboard from any preview, no auth, with business-aware fake data. Same fidelity bar as the booking flow: tabs work, numbers feel realistic, but nothing persists.

## Non-goals

- Editing anything in the mock admin (no service edits, no settings save).
- PIN entry / forgot-pin / pin-reset (auth is bypassed entirely).
- Billing / orders / updates / pin-reset / settings pages — out of scope for v1. Top 4 only: dashboard, schedule, leads, services.
- Real notifications, real LeadsBadge counts, real activity feed entries pulled from DB.

## Pages built (4)

| Path | What it shows |
|---|---|
| `/preview/[slug]/admin` | Greeting + 4 stat cards (Bookings today, Bookings next 7 days, Unread leads, optionally New orders) + visit chart + Recent activity |
| `/preview/[slug]/admin/schedule` | Today + upcoming bookings list, tied to the preview's actual `services` |
| `/preview/[slug]/admin/leads` | 3-5 fake contact-form leads, business-flavored messages |
| `/preview/[slug]/admin/services` | Read-only catalog of `preview.services` — same component as the live admin where possible |

## Architecture

### New files

- `src/app/(marketing)/preview/[slug]/admin/layout.tsx` — wraps children in a `PreviewAdminShell` + a top "Demo preview" banner. No auth check. Loads preview row, builds a synthetic `ShellTenant`-shaped object, threads `pathPrefix={`/preview/${slug}/admin`}` through.
- `src/app/(marketing)/preview/[slug]/admin/page.tsx` — dashboard
- `src/app/(marketing)/preview/[slug]/admin/schedule/page.tsx` — schedule
- `src/app/(marketing)/preview/[slug]/admin/leads/page.tsx` — leads
- `src/app/(marketing)/preview/[slug]/admin/services/page.tsx` — services
- `src/app/(marketing)/preview/[slug]/admin/_components/PreviewAdminShell.tsx` — clones the live `AdminShell` minus PIN/sign-out, with prefixed hrefs.
- `src/lib/preview-admin-mock.ts` — pure synthetic-data builder (rollups, visits, activity, bookings, leads), seeded by slug for stability.

### Why a parallel shell instead of `pathPrefix` on `AdminShell`

The live `AdminShell` has hardcoded `/admin/...` hrefs that work via Next middleware rewrites on the tenant subdomain. Threading a `pathPrefix` everywhere would mean touching every hardcoded path in the shell + every `<Link>` consumer. A parallel shell keeps the live admin's hot path untouched and isolates the preview's risk.

The preview shell omits:
- `SignOutButton`
- `LeadsBadge` (replaced with a static "2 unread" pill that links to `/preview/[slug]/admin/leads`)
- "View site ↗" → instead, "← Back to preview" linking to `/preview/[slug]`

Everything else (sidebar, mobile bottom nav, top bar) is identical visual treatment.

### Mock data — `preview-admin-mock.ts`

A single pure module exporting:

```ts
buildMockAdminData(preview: PreviewData): {
  rollups: { bookingsToday: number; bookingsNext7Days: number; unreadLeads: number; newOrders: number };
  visits: VisitorsStripStats;        // 14-day rolling, peaks weekend
  monthlyVisits: number;
  activity: RecentActivityEntry[];   // 5-7 entries, mixed bookings + leads
  schedule: BookingRow[];            // ~6-10 across today + next 5 days
  leads: LeadRow[];                  // 3-5 fakes
}
```

**Seeding:** `mulberry32(hashStr(preview.slug))` for a deterministic PRNG so the same preview always shows the same numbers (founder doesn't see numbers shift on reload).

**Business-aware:**
- Customer name pool: a fixed list of ~25 diverse first-name + last-initial combos ("Marie K.", "Aaliyah J.", "Jasmine R.", etc.). Drawn deterministically.
- Service mix: real entries from `preview.services` (sampled 1-2 per booking; if add-ons present, occasionally include one).
- Times: snapped to top-of-hour slots within typical owner working hours (10–19 weekdays, 10–17 Saturdays).
- Lead messages: 6 templated messages keyed loosely off `preview.business_type` (salon vs restaurant vs cleaning, etc.) — falls through to generic "Hi, I'm interested in services. Can you call me?" if type unknown.

**Reused components:** `StatCard`, `VisitorsStrip`, `RecentActivity`, `Greeting` — all already presentational, just receive mock props.

### Demo banner

A thin pinned strip at the top of `PreviewAdminShell` content:

> **Demo preview · sample data**     `← Back to your site`

Soft amber background (`bg-amber-50` text `text-amber-900`) so it reads as info, not a warning. The "Back to your site" right-aligns and links to `/preview/[slug]`.

## Entry point — visible button on PreviewClient

A new prominent button in the top bar of `PreviewClient`, sitting between the share button and the locale toggle (left of those, right of the SiteForOwners brand). Same amber-600 fill as "Start Free Setup" so it reads as a primary action.

Label: **`📊 See Your Dashboard`**

Mobile: shrinks to icon-only (`📊`) to save space.

The bottom CTA bar stays as-is — that's still the conversion funnel. The dashboard button is exploration / wow-factor.

## Out-of-scope but flagged

- **`/admin` rewriting on tenant subdomains** doesn't touch this — middleware only rewrites the live admin, and the preview admin lives under `/preview/[slug]/admin` which middleware leaves alone.
- **Theme:** uses `loadAdminTheme(slug)` so the admin colors match the preview's brand. If theme can't load (no `admin_themes` row), falls back to default amber.

## Testing

- Static: `tsc --noEmit` and `next lint` clean on all new files.
- Manual smoke:
  1. Visit any `/preview/[slug]` — confirm "📊 See Your Dashboard" appears in the top bar.
  2. Click it — lands on `/preview/[slug]/admin` with greeting using the business name, 3-4 stat cards with non-zero numbers, fake activity feed.
  3. Click Schedule, Leads, Services tabs — each renders without 404, with seeded data.
  4. Reload — numbers stay the same (deterministic seed).
  5. Click "Back to your site" in the demo banner — returns to `/preview/[slug]`.
  6. Visit `/site/[real-tenant-slug]/admin` (live) — unchanged, still PIN-gated.
  7. Mobile (≤390px): bottom nav works, top bar truncates correctly.

## Risks

- **Reusing presentational components from `_components/`** that haven't been audited for SSR-cleanliness in a public route. Mitigation: each one is read on first build; if any pull live data via internal hooks, swap for a parallel mock-aware version.
- **Theme module reads from DB.** If the preview slug has no theme row, fall back to a hardcoded default rather than 500'ing.
