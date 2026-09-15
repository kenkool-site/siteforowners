# Invitation Hosts, Style Guide, Footer, and Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add structured invitation style guidance, one full-access co-host, palette-aware decorative cover frames, a branded host-login footer, and privacy-safe cover images in link previews.

**Architecture:** Extend the invitation event record for optional style content and add an event-host membership table while retaining `owner_id` as the compatible primary-owner pointer. Keep private cover media in Supabase and expose only eligible published covers through a slug-scoped server endpoint. Render style, frames, and footer through focused invitation components driven by normalized event data and the existing design recipe.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, Supabase/Postgres, next-intl, Anthropic vision analysis, Resend, Node test runner with `tsx`.

**Spec:** `docs/superpowers/specs/2026-09-15-invitation-hosts-style-and-sharing-design.md`

## Global Constraints

- Each invitation supports at most one co-host with full management access and a separate email/PIN.
- Declining RSVPs remain dashboard-only; no host email or SMS is sent for a decline.
- Existing invitation URLs, primary-owner credentials, private media, notification caps, and old analysis records remain compatible.
- Decorations and colors are recipe-driven and reusable; do not hardcode Mercy & John artwork or colors.
- Passcode, draft, offline, and expired invitations must not expose cover images through metadata.
- Run every data migration before deploying application code that selects its new columns or tables.

---

### Task 1: Persist and validate structured style-guide content

**Files:**
- Create: `supabase/migrations/050_invitation_hosts_and_style_guide.sql`
- Create: `src/lib/invitations/style-guide.ts`
- Create: `src/lib/invitations/style-guide.test.ts`
- Create: `src/lib/invitations/hosts-migration-contract.test.ts`
- Modify: `src/lib/invitations/types.ts`
- Modify: `src/lib/invitations/repository-core.ts`
- Modify: `src/lib/invitations/repository.ts`
- Modify: `src/lib/invitations/validation.ts`
- Modify: `src/lib/invitations/validation.test.ts`

**Interfaces:**
- Produces: `InvitationEventColor`, `InvitationStyleGuide`, `normalizeInvitationStyleGuide(input)`, and optional `styleGuide` on management/public event models.
- Produces: `invitation_event_hosts(event_id, owner_id, role)` schema used by later authorization and co-host tasks.

- [ ] **Step 1: Write failing normalization and migration contract tests**

```ts
assert.deepEqual(normalizeInvitationStyleGuide({
  note: "Glamorous fascinators",
  colors: [{ name: "Sage", color: "#9ca58b" }],
}), { note: "Glamorous fascinators", colors: [{ name: "Sage", color: "#9CA58B" }] });
assert.equal(normalizeInvitationStyleGuide({ note: "", colors: [] }), null);
assert.equal(normalizeInvitationStyleGuide({ note: null, colors: [{ name: "Sage", color: "green" }] }), null);
```

The migration contract must assert `style_guide jsonb`, `invitation_event_hosts`, role checks, unique primary/co-host partial indexes, primary-host backfill, RLS, and revoked anon/authenticated access.

- [ ] **Step 2: Run tests and verify failure**

Run: `npx tsx --test src/lib/invitations/style-guide.test.ts src/lib/invitations/hosts-migration-contract.test.ts src/lib/invitations/validation.test.ts`
Expected: FAIL because the style-guide module, migration, and update field do not exist.

- [ ] **Step 3: Add migration and pure style-guide normalizer**

```ts
export type InvitationEventColor = { name: string; color: string };
export type InvitationStyleGuide = { note: string | null; colors: InvitationEventColor[] };

export function normalizeInvitationStyleGuide(input: unknown): InvitationStyleGuide | null {
  // Accept a plain object, trim note/names, uppercase valid #RRGGBB values,
  // cap the note at 500 characters and colors at 8, and return null when empty.
}
```

The migration adds `style_guide jsonb` with an object/null constraint and creates memberships with cascading event deletion, restricted owner deletion, `primary|cohost` role validation, unique `(event_id, owner_id)`, and partial unique indexes per role. Insert every existing `(invitation_events.id, owner_id, 'primary')` using `ON CONFLICT DO NOTHING`.

- [ ] **Step 4: Wire style guide through models, selects, mapping, and updates**

Add `styleGuide?: InvitationStyleGuide | null` to `InvitationEventUpdate`, `InvitationEvent`, management/public row types, public projection, and `EVENT_UPDATE_COLUMNS` as `style_guide`. Parse it through `normalizeInvitationStyleGuide`; reject a non-empty invalid input with `errors.styleGuide`.

- [ ] **Step 5: Run focused tests and commit**

Run: `npx tsx --test src/lib/invitations/style-guide.test.ts src/lib/invitations/hosts-migration-contract.test.ts src/lib/invitations/validation.test.ts src/lib/invitations/repository.test.ts`
Expected: PASS.

```bash
git add supabase/migrations/050_invitation_hosts_and_style_guide.sql src/lib/invitations
git commit -m "feat: persist invitation style guides and hosts"
```

### Task 2: Extract and review style notes and named colors

**Files:**
- Modify: `src/lib/invitations/reference-analysis.ts`
- Modify: `src/lib/invitations/reference-analysis.test.ts`
- Modify: `src/lib/invitations/reference-analyzer.ts`
- Modify: `src/lib/invitations/reference-analyzer.test.ts`
- Modify: `src/components/invitations/ReferenceImportReview.tsx`
- Modify: `src/components/invitations/EventEditor.tsx`
- Modify: `src/components/invitations/EventEditor.interaction.test.tsx`
- Modify: `messages/en.json`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `InvitationEventColor` and `InvitationStyleGuide` from Task 1.
- Produces: analysis schema version 3 with optional `styleNote` fact and `eventColors: Array<{name,color,confidence,evidence}>`.

- [ ] **Step 1: Write failing schema/analyzer tests**

```ts
assert.equal(analysis.schemaVersion, 3);
assert.deepEqual(analysis.eventColors, [{
  name: "Sage", color: "#AAB39A", confidence: 0.96, evidence: "SAGE",
}]);
assert.equal(analysis.facts.find((fact) => fact.key === "styleNote")?.value, "Glamorous fascinators");
```

Also prove schema-version-2 records normalize with `eventColors: []`, malformed colors are removed, and style-note text is not folded into `description`.

- [ ] **Step 2: Run tests and verify failure**

Run: `npx tsx --test src/lib/invitations/reference-analysis.test.ts src/lib/invitations/reference-analyzer.test.ts src/components/invitations/EventEditor.interaction.test.tsx`
Expected: FAIL on version 3 and missing structured colors.

- [ ] **Step 3: Extend the vision contract and compatibility normalizer**

Update the prompt to return `facts`, `eventColors`, and `recipe`. Permit `styleNote` in fact keys and require visible labels/evidence for named colors. Repair each color independently and cap the list at eight. Normalize both version 2 and 3 inputs into the version-3 application type.

- [ ] **Step 4: Add editable import-review controls**

Render each extracted style fact and color as an independently selectable row with `<input type="color">` and editable name. Change the callback to:

```ts
onApply(input: {
  facts: ExtractedFact[];
  eventColors: InvitationEventColor[];
  includeDesign: boolean;
}): void
```

In `EventEditor.applyReference`, apply ordinary facts to their fields and update controlled `styleGuide` state with the selected style note/colors. Preserve existing design-recipe application.

- [ ] **Step 5: Add bilingual labels, run tests, and commit**

Run: `npx tsx --test src/lib/invitations/reference-analysis.test.ts src/lib/invitations/reference-analyzer.test.ts src/components/invitations/EventEditor.interaction.test.tsx`
Expected: PASS.

```bash
git add src/lib/invitations/reference-analysis.ts src/lib/invitations/reference-analysis.test.ts src/lib/invitations/reference-analyzer.ts src/lib/invitations/reference-analyzer.test.ts src/components/invitations/ReferenceImportReview.tsx src/components/invitations/EventEditor.tsx src/components/invitations/EventEditor.interaction.test.tsx messages/en.json messages/es.json
git commit -m "feat: extract invitation style guidance"
```

### Task 3: Edit and render the optional style guide

**Files:**
- Create: `src/components/invitations/InvitationStyleGuide.tsx`
- Create: `src/components/invitations/InvitationStyleGuide.render.test.tsx`
- Modify: `src/components/invitations/EventEditor.tsx`
- Modify: `src/components/invitations/EventEditor.render.test.tsx`
- Modify: `src/components/invitations/PublicInvitation.tsx`
- Modify: `src/components/invitations/PublicInvitation.render.test.tsx`
- Modify: `messages/en.json`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: normalized `event.styleGuide` from Task 1.
- Produces: reusable `<InvitationStyleGuide guide titleClass accent surface />` public renderer.

- [ ] **Step 1: Write failing editor and public-render tests**

Assert that note input and up to eight name/color rows serialize into the PATCH body; empty inputs serialize as `null`; the public page renders “Style Guide,” Sage, and an accessible color swatch only when content exists.

- [ ] **Step 2: Run tests and verify failure**

Run: `npx tsx --test src/components/invitations/InvitationStyleGuide.render.test.tsx src/components/invitations/EventEditor.render.test.tsx src/components/invitations/PublicInvitation.render.test.tsx`
Expected: FAIL because the editor and public component do not render style-guide data.

- [ ] **Step 3: Implement controlled editor rows**

Add a `styleGuide` state initialized from `event.styleGuide`, a note textarea, Add color/Remove controls, name inputs, and native color inputs. Limit rows to eight and include `styleGuide` in the save payload.

- [ ] **Step 4: Implement conditional public section**

Render after details with the design recipe’s surface/accent colors. Each swatch uses its actual color and exposes an accessible label such as `Sage: #AAB39A`; names remain visible without relying on color perception.

- [ ] **Step 5: Run tests and commit**

Run: `npx tsx --test src/components/invitations/InvitationStyleGuide.render.test.tsx src/components/invitations/EventEditor.render.test.tsx src/components/invitations/PublicInvitation.render.test.tsx src/lib/invitations/validation.test.ts`
Expected: PASS.

```bash
git add src/components/invitations src/lib/invitations/validation.test.ts messages/en.json messages/es.json
git commit -m "feat: edit and display invitation style guides"
```

### Task 4: Authorize full-access co-host memberships

**Files:**
- Create: `src/lib/invitations/hosts.ts`
- Create: `src/lib/invitations/hosts.test.ts`
- Modify: `src/lib/invitations/access.ts`
- Modify: `src/lib/invitations/access.test.ts`
- Modify: `src/lib/invitations/repository.ts`
- Modify: `src/lib/invitations/repository-core.ts`
- Modify: `src/app/invitations/page.tsx`
- Modify: `src/app/invitations/manage/[eventId]/page.tsx`

**Interfaces:**
- Produces: `InvitationHostMembership`, `ownerCanManageInvitation(ownerId,eventId)`, `listByHost(ownerId)`, and management projection `cohost`.
- Consumes: `invitation_event_hosts` from Task 1.

- [ ] **Step 1: Write failing membership authorization tests**

```ts
assert.deepEqual(await resolveInvitationAccess({
  ...input, ownerSession: { ownerId: "cohost-1", expiresAt: future },
  ownerCanManageEvent: async () => true,
}), { kind: "owner", ownerId: "cohost-1" });
```

Add repository tests showing primary and co-host accounts both list the event once, while an unrelated owner cannot load it.

- [ ] **Step 2: Run tests and verify failure**

Run: `npx tsx --test src/lib/invitations/access.test.ts src/lib/invitations/hosts.test.ts src/lib/invitations/repository.test.ts`
Expected: FAIL because authorization still compares `invitation_events.owner_id`.

- [ ] **Step 3: Query membership for access and owner lists**

Replace direct ownership lookup with an inner membership query constrained by event and owner. Change `listByOwner` to join/filter memberships and deduplicate by event ID. Load primary owner and optional co-host relations into management models.

- [ ] **Step 4: Apply membership checks to server-rendered owner pages**

Use the same repository access helper in `/invitations/manage/[eventId]` rather than `event.ownerId !== ownerId`. Keep founder routes unchanged and central owner sessions unchanged.

- [ ] **Step 5: Run tests and commit**

Run: `npx tsx --test src/lib/invitations/access.test.ts src/lib/invitations/hosts.test.ts src/lib/invitations/repository.test.ts`
Expected: PASS.

```bash
git add src/lib/invitations src/app/invitations
git commit -m "feat: authorize invitation co-hosts"
```

### Task 5: Manage co-host credentials and notify both hosts

**Files:**
- Create: `src/app/api/invitations/events/[eventId]/cohost/route.ts`
- Create: `src/app/api/invitations/events/[eventId]/cohost/route.test.ts`
- Modify: `src/lib/invitations/hosts.ts`
- Modify: `src/lib/invitations/hosts.test.ts`
- Modify: `src/components/invitations/EventEditor.tsx`
- Modify: `src/components/invitations/EventEditor.interaction.test.tsx`
- Modify: `src/lib/invitations/notifications.ts`
- Modify: `src/lib/invitations/notifications.test.ts`
- Modify: `messages/en.json`
- Modify: `messages/es.json`

**Interfaces:**
- Produces: `setInvitationCohost(eventId,{name,email,pinHash})` and `removeInvitationCohost(eventId)`.
- Changes: `NotificationEventContext.ownerEmailRecipients: string[]` replaces the single email attempt while SMS remains singular.

- [ ] **Step 1: Write failing co-host route and dual-notification tests**

Cover founder/primary-host create, co-host forbidden from replacing itself, existing-owner attachment without PIN overwrite, removal, invalid email/PIN, and one-co-host enforcement. Notification tests must expect two owner emails for an attending response, one after deduplication, and zero owner email/SMS attempts for a decline.

- [ ] **Step 2: Run tests and verify failure**

Run: `npx tsx --test src/lib/invitations/hosts.test.ts src/app/api/invitations/events/'[eventId]'/cohost/route.test.ts src/lib/invitations/notifications.test.ts`
Expected: FAIL because co-host mutation and recipient arrays do not exist.

- [ ] **Step 3: Implement transactional co-host mutation and route**

The service normalizes email, finds an existing active owner or creates one with `hashPin`, then replaces the co-host membership in one database transaction/RPC. Return `{ cohost, generatedPin?: string }`; never return a stored hash. DELETE removes only the co-host membership. Require founder or primary-host role for POST/DELETE.

- [ ] **Step 4: Add owner-editor co-host controls**

Show current co-host, add/replace fields, a six-digit PIN for new accounts, one-time credential result, and a Remove action. Refresh editor state after successful mutation and show field-level errors without discarding unsaved event changes.

- [ ] **Step 5: Fan out attending/update email notifications safely**

Load active host membership emails, combine with the configured primary notification email, normalize/deduplicate, and create one reservation per address. Guard owner email and SMS planning with `rsvp.attending`; guest confirmation behavior remains unchanged. Preserve per-message cap accounting and failure isolation.

- [ ] **Step 6: Run tests and commit**

Run: `npx tsx --test src/lib/invitations/hosts.test.ts src/app/api/invitations/events/'[eventId]'/cohost/route.test.ts src/components/invitations/EventEditor.interaction.test.tsx src/lib/invitations/notifications.test.ts`
Expected: PASS.

```bash
git add src/app/api/invitations/events src/lib/invitations src/components/invitations/EventEditor.tsx src/components/invitations/EventEditor.interaction.test.tsx messages/en.json messages/es.json
git commit -m "feat: manage and notify invitation co-hosts"
```

### Task 6: Add reusable decorative cover frames

**Files:**
- Create: `src/components/invitations/InvitationFrame.tsx`
- Create: `src/components/invitations/InvitationFrame.render.test.tsx`
- Modify: `src/components/invitations/InvitationHero.tsx`
- Modify: `src/components/invitations/EventEditor.tsx`
- Modify: `src/components/invitations/EventEditor.render.test.tsx`
- Modify: `src/lib/invitations/design-recipe.ts`
- Modify: `src/lib/invitations/design-recipe.test.ts`
- Modify: `messages/en.json`
- Modify: `messages/es.json`

**Interfaces:**
- Produces: `<InvitationFrame style accent density radius />` shared by public and editor preview.
- Consumes: existing recipe frame values `none|line|double|botanical|ornamental` and decoration motif/density; adds explicit `floral` frame style in a backward-compatible recipe normalizer.

- [ ] **Step 1: Write failing frame normalization and render tests**

Assert every option normalizes, floral/botanical SVG uses the supplied accent color, decorations are `aria-hidden`, no-frame renders no overlay, and rich mobile decoration contains fewer visible clusters than desktop.

- [ ] **Step 2: Run tests and verify failure**

Run: `npx tsx --test src/lib/invitations/design-recipe.test.ts src/components/invitations/InvitationFrame.render.test.tsx src/components/invitations/EventEditor.render.test.tsx`
Expected: FAIL on the floral option and absent component.

- [ ] **Step 3: Implement SVG/CSS frame variants**

Use inline vector leaves, petals, flourishes, and border primitives with `currentColor`. Position them in corner/edge containers, set `pointer-events-none`, and use responsive visibility classes to reduce density on mobile. Keep the text-safe center unobstructed.

- [ ] **Step 4: Share the renderer and expose visual choices**

Replace the hero’s generic border block with `InvitationFrame`. Add labeled thumbnail/radio choices in the design editor that update `designRecipe.frame.style`; synchronize floral selection with `decoration.motif = "floral"` while retaining palette and focal-point values.

- [ ] **Step 5: Run tests and commit**

Run: `npx tsx --test src/lib/invitations/design-recipe.test.ts src/components/invitations/InvitationFrame.render.test.tsx src/components/invitations/EventEditor.render.test.tsx src/components/invitations/PublicInvitation.render.test.tsx`
Expected: PASS.

```bash
git add src/components/invitations src/lib/invitations/design-recipe.ts src/lib/invitations/design-recipe.test.ts messages/en.json messages/es.json
git commit -m "feat: add invitation cover frame options"
```

### Task 7: Add branded footer and privacy-safe share previews

**Files:**
- Create: `src/components/invitations/InvitationFooter.tsx`
- Create: `src/components/invitations/InvitationFooter.render.test.tsx`
- Create: `src/app/api/invitations/public/[slug]/cover/route.ts`
- Create: `src/app/api/invitations/public/[slug]/cover/route.test.ts`
- Modify: `src/components/invitations/PublicInvitation.tsx`
- Modify: `src/lib/invitations/public-access.ts`
- Modify: `src/lib/invitations/public-access.test.ts`
- Modify: `messages/en.json`
- Modify: `messages/es.json`

**Interfaces:**
- Produces: `invitationCoverPreviewUrl(event, origin?)` and a GET endpoint that streams only an eligible event’s current cover.
- Consumes: `getPublicInvitationBySlug`, `getEffectiveEventState`, private storage download, and `invitationPublicUrl`.

- [ ] **Step 1: Write failing footer, metadata, and endpoint tests**

Assert footer links exactly to `https://www.siteforowners.com/` and `/invitations/login`. Assert published public cover metadata includes absolute Open Graph/Twitter image URLs and `summary_large_image`. Assert endpoint 404 for passcode, draft, offline, expired, missing-cover, and unknown events; published public cover returns bytes and verified `image/jpeg|png|webp` content type.

- [ ] **Step 2: Run tests and verify failure**

Run: `npx tsx --test src/components/invitations/InvitationFooter.render.test.tsx src/lib/invitations/public-access.test.ts src/app/api/invitations/public/'[slug]'/cover/route.test.ts`
Expected: FAIL because the footer and cover endpoint do not exist and metadata has no images.

- [ ] **Step 3: Render the subtle public footer**

Use small text, palette-derived muted color, visible keyboard focus, and two links: “Powered by SiteForOwners” and “Host sign in.” Place it after the content and RSVP dialog trigger without competing with the floating RSVP CTA.

- [ ] **Step 4: Implement the stable cover response**

Resolve only by slug, verify effective state is `published`, reject any passcode or missing cover, validate the stored path belongs to the event’s `cover` directory, download with the service client, verify the blob media type, and return the bytes with `Content-Type`, `X-Content-Type-Options: nosniff`, and bounded public cache headers. Never accept a storage path from request input.

- [ ] **Step 5: Add Open Graph and Twitter metadata**

For eligible events, set `openGraph.images` and `twitter.images` to the absolute stable endpoint and select `twitter.card = "summary_large_image"`. Preserve private metadata for protected/unavailable events and generic root metadata when no cover exists.

- [ ] **Step 6: Run tests and commit**

Run: `npx tsx --test src/components/invitations/InvitationFooter.render.test.tsx src/lib/invitations/public-access.test.ts src/app/api/invitations/public/'[slug]'/cover/route.test.ts src/components/invitations/PublicInvitation.render.test.tsx`
Expected: PASS.

```bash
git add src/components/invitations src/app/api/invitations/public src/lib/invitations/public-access.ts src/lib/invitations/public-access.test.ts messages/en.json messages/es.json
git commit -m "feat: add invitation footer and share previews"
```

### Task 8: Complete integration verification

**Files:**
- Modify: `tests/invitations/invitation-flow.spec.ts`
- Modify: `docs/superpowers/plans/2026-09-15-invitation-hosts-style-and-sharing.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a verified deployable feature and checked plan boxes.

- [ ] **Step 1: Extend the invitation integration fixture and flow**

Cover applying an analyzed style guide, choosing a floral frame, creating a co-host, signing in as that co-host, editing the event, submitting an attending RSVP, confirming both email attempts, confirming a decline produces no host attempts, and checking footer/metadata output.

- [ ] **Step 2: Run every invitation unit/render test**

Run: `/bin/zsh -lc "npx tsx --test $(rg --files src -g '*.test.ts' -g '*.test.tsx' | rg 'invitations|Invitation')"`
Expected: all invitation tests PASS.

- [ ] **Step 3: Run static validation**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm run lint`
Expected: exit 0 with no new warnings.

- [ ] **Step 4: Run production build**

Run: `npm run build`
Expected: successful Next.js production build.

- [ ] **Step 5: Run browser smoke test when the local app is available**

Verify mobile and desktop cover frames, style swatches, footer links, both host sessions, RSVP dashboard access, and the cover endpoint. Confirm page source contains `og:image` and `twitter:image` pointing to the cover endpoint.

- [ ] **Step 6: Commit verification coverage**

```bash
git add tests/invitations/invitation-flow.spec.ts docs/superpowers/plans/2026-09-15-invitation-hosts-style-and-sharing.md
git commit -m "test: cover invitation hosts style and sharing"
```
