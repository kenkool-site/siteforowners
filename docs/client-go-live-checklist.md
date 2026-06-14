# Client Go-Live & Local SEO Checklist

A repeatable, per-client routine for getting a SiteForOwners client **found on
Google** — website + Google Business Profile working together. Run it once per
client. Plain-language client outcomes are noted so you can explain the value.

**The two halves of local SEO (both required):**
- **Google Business Profile (GBP)** → the "Businesses"/map pack at the top of results. Powered by GBP, *not* the website.
- **Website (this app)** → organic blue-link results + reinforces the GBP. Powered by the LocalBusiness JSON-LD, landing pages, sitemap, canonical.

Neither replaces the other. The map-pack box needs GBP; the website makes the GBP stronger and wins the organic results below it.

---

## Phase 1 — While they're a prospect (preview, before payment)

Set these now so everything lights up the instant they subscribe. Safe to do
early: previews/demos are `noindex` with structured data suppressed, so nothing
leaks.

- [ ] **Set "Local SEO area"** in the admin Site Editor (`/clients/[tenantId]/edit` → Local SEO area), derived from their street address:
  - `3 Rutland Rd, Brooklyn, NY 11225` → **`Brooklyn, NY`**
  - `13400 Baltimore Ave, Laurel, MD 20707` → **`Laurel, MD`**
  - Format: `City, ST` (state abbreviation). This drives the `/l/{service}-{area}` landing pages, the sitemap, and the `addressLocality`/`areaServed` in their Google data.
  - ⚠️ Do NOT leave a seeded default (e.g. a leftover `Brooklyn, NY` on a non-Brooklyn business). Wrong locality aims their SEO at the wrong city.
- [ ] **Verify the street address** is complete and correct (used as `streetAddress` in structured data).
- [ ] **Verify phone** is set (used as `telephone`).
- [ ] **Set business hours** (booking settings). They auto-convert to Google's required format.
- [ ] **Add social links** (Instagram / Facebook / TikTok) in the profile editor — these become `sameAs` signals.

## Phase 2 — Go live (after Stripe payment)

Conversion is **Stripe-gated**: when they pay, the webhook flips `is_demo → false`
and the site automatically becomes indexable, the demo banner disappears, and the
LocalBusiness JSON-LD starts rendering. Do not flip `is_demo` manually.

- [ ] **Confirm they've subscribed** through Stripe (don't index a site until it's a paid, live client).
- [ ] **Confirm custom domain** is configured (see `CLAUDE.md` → Custom domains) and resolves over HTTPS.
- [ ] **Confirm the demo banner is gone** on the live site.

## Phase 3 — Google Business Profile (the map pack)

This is the single biggest local-visibility lever for a salon/barber. Without it,
they will NOT appear in the top "Businesses" box.

- [ ] **Create or claim** the GBP at [google.com/business](https://business.google.com).
- [ ] **Verify** it (postcard / phone / video). Status must read **Verified**.
- [ ] **Category:** set the primary category accurately (e.g. "Hair salon", "Barber shop", "Nail salon").
- [ ] **NAP must match the website exactly** — Name, Address, Phone identical to what the site/JSON-LD shows. Mismatches dilute local ranking. (Cross-check against the verification in Phase 5.)
- [ ] **Website field:** point it at the client's live custom domain. ⚠️ Never link a GBP to a site that's still a demo (visitors hit the "activate" banner).
- [ ] **Photos:** add real photos (storefront, work, team).
- [ ] **Services:** list services (knotless braids, etc.) so GBP shows "Provides: …".
- [ ] **Reviews:** kick off review collection — reviews are the main ranking + trust driver in the map pack. (Their site has a Google review link feature; use it.)

## Phase 4 — Google Search Console

- [ ] **Add the property** for the client's domain (use the `www` host they actually serve on).
- [ ] **Submit ONE sitemap:** `https://<client-domain>/sitemap` (never submit the homepage `/` as a sitemap).
- [ ] **Request indexing:** URL Inspection → enter the homepage → **Request Indexing**. Do this after any locality fix so Google replaces stale data fast.
- [ ] Only do this for **live/paid** clients — submitting a `noindex` demo wastes crawl budget and won't index.

## Phase 5 — Verify the website is sending Google the right signals

Run these against the live client domain. Replace `<domain>`.

```bash
# Canonical should be the client's own domain (NOT siteforowners.com)
curl -sL https://<domain>/ | grep -o '<link rel="canonical"[^>]*>'

# Should be 0 for a live client (a 1 here means it's still a demo / is_demo=true)
curl -sL https://<domain>/ | grep -c 'noindex'

# Should be 1 — the LocalBusiness structured data block
curl -sL https://<domain>/ | grep -c 'application/ld+json'

# Sitemap should list the homepage + /l/{service}-{city} landing pages for the RIGHT city
curl -sL https://<domain>/sitemap | grep -oE '<loc>[^<]+</loc>'
```

- [ ] Canonical = client domain ✔
- [ ] `noindex` count = 0 ✔
- [ ] `application/ld+json` count = 1 ✔
- [ ] Landing-page URLs show the **correct city** ✔
- [ ] **Validate the markup:** paste `https://<domain>/` into [validator.schema.org](https://validator.schema.org) — expect a valid LocalBusiness/HairSalon with valid hours, correct locality, matching NAP.

## Phase 6 — Show the client the value

- [ ] **The "Google yourself" test:** have them search their **business name**, then **"[service] in [city]"** (e.g. "knotless braids Philadelphia"). Seeing themselves is the most convincing proof. *(Wait a few weeks — indexing + ranking take time.)*
- [ ] **Set expectations:** "Google takes weeks to start sending traffic and builds over time; reviews drive your ranking. Instagram is your fast lane today — the website + Google is the engine that keeps paying off."
- [ ] **Point them at their dashboard** (visitors / found-on-Google / bookings) and GBP insights (calls / direction requests) — tangible monthly proof.

---

## Common gotchas (learned the hard way)

| Symptom | Cause | Fix |
|---|---|---|
| Site says "noindex", no structured data | `is_demo = true` (not yet paid) | Correct — it activates on Stripe payment. Don't flip manually. |
| Canonical points to siteforowners.com | Page didn't override the root layout's canonical | Fixed in code; verify it shows the client domain. |
| Hours ignored by Google | Stored 12-hour ("10:00 AM"); Google needs 24-hour | Fixed in code (`to24Hour`); verify hours look like `10:00–19:00`. |
| Landing pages target the wrong city | Wrong/seeded `seo_locality` | Set the correct "Local SEO area" from the real address. |
| Not in the top "Businesses" box | No Google Business Profile | GBP is the map-pack engine — set it up (Phase 3). |
| GBP link shows a demo banner | GBP points at a not-yet-live (demo) site | Go live first, or leave the GBP website field empty until then. |
| Sitemap "1 error" in Search Console | Submitted the homepage `/` as a sitemap | Submit only `…/sitemap`; remove the bad row. |
