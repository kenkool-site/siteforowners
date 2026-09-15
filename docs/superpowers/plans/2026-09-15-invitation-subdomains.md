# Invitation Subdomains Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each invitation an optional founder-managed subdomain such as `mercy-john.siteforowners.com` that opens the existing invitation at the hostname root.

**Architecture:** Add a shared database reservation registry for tenant and invitation subdomains, then resolve that registry in middleware before internally rewriting invitation hosts to the existing `/invite/[slug]` page. Keep URL construction in a small shared module so founder screens, owner screens, metadata, and notification emails consistently prefer the clean hostname while retaining the legacy route.

**Tech Stack:** Next.js 14 App Router and middleware, TypeScript, React, next-intl, Supabase/PostgreSQL migrations and RPC, Node test runner with `tsx`.

**Spec:** `docs/superpowers/specs/2026-09-15-invitation-subdomains-design.md`

## Global Constraints

- One subdomain maps to one invitation, not one owner.
- Founder users can assign and rename subdomains; celebrants can only view and copy them.
- Existing `/invite/<slug>` URLs remain valid.
- Existing tenant subdomains and custom domains must retain their current routing and access gates.
- Reserved labels are `www`, `api`, `admin`, `app`, `mail`, `support`, `help`, `status`, `static`, `assets`, `cdn`, `dashboard`, `invitations`, `invite`, `login`, and `preview`.
- Apply the database migration before deploying application code.

---

### Task 1: Shared Subdomain Rules and Reservation Schema

**Files:**
- Modify: `src/lib/subdomain.ts`
- Modify: `src/lib/subdomain.test.ts`
- Create: `supabase/migrations/049_invitation_subdomains.sql`
- Create: `src/lib/invitations/subdomain-migration-contract.test.ts`

**Interfaces:**
- Produces: `normalizePlatformSubdomain(value: string): string`, `validatePlatformSubdomain(value: string): { ok: true; value: string } | { ok: false; error: "required" | "invalid" | "reserved" }`, and the existing `pickAvailableSubdomain` helper.
- Produces: `invitation_events.public_subdomain`, `platform_subdomains`, and transactional reservation triggers for `tenants` and `invitation_events`.

- [ ] **Step 1: Write failing normalization and reservation-contract tests**

Cover lowercase normalization, punctuation collapsing, 40-character truncation, invalid raw labels, all reserved labels, tenant backfill SQL, exactly-one-owner constraints, unique resource indexes, and triggers on both source tables.

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `npx tsx --test src/lib/subdomain.test.ts src/lib/invitations/subdomain-migration-contract.test.ts`

Expected: FAIL because the new helpers and migration do not exist.

- [ ] **Step 3: Implement shared validation and migration**

Keep `generateSubdomain` as a compatibility wrapper around `normalizePlatformSubdomain`. In migration 049, add `public_subdomain text UNIQUE` to invitations; create a registry keyed by `label`; backfill tenant labels; reject malformed/reserved labels in the trigger; atomically delete an old reservation and insert the new one; and raise `PLATFORM_SUBDOMAIN_TAKEN` on conflicts.

- [ ] **Step 4: Run focused tests and SQL formatting checks**

Run: `npx tsx --test src/lib/subdomain.test.ts src/lib/invitations/subdomain-migration-contract.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the schema unit**

```bash
git add src/lib/subdomain.ts src/lib/subdomain.test.ts supabase/migrations/049_invitation_subdomains.sql src/lib/invitations/subdomain-migration-contract.test.ts
git commit -m "feat: reserve invitation subdomains"
```

### Task 2: Invitation Domain Service and Founder APIs

**Files:**
- Create: `src/lib/invitations/public-url.ts`
- Create: `src/lib/invitations/public-url.test.ts`
- Create: `src/lib/invitations/subdomains.ts`
- Create: `src/lib/invitations/subdomains.test.ts`
- Modify: `src/lib/invitations/repository-core.ts`
- Modify: `src/lib/invitations/repository.ts`
- Modify: `src/lib/invitations/e2e-fixtures.ts`
- Modify: `src/lib/invitations/validation.ts`
- Modify: `src/lib/invitations/validation.test.ts`
- Create: `src/app/api/invitations/admin/subdomains/availability/route.ts`
- Create: `src/app/api/invitations/admin/subdomains/availability/route.test.ts`
- Modify: `src/app/api/invitations/admin/events/route.ts`
- Modify: `src/app/api/invitations/events/[eventId]/route.ts`

**Interfaces:**
- Consumes: `validatePlatformSubdomain` from Task 1.
- Produces: `invitationPublicUrl({ slug, publicSubdomain }, appUrl?)`, `findAvailableInvitationSubdomain(base, currentEventId?)`, and repository methods to check and resolve reservations.
- Produces: authenticated `GET /api/invitations/admin/subdomains/availability?value=<label>&eventId=<uuid>` returning `{ available, normalized, suggestion }`.
- Extends management/public rows and mapped events with `publicSubdomain: string | null`.

- [ ] **Step 1: Write failing domain-service, URL, validation, and route tests**

Assert clean-host URL preference, legacy fallback, own-label availability during edits, tenant/invitation collisions, numbered suggestions, founder authentication, invalid/reserved responses, and 409 mapping for `PLATFORM_SUBDOMAIN_TAKEN`.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npx tsx --test src/lib/invitations/public-url.test.ts src/lib/invitations/subdomains.test.ts src/lib/invitations/validation.test.ts src/app/api/invitations/admin/subdomains/availability/route.test.ts`

Expected: FAIL on missing domain interfaces.

- [ ] **Step 3: Implement repository projections and domain APIs**

Add `public_subdomain` to the management/public select lists and row mappers. Let founder creation and founder-mode event updates accept `publicSubdomain`; discard it in owner-mode updates. Catch the database sentinel through the error cause and return a field-level conflict without converting unrelated errors into conflicts.

- [ ] **Step 4: Run focused tests**

Run: `npx tsx --test src/lib/invitations/public-url.test.ts src/lib/invitations/subdomains.test.ts src/lib/invitations/repository.test.ts src/lib/invitations/validation.test.ts src/app/api/invitations/admin/subdomains/availability/route.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the server unit**

```bash
git add src/lib/invitations src/app/api/invitations/admin/subdomains src/app/api/invitations/admin/events/route.ts src/app/api/invitations/events/[eventId]/route.ts
git commit -m "feat: manage invitation public domains"
```

### Task 3: Host Routing Without Tenant Regressions

**Files:**
- Create: `src/lib/host-routing.ts`
- Create: `src/lib/host-routing.test.ts`
- Modify: `src/middleware.ts`
- Create: `src/middleware.test.ts`

**Interfaces:**
- Consumes: `platform_subdomains` from Task 1.
- Produces: pure hostname classification helpers and middleware routing for registry records shaped as `{ tenant_id: string | null; invitation_event_id: string | null }`.

- [ ] **Step 1: Write failing host-classification and routing tests**

Cover apex and `www`, Vercel previews, `<label>.localhost`, tenant registry records, invitation registry records, custom tenant domains, unknown labels, non-root invitation paths, query preservation, and no-store failure responses.

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `npx tsx --test src/lib/host-routing.test.ts src/middleware.test.ts`

Expected: FAIL because invitation route targets are unsupported.

- [ ] **Step 3: Refactor and extend middleware**

Preserve custom-domain tenant lookup first. Resolve platform labels through the registry, fetch only the target data needed, apply existing tenant gates unchanged, and rewrite an invitation hostname root to `/invite/<encoded slug>`. Fail closed on lookup errors and missing targets.

- [ ] **Step 4: Run routing and existing tenant-access tests**

Run: `npx tsx --test src/lib/host-routing.test.ts src/middleware.test.ts src/lib/tenant-access.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the routing unit**

```bash
git add src/lib/host-routing.ts src/lib/host-routing.test.ts src/middleware.ts src/middleware.test.ts
git commit -m "feat: route invitation subdomains"
```

### Task 4: Founder Assignment and Celebrant Share UI

**Files:**
- Modify: `src/components/invitations/FounderEventForm.tsx`
- Create: `src/components/invitations/FounderEventForm.interaction.test.tsx`
- Modify: `src/components/invitations/EventEditor.tsx`
- Modify: `src/components/invitations/EventEditor.interaction.test.tsx`
- Modify: `src/components/invitations/EventEditor.render.test.tsx`
- Modify: `src/components/invitations/InvitationCopyLinkButton.tsx`
- Modify: `src/app/(admin)/admin/invitations/page.tsx`
- Modify: `src/app/invitations/page.tsx`
- Modify: `src/app/invitations/manage/[eventId]/page.tsx`
- Modify: `messages/en.json`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: availability API and `invitationPublicUrl` from Task 2.
- Produces: founder-editable `publicSubdomain` input, debounced availability feedback, and preferred-link copy/display components with owner read-only behavior.

- [ ] **Step 1: Write failing render and interaction tests**

Assert title-derived suggestions, suffix rendering, reserved/taken feedback, the submitted `publicSubdomain`, founder-only editability, owner read-only link display, clean-host copy values, and legacy fallback.

- [ ] **Step 2: Run focused component tests and confirm failure**

Run: `npx tsx --test src/components/invitations/FounderEventForm.interaction.test.tsx src/components/invitations/EventEditor.render.test.tsx src/components/invitations/EventEditor.interaction.test.tsx`

Expected: FAIL because subdomain controls do not exist.

- [ ] **Step 3: Implement the UI behavior**

Generate the initial suggestion from title/honoree names, allow founder edits, show availability without treating network failure as availability, submit the field with creation/update payloads, and use the preferred link everywhere guests or owners copy/open an invitation.

- [ ] **Step 4: Run component and page render tests**

Run: `/bin/zsh -lc "npx tsx --test $(rg --files src/components/invitations src/app/invitations -g '*.test.ts' -g '*.test.tsx' | tr '\n' ' ')"`

Expected: PASS.

- [ ] **Step 5: Commit the interface unit**

```bash
git add src/components/invitations src/app/\(admin\)/admin/invitations src/app/invitations messages/en.json messages/es.json
git commit -m "feat: expose invitation subdomain controls"
```

### Task 5: Canonical Links, Notifications, and Full Verification

**Files:**
- Modify: `src/app/invite/[slug]/page.tsx`
- Modify: `src/lib/invitations/notifications.ts`
- Modify: `src/lib/invitations/notifications.test.ts`
- Modify: `src/lib/invitations/e2e-fixtures.ts`
- Modify: relevant invitation projection/render tests

**Interfaces:**
- Consumes: `invitationPublicUrl` and `publicSubdomain` from Task 2.
- Produces: canonical metadata and notification links that prefer the clean hostname.

- [ ] **Step 1: Write failing canonical and notification tests**

Assert subdomain canonical URLs and guest email invitation links, plus legacy fallbacks for invitations without a subdomain.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npx tsx --test src/lib/invitations/public-url.test.ts src/lib/invitations/notifications.test.ts`

Expected: FAIL until all call sites use the URL helper.

- [ ] **Step 3: Use the preferred public URL at every outbound boundary**

Update page metadata, notification repository selection, guest confirmation construction, and fixtures without changing RSVP edit-token URLs or owner-dashboard URLs.

- [ ] **Step 4: Run all verification gates**

Run: `/bin/zsh -lc "npx tsx --test $(rg --files src -g '*.test.ts' -g '*.test.tsx' | tr '\n' ' ')"`

Run: `npx tsc --noEmit`

Run: `npm run lint`

Run: `npm run build`

Expected: all tests and commands pass; only previously accepted framework warnings may remain.

- [ ] **Step 5: Inspect the final diff and commit**

```bash
git diff --check
git status --short
git add src/app/invite src/lib/invitations
git commit -m "feat: prefer invitation subdomain links"
```

### Task 6: Deployment Handoff

**Files:**
- Modify: `docs/superpowers/plans/2026-09-15-invitation-subdomains.md` only to check completed steps if desired.

**Interfaces:**
- Produces: exact migration/deployment/test order for the operator.

- [ ] **Step 1: Confirm migration and commit ordering**

Verify migration 049 is committed before middleware and UI commits in branch history.

- [ ] **Step 2: Record the production sequence**

Apply `049_invitation_subdomains.sql`, deploy the application, assign `mercy-john` in the founder editor, then smoke-test `https://mercy-john.siteforowners.com/`, RSVP, the legacy URL, one tenant subdomain, and the owner portal copy link.

- [ ] **Step 3: Report changed files, verification evidence, and remaining external DNS dependency**

Do not claim wildcard DNS success from local tests; explicitly identify it as a production smoke check.
