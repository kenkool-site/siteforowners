# SiteForOwners — Project Instructions

**Domain:** siteforowners.com | **Repo:** siteforowners

## What This Is
Done-for-you website subscription SaaS ($65-70/mo) for small businesses.
Clients get a professional website + dashboard to view traffic, leads, bookings, and billing.
The founder builds/maintains everything. Clients never touch code.

**AI-powered onboarding:** Prospects fill in business info → Claude generates bilingual website copy → they see a personalized preview in 5 minutes — for free. This is the lead magnet, sales tool, and onboarding accelerator.

## Tech Stack
- **Framework:** Next.js 14 (App Router), TypeScript (strict), Tailwind CSS
- **Components:** shadcn/ui, Framer Motion for animations
- **Backend:** Supabase (PostgreSQL + Auth + RLS + Storage)
- **AI:** Claude API (Sonnet) for website copy generation — bilingual, tone-matched
- **Payments:** Stripe Billing (subscriptions + Customer Portal)
- **Analytics:** Plausible Analytics (per-client traffic via iframe)
- **Email:** Resend + React Email templates
- **i18n:** next-intl (English + Spanish)
- **Hosting:** Vercel (siteforowners.com), Cloudflare (DNS for client domains)
- **Domains:** Cloudflare Registrar (registered in client's name, managed by founder)
- **Booking:** Embed client's existing tool (Acuity/Booksy/Vagaro/Square) or Cal.com fallback

## Critical Rules (Non-Negotiable)
1. **Multi-tenancy via RLS** — every client-data table has `tenant_id`. Every query scoped. Never pass `tenant_id` from the client — derive from `auth.uid()` via `tenant_members`.
2. **Never expose Supabase service role key** — only used in `/admin` routes and server actions.
3. **Mobile-first** — all UI must work at 375px width. Design mobile first, enhance for desktop.
4. **Bilingual** — all client-facing strings go through `next-intl`. No hardcoded English text.
5. **Simplicity test** — "Could a 55-year-old Dominican salon owner figure this out without help?"
6. **TypeScript strict** — no `any`. Use generated Supabase types from `types/database.ts`.

## Project Structure
- `src/app/(marketing)/` — public landing page + AI preview wizard (no auth)
- `src/app/(marketing)/preview/` — onboarding wizard + rendered previews
- `src/app/(auth)/` — login, signup, forgot password
- `src/app/(dashboard)/` — client dashboard (auth required, RLS-scoped)
- `src/app/(admin)/` — founder-only admin panel (service role)
- `src/components/templates/` — reusable website template blocks (hero, services, gallery, contact, map)
- `src/components/wizard/` — onboarding wizard step components
- `src/lib/ai/` — Claude API integration for copy generation
- `src/lib/supabase/` — three clients: `client.ts` (browser), `server.ts` (server/cookies), `admin.ts` (service role)
- `supabase/migrations/` — numbered SQL migrations with RLS policies
- `messages/` — `en.json` and `es.json` for next-intl

## Database Conventions
- snake_case for all columns and tables
- UUID primary keys
- `created_at timestamptz DEFAULT now()` on every table
- `tenant_id uuid REFERENCES tenants(id)` on all client-data tables
- RLS policy on every table — no exceptions

## Component Conventions
- shadcn/ui as base — don't reinvent
- PascalCase filenames for components
- Server Components by default, `"use client"` only when needed
- Framer Motion for page transitions and micro-interactions

## Git Conventions
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`
- Branch per feature: `feat/salon-demo`, `feat/dashboard-shell`

## Key Data
- `brooklyn_hairstylists.csv` — 100 scraped Brooklyn leads (51 hot prospects)
- Prospects have: name, address, phone, rating, review_count, website_type, all_links
- Priority leads: 30+ businesses with 4.5+ stars, no website, have phone number
