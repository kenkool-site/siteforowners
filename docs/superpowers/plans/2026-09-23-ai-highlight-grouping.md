# AI Highlight Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace AI Highlight's dependency on timestamp Moments with independent, multi-group semantic highlights that use host-defined groups when configured and hybrid fallback/dynamic grouping otherwise.

**Architecture:** Persist provider-independent descriptors once per media item, queue event-level highlight generations in Postgres, and publish complete generations atomically through a SQL RPC. A pure fallback classifier handles small collections; Anthropic derives stable event-specific groups at eight or more media items; host-defined names and optional descriptions replace both automatic modes.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Supabase/Postgres, AWS Rekognition labels, `@anthropic-ai/sdk`, React, `next-intl`, Node test runner via `npx tsx --test`.

**Spec:** `docs/superpowers/specs/2026-09-23-ai-highlight-grouping-design.md`

## Global Constraints

- Timestamp-based Moments remain unchanged and AI Highlight code must not read from or write to `memory_moments` or `memory_moment_media`.
- A media item may belong to multiple highlight groups.
- Host-defined highlight groups replace automatic groups for the event.
- Host-defined groups require a name and accept an optional description.
- Automatic grouping uses fallback classification below eight approved descriptors, then dynamic generation at eight and after each additional batch of ten.
- Guests see only the last successfully published generation; failures retain the previous generation.
- Existing events require an explicit host **Generate AI Highlights** action.
- New descriptor and classifier contracts must accept both `photo` and future `video` media kinds.
- Raw media is analyzed once for reusable descriptors; regrouping uses stored descriptors.
- All host writes require same-origin checks and invitation owner/co-host access.
- All cron/internal processing requires the existing secret-based authorization convention.

---

### Task 1: Add independent highlight persistence and domain types

**Files:**
- Create: `supabase/migrations/058_memory_highlight_grouping.sql`
- Create: `src/lib/invitations/memories/highlight-types.ts`
- Create: `src/lib/invitations/memories/highlight-migration-contract.test.ts`

**Interfaces:**
- Produces: `MemoryMediaDescriptor`, `MemoryHighlightGroup`, `MemoryHighlightGeneration`, `PublishedMemoryHighlights`, `HighlightMode`, and `HighlightGenerationStatus`.
- Produces SQL RPC: `public.publish_memory_highlight_generation(p_event_id uuid, p_generation_id uuid, p_media_count integer)`.

- [ ] **Step 1: Write the failing migration contract test**

Create a test that reads migration `058` and asserts all four tables/columns, RLS, cascading foreign keys, the composite membership primary key, the partial unique pending-generation index, and the publication RPC transaction boundary:

```ts
test("highlight membership is many-to-many and generation scoped", () => {
  assert.match(sql, /PRIMARY KEY \(generation_id, group_id, media_id\)/);
  assert.match(sql, /generation_id uuid NOT NULL REFERENCES public\.memory_highlight_generations\(id\) ON DELETE CASCADE/);
});

test("AI Highlights state is separate from Moments", () => {
  assert.doesNotMatch(sql, /ALTER TABLE public\.memory_moments/);
  assert.match(sql, /published_highlight_generation_id/);
  assert.match(sql, /publish_memory_highlight_generation/);
});
```

- [ ] **Step 2: Run the migration test and verify RED**

Run: `npx tsx --test src/lib/invitations/memories/highlight-migration-contract.test.ts`

Expected: FAIL because migration `058_memory_highlight_grouping.sql` does not exist.

- [ ] **Step 3: Add the migration and domain types**

Implement:

```ts
export type HighlightMode = "automatic" | "host_defined";
export type HighlightGroupSource = "fallback" | "ai_generated" | "host_defined";
export type HighlightGenerationStatus = "queued" | "processing" | "published" | "failed";

export interface MemoryMediaDescriptor {
  mediaId: string;
  mediaKind: "photo" | "video";
  labels: Array<{ name: string; confidence: number }>;
  embedding?: number[];
  transcriptCues?: string[];
}

export interface MemoryHighlightGroup {
  id: string;
  eventId: string;
  name: string;
  description: string | null;
  semanticKey: string;
  source: HighlightGroupSource;
  sortOrder: number;
  isVisible: boolean;
}
```

The migration creates `memory_media_descriptors`, `memory_highlight_groups`, `memory_highlight_generations`, and `memory_highlight_media`; extends `invitation_events` with the approved highlight settings; enables RLS; and adds the atomic publication RPC. The RPC verifies that the generation belongs to the event and is processing, marks it published, updates the event's published pointer/count/status, and clears the pending pointer/error in one transaction.

- [ ] **Step 4: Run the migration contract test and verify GREEN**

Run: `npx tsx --test src/lib/invitations/memories/highlight-migration-contract.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/058_memory_highlight_grouping.sql src/lib/invitations/memories/highlight-types.ts src/lib/invitations/memories/highlight-migration-contract.test.ts
git commit -m "feat: add AI highlight persistence"
```

### Task 2: Implement fallback grouping and generation policy

**Files:**
- Create: `src/lib/invitations/memories/highlight-classifier.ts`
- Create: `src/lib/invitations/memories/highlight-classifier.test.ts`

**Interfaces:**
- Consumes: `MemoryMediaDescriptor`, `MemoryHighlightGroup` from Task 1.
- Produces: `classifyFallbackHighlights(descriptors: MemoryMediaDescriptor[]): HighlightProposal[]`.
- Produces: `classifyIntoHostGroups(descriptors, groups): HighlightAssignment[]` for deterministic exact label/description matches before AI fallback.
- Produces: `shouldQueueHighlightGeneration(input: HighlightGenerationPolicyInput): boolean`.

- [ ] **Step 1: Write failing tests for fallback multi-membership**

Cover a cake photo also matching food, a dance-floor photo, a low-confidence label, and labels that match no group:

```ts
test("one descriptor can belong to multiple fallback groups", () => {
  const groups = classifyFallbackHighlights([{ mediaId: "m1", mediaKind: "photo", labels: [
    { name: "Cake", confidence: 0.98 },
    { name: "Food", confidence: 0.91 },
  ] }]);
  assert.deepEqual(groups.map((group) => group.semanticKey).sort(), ["cake", "food-drinks"]);
  assert.deepEqual(groups.flatMap((group) => group.mediaIds), ["m1", "m1"]);
});
```

- [ ] **Step 2: Run the classifier test and verify RED**

Run: `npx tsx --test src/lib/invitations/memories/highlight-classifier.test.ts`

Expected: FAIL because `highlight-classifier.ts` does not exist.

- [ ] **Step 3: Implement the general fallback dictionary**

Define general categories independent of event schedules: ceremony, cake, dancing, food-drinks, decorations, group-photos, children, gifts, and send-off. Normalize label case, require label confidence `>= 0.6`, deduplicate media IDs, and omit empty groups.

- [ ] **Step 4: Add failing generation-policy tests**

Assert:

```ts
assert.equal(shouldQueueHighlightGeneration({ approvedCount: 1, lastGeneratedCount: 0, hasPublishedGeneration: false, hasPendingGeneration: false }), true);
assert.equal(shouldQueueHighlightGeneration({ approvedCount: 7, lastGeneratedCount: 6, hasPublishedGeneration: true, hasPendingGeneration: false }), true);
assert.equal(shouldQueueHighlightGeneration({ approvedCount: 8, lastGeneratedCount: 7, hasPublishedGeneration: true, hasPendingGeneration: false }), true);
assert.equal(shouldQueueHighlightGeneration({ approvedCount: 17, lastGeneratedCount: 8, hasPublishedGeneration: true, hasPendingGeneration: false }), false);
assert.equal(shouldQueueHighlightGeneration({ approvedCount: 18, lastGeneratedCount: 8, hasPublishedGeneration: true, hasPendingGeneration: false }), true);
assert.equal(shouldQueueHighlightGeneration({ approvedCount: 20, lastGeneratedCount: 8, hasPublishedGeneration: true, hasPendingGeneration: true }), false);
```

- [ ] **Step 5: Implement the policy and verify GREEN**

Below eight items, refresh fallback output for every new approved descriptor. At eight, switch to dynamic mode immediately. At or above eight, queue only when the count has grown by ten. Never queue over an existing pending generation.

Run: `npx tsx --test src/lib/invitations/memories/highlight-classifier.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/invitations/memories/highlight-classifier.ts src/lib/invitations/memories/highlight-classifier.test.ts
git commit -m "feat: classify fallback AI highlights"
```

### Task 3: Add validated Anthropic dynamic and host-defined grouping

**Files:**
- Create: `src/lib/invitations/memories/highlight-generator.ts`
- Create: `src/lib/invitations/memories/highlight-generator.test.ts`

**Interfaces:**
- Consumes: descriptors and groups from Task 1.
- Produces: `generateDynamicHighlights(input, dependencies?): Promise<HighlightProposal[]>`.
- Produces: `generateHostDefinedAssignments(input, dependencies?): Promise<HighlightAssignment[]>`.
- Uses model constant: `claude-haiku-4-5-20251001`.

- [ ] **Step 1: Write failing structured-output tests**

Inject a fake `generateText` dependency and test valid multi-membership, rejection of unknown media IDs, duplicate semantic-key merging, unsafe identity categories, malformed JSON, and host name-plus-description prompt inclusion:

```ts
const proposals = await generateDynamicHighlights(
  { descriptors, existingGroups: [] },
  { generateText: async () => JSON.stringify({ groups: [
    { semanticKey: "cake-cutting", name: "Cake Cutting", description: "The cake celebration", mediaIds: ["m1", "m2"] },
    { semanticKey: "family", name: "Family & Friends", description: "Group portraits", mediaIds: ["m1"] },
  ] }) },
);
assert.equal(proposals.filter((group) => group.mediaIds.includes("m1")).length, 2);
```

- [ ] **Step 2: Run the generator test and verify RED**

Run: `npx tsx --test src/lib/invitations/memories/highlight-generator.test.ts`

Expected: FAIL because the generator module does not exist.

- [ ] **Step 3: Implement the provider boundary and validators**

Use `new Anthropic().messages.create` with the existing `ANTHROPIC_API_KEY`, `claude-haiku-4-5-20251001`, and a compact descriptor-only prompt. Parse only the first complete JSON object. Validate four to eight dynamic groups, known media IDs, normalized semantic keys, unique assignments, bounded text lengths, and a denylist for sensitive identity inference. Preserve an existing group's semantic key/name/order/visibility when the semantic key matches.

For host mode, send the exact host group IDs, names, and optional descriptions and accept only assignments to those IDs. Permit zero or multiple assignments per media item.

- [ ] **Step 4: Run generator tests and verify GREEN**

Run: `npx tsx --test src/lib/invitations/memories/highlight-generator.test.ts`

Expected: PASS without making a network request.

- [ ] **Step 5: Commit**

```bash
git add src/lib/invitations/memories/highlight-generator.ts src/lib/invitations/memories/highlight-generator.test.ts
git commit -m "feat: generate semantic AI highlight groups"
```

### Task 4: Add repository operations and atomic generation service

**Files:**
- Modify: `src/lib/invitations/memories/repository.ts`
- Modify: `src/lib/invitations/memories/repository.test.ts`
- Create: `src/lib/invitations/memories/highlight-service.ts`
- Create: `src/lib/invitations/memories/highlight-service.test.ts`

**Interfaces:**
- Produces repository methods `upsertMemoryMediaDescriptor`, `listApprovedMemoryDescriptors`, `listApprovedMediaMissingDescriptors`, `listMemoryHighlightGroups`, `createMemoryHighlightGroup`, `updateMemoryHighlightGroup`, `deleteMemoryHighlightGroup`, `queueHighlightGeneration`, `claimNextHighlightGeneration`, `replaceHighlightGenerationMemberships`, `publishHighlightGeneration`, `failHighlightGeneration`, and `getPublishedMemoryHighlights`.
- Produces service methods `requestHighlightGeneration(eventId, force)`, `backfillMissingMemoryDescriptors(eventId, limit, dependencies?)`, and `processHighlightGeneration(generationId, dependencies?)`.

- [ ] **Step 1: Write failing repository contract tests**

Assert exact table/RPC names and event scoping in repository source. Assert `getPublishedMemoryHighlights` filters membership by `published_highlight_generation_id` and `is_visible`.

- [ ] **Step 2: Run repository tests and verify RED**

Run: `npx tsx --test src/lib/invitations/memories/repository.test.ts`

Expected: FAIL on missing highlight repository exports.

- [ ] **Step 3: Implement focused repository methods**

Map snake-case rows into Task 1 types. Use `upsert` for descriptor and generation membership idempotency. Use the SQL RPC for publication rather than multiple client-side updates. Never import or query `memory_moments` from these methods.

- [ ] **Step 4: Write failing service tests**

Use dependency injection to verify:

- fewer than eight descriptors selects fallback;
- eight or more selects Anthropic dynamic generation;
- host-defined mode calls host assignment generation and never fallback/dynamic generation;
- one media item can create multiple membership rows;
- invalid/empty output calls `failGeneration` and never `publishGeneration`;
- a thrown provider error preserves the previous published generation;
- repeated processing of a published generation is a no-op.

- [ ] **Step 5: Run service tests and verify RED**

Run: `npx tsx --test src/lib/invitations/memories/highlight-service.test.ts`

Expected: FAIL because `highlight-service.ts` does not exist.

- [ ] **Step 6: Implement the generation service**

The service claims one queued generation, loads eligible descriptors and groups, selects the approved classifier, upserts stable group definitions, replaces only the pending generation's memberships, and calls the publication RPC. Catch provider/validation failures, store a short error code, and do not alter the published pointer.

- [ ] **Step 7: Run repository and service tests and verify GREEN**

Run: `npx tsx --test src/lib/invitations/memories/repository.test.ts src/lib/invitations/memories/highlight-service.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/invitations/memories/repository.ts src/lib/invitations/memories/repository.test.ts src/lib/invitations/memories/highlight-service.ts src/lib/invitations/memories/highlight-service.test.ts
git commit -m "feat: orchestrate atomic AI highlight generations"
```

### Task 5: Persist descriptors and process queued generations

**Files:**
- Modify: `src/app/api/memories/moderate/route.ts`
- Create: `src/app/api/memories/moderate/moderate-route.test.ts`
- Modify: `src/app/api/invitations/events/[eventId]/memories/moderation/route.ts`
- Modify: `src/app/api/invitations/events/[eventId]/memories/moderation/moderation-route.test.ts`
- Create: `src/app/api/cron/memories-highlights/route.ts`
- Create: `src/app/api/cron/memories-highlights/memories-highlights-route.test.ts`
- Modify: `vercel.json`

**Interfaces:**
- Consumes Task 4 repository/service methods.
- The moderation route upserts descriptors and opportunistically queues generation; it no longer calls `classifyMomentFromLabels` or `setAiClassifiedMoment`.
- Cron endpoint consumes `CRON_SECRET` and processes a bounded batch of queued generations or missing descriptors.

- [ ] **Step 1: Write a failing moderation route contract test**

Assert the route calls `detectLabels`, `upsertMemoryMediaDescriptor`, and `requestHighlightGeneration`, and does not import `moment-classification`, `listMemoryMoments`, or `setAiClassifiedMoment`.

- [ ] **Step 2: Run the moderation route test and verify RED**

Run: `npx tsx --test src/app/api/memories/moderate/moderate-route.test.ts`

Expected: FAIL because the old Moment classifier is still wired in.

- [ ] **Step 3: Replace Moment classification with descriptor persistence**

For approved or awaiting-review media, detect labels once and upsert descriptor version `rekognition-labels-v1`. Call `requestHighlightGeneration(eventId, false)` immediately for approved media. Keep enrichment best-effort and non-fatal to moderation. Do not classify rejected or flagged media. In the existing host moderation route, queue generation after an `awaiting_host_review` item is approved so its already-stored descriptor becomes eligible; rejection must not queue generation.

- [ ] **Step 4: Write failing cron authorization and processing tests**

Assert missing/wrong `Bearer ${CRON_SECRET}` returns 401, valid auth claims at most three generations per run, one failure does not stop later generations, and the response reports `{ processed, failed }`.

- [ ] **Step 5: Run cron tests and verify RED**

Run: `npx tsx --test src/app/api/cron/memories-highlights/memories-highlights-route.test.ts`

Expected: FAIL because the route does not exist.

- [ ] **Step 6: Implement the bounded cron worker**

Add `{ "path": "/api/cron/memories-highlights", "schedule": "*/5 * * * *" }` to `vercel.json`. The route validates `CRON_SECRET`, claims up to three queued generations, runs them sequentially, records individual failures, and returns counts. Existing-event requests with missing descriptors remain queued while a bounded descriptor backfill analyzes up to five approved images per run using their moderation derivatives.

- [ ] **Step 7: Run route tests and verify GREEN**

Run: `npx tsx --test src/app/api/memories/moderate/moderate-route.test.ts 'src/app/api/invitations/events/[eventId]/memories/moderation/moderation-route.test.ts' src/app/api/cron/memories-highlights/memories-highlights-route.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/memories/moderate/route.ts src/app/api/memories/moderate/moderate-route.test.ts 'src/app/api/invitations/events/[eventId]/memories/moderation' src/app/api/cron/memories-highlights vercel.json
git commit -m "feat: process AI highlight generations"
```

### Task 6: Add host Highlight configuration and generation controls

**Files:**
- Create: `src/app/api/invitations/events/[eventId]/memories/highlights/route.ts`
- Create: `src/app/api/invitations/events/[eventId]/memories/highlights/highlights-route.test.ts`
- Create: `src/app/api/invitations/events/[eventId]/memories/highlights/generate/route.ts`
- Create: `src/app/api/invitations/events/[eventId]/memories/highlights/generate/generate-route.test.ts`
- Create: `src/components/invitations/memories/OwnerHighlightsManager.tsx`
- Create: `src/components/invitations/memories/OwnerHighlightsManager.test.tsx`
- Modify: `src/components/invitations/memories/MemoriesReviewPageContent.tsx`
- Modify: `messages/en.json`
- Modify: `messages/es.json`

**Interfaces:**
- `GET /api/invitations/events/:eventId/memories/highlights` returns settings, groups, generation status, and counts.
- `POST` creates a host-defined group from `{ name, description? }`.
- `PATCH` supports mode changes and group `{ id, name?, description?, sortOrder?, isVisible? }` updates.
- `DELETE` deletes one host-defined group by ID.
- `POST .../highlights/generate` queues a forced generation and returns `202` with generation ID/status.

- [ ] **Step 1: Write failing route authorization and validation tests**

Cover same-origin rejection, unauthenticated rejection, owner/co-host access, blank/over-80-character names, over-300-character descriptions, cross-event group IDs, valid mode transitions, and duplicate generation returning the existing pending status.

- [ ] **Step 2: Run host route tests and verify RED**

Run: `npx tsx --test 'src/app/api/invitations/events/[eventId]/memories/highlights/highlights-route.test.ts' 'src/app/api/invitations/events/[eventId]/memories/highlights/generate/generate-route.test.ts'`

Expected: FAIL because the routes do not exist.

- [ ] **Step 3: Implement host routes**

Follow the existing Moments/settings route guards. Switching mode queues regeneration only after the settings write succeeds. Group mutations must include both group ID and event ID filters.

- [ ] **Step 4: Write the failing owner component tests**

Render automatic and host-defined states and verify Generate/Regenerate, mode selection, name plus optional description, rename, visibility, reorder, delete, progress polling, failed generation retry, and accessible labels.

- [ ] **Step 5: Run the component test and verify RED**

Run: `npx tsx --test src/components/invitations/memories/OwnerHighlightsManager.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 6: Implement the host manager and translations**

Add a focused card below `OwnerMomentsManager`. Keep Moments copy explicitly schedule/time based and Highlights copy explicitly content based. Poll status every three seconds only while queued or processing. Preserve usable controls on narrow screens.

- [ ] **Step 7: Run host tests and verify GREEN**

Run: `npx tsx --test 'src/app/api/invitations/events/[eventId]/memories/highlights/highlights-route.test.ts' 'src/app/api/invitations/events/[eventId]/memories/highlights/generate/generate-route.test.ts' src/components/invitations/memories/OwnerHighlightsManager.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add 'src/app/api/invitations/events/[eventId]/memories/highlights' src/components/invitations/memories/OwnerHighlightsManager.tsx src/components/invitations/memories/OwnerHighlightsManager.test.tsx src/components/invitations/memories/MemoriesReviewPageContent.tsx messages/en.json messages/es.json
git commit -m "feat: add host AI highlight controls"
```

### Task 7: Switch the guest AI Highlight tab to published semantic groups

**Files:**
- Create: `src/app/api/memories/events/[eventId]/highlights/route.ts`
- Create: `src/app/api/memories/events/[eventId]/highlights/highlights-route.test.ts`
- Modify: `src/components/invitations/memories/GuestAiHighlightView.tsx`
- Create: `src/components/invitations/memories/GuestAiHighlightView.test.tsx`
- Modify: `src/lib/invitations/memories/gallery-view.ts`
- Modify: `src/lib/invitations/memories/gallery-view.test.ts`

**Interfaces:**
- Public endpoint returns `{ groups: Array<MemoryHighlightGroup & { media: PublicMemoryMedia[] }> }` for the published generation only.
- Guest component consumes this endpoint and no longer consumes gallery `moments` or `media[].momentId`.

- [ ] **Step 1: Write failing public route tests**

Assert disabled/offline Memories returns 404, no published generation returns `{ groups: [] }`, hidden groups are excluded, multi-group media appears in every assigned group, and unpublished generations never leak.

- [ ] **Step 2: Run the route test and verify RED**

Run: `npx tsx --test 'src/app/api/memories/events/[eventId]/highlights/highlights-route.test.ts'`

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement the public endpoint**

Use `getEventMemoriesSettings` and `getPublishedMemoryHighlights`; project media through `toPublicMemoryMedia`; return no descriptor data, confidence, errors, or internal generation IDs.

- [ ] **Step 4: Write failing guest component tests**

Verify group cards, multi-group display, selection/back behavior, empty/loading/failure states, and that no request or prop references Moments.

- [ ] **Step 5: Run guest tests and verify RED**

Run: `npx tsx --test src/components/invitations/memories/GuestAiHighlightView.test.tsx`

Expected: FAIL because the component still reads the gallery Moment payload.

- [ ] **Step 6: Update the guest UI and remove obsolete grouping helper**

Fetch `/api/memories/events/${eventId}/highlights`, render the published group payload, and remove `aiHighlightGroups` plus only its Moment-based tests. Keep `momentForMedia` unchanged for the Moments tab.

- [ ] **Step 7: Run guest tests and verify GREEN**

Run: `npx tsx --test 'src/app/api/memories/events/[eventId]/highlights/highlights-route.test.ts' src/components/invitations/memories/GuestAiHighlightView.test.tsx src/lib/invitations/memories/gallery-view.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add 'src/app/api/memories/events/[eventId]/highlights' src/components/invitations/memories/GuestAiHighlightView.tsx src/components/invitations/memories/GuestAiHighlightView.test.tsx src/lib/invitations/memories/gallery-view.ts src/lib/invitations/memories/gallery-view.test.ts
git commit -m "feat: show independent AI highlight groups"
```

### Task 8: Remove the obsolete AI-to-Moment path and verify the complete rollout

**Files:**
- Delete: `src/lib/invitations/memories/moment-classification.ts`
- Delete: `src/lib/invitations/memories/moment-classification.test.ts`
- Modify: `src/lib/invitations/memories/gallery.ts`
- Modify: `src/lib/invitations/memories/gallery.test.ts`
- Modify: `src/app/api/memories/events/[eventId]/gallery/route.ts`
- Modify: `src/lib/invitations/memories-migration-contract.test.ts`
- Modify: `docs/superpowers/specs/2026-09-23-ai-highlight-grouping-design.md`

**Interfaces:**
- Removes AI assignment to `memory_moment_media` and the guest-only `momentId` projection.
- Retains `memory_moment_media` in the database for any host override/backward compatibility until a later cleanup migration.

- [ ] **Step 1: Write the failing separation regression test**

Assert the gallery API still returns media and Moments for timestamp grouping but does not load `listMomentOverridesForEvent`, and assert no production source imports `moment-classification` or calls `setAiClassifiedMoment`.

- [ ] **Step 2: Run the separation tests and verify RED**

Run: `npx tsx --test src/lib/invitations/memories/gallery.test.ts src/lib/invitations/memories/gallery-view.test.ts`

Expected: FAIL while the legacy Moment override remains in the gallery path.

- [ ] **Step 3: Remove the obsolete production path**

Delete the old classifier, stop projecting `momentId`, remove override loading from the public gallery route, and retain only timestamp grouping in `GuestMomentsView`.

- [ ] **Step 4: Run the complete Memories test suite**

Run:

```bash
rg --files src/lib/invitations/memories src/components/invitations/memories src/app/api/memories src/app/api/invitations/events -g '*.test.ts' -g '*.test.tsx' -0 | xargs -0 npx tsx --test
```

Expected: all tests PASS.

- [ ] **Step 5: Run static and production verification**

Run:

```bash
npx tsc --noEmit
npm run build
git diff --check
```

Expected: all commands exit 0. Existing unrelated `<img>` optimization warnings may remain; no new lint, type, or build errors are allowed.

- [ ] **Step 6: Update rollout documentation**

Record migration `058`, `ANTHROPIC_API_KEY`, `AWS_REGION`, `CRON_SECRET`, the five-minute cron, and the host-triggered backfill procedure in the design spec's rollout section. Include a production smoke test: create/choose an event, click Generate, wait for published status, verify one item appears in multiple semantic groups, confirm Moments remain timestamp based, then switch to host-defined groups and verify automatic groups disappear.

- [ ] **Step 7: Commit**

```bash
git add src/lib/invitations/memories src/components/invitations/memories src/app/api/memories src/app/api/invitations/events docs/superpowers/specs/2026-09-23-ai-highlight-grouping-design.md
git commit -m "refactor: separate AI highlights from Moments"
```
