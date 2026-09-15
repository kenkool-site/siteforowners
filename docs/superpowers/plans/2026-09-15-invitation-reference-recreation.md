# Invitation Reference Recreation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert a private designed-invitation image into a reviewed, editable design recipe and render a responsive invitation with the cover photograph as its full-screen opening.

**Architecture:** An authenticated analysis endpoint reads the event-scoped private reference, combines deterministic palette sampling with a schema-constrained Anthropic vision result, normalizes it into finite TypeScript contracts, and stores a private review draft. Owners apply reviewed facts and a validated recipe through the existing save flow; the public projection receives only the recipe and renders it through controlled components.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Supabase/Postgres, Anthropic SDK, `sharp`, next-intl, Node test runner with `tsx`.

**Spec:** `docs/superpowers/specs/2026-09-15-invitation-reference-recreation-design.md`

## Global Constraints

- The designed invitation is a private analysis reference and must never be rendered or projected publicly.
- The cover photograph is the full-screen opening; missing or failed cover media falls back to the recipe palette.
- AI returns structured data only—never HTML, CSS, JavaScript, React, class names, or arbitrary font URLs.
- Extracted facts and generated wording are separate actions and separate response fields.
- Analysis never changes saved event fields, publishing status, or public design until the owner reviews, applies, and saves.
- Every AI, database, and storage operation is event-authorized and server-side.
- Colors are normalized six-digit hex values; enum and numeric inputs are allowlisted and bounded.
- Analysis is explicit, rate-limited, and reused for an unchanged reference path and schema version.
- English and Spanish editor copy remain key-parity checked.
- Use TDD for every production behavior and commit after every task.

---

## File structure

- `src/lib/invitations/design-recipe.ts`: public recipe types, defaults, strict normalization, contrast fallback.
- `src/lib/invitations/reference-analysis.ts`: private extraction types and AI-output normalization.
- `src/lib/invitations/palette.ts`: deterministic pixel sampling and color clustering.
- `src/lib/invitations/reference-analyzer.ts`: vision prompt, provider boundary, result orchestration, cache identity.
- `src/lib/invitations/analysis-repository.ts`: private analysis persistence and serialized attempt reservation.
- `src/app/api/invitations/events/[eventId]/analyze-reference/route.ts`: authorized analysis endpoint.
- `src/app/api/invitations/events/[eventId]/suggest-wording/route.ts`: separate authorized copy endpoint.
- `src/components/invitations/ReferenceImportReview.tsx`: review and apply UI.
- `src/components/invitations/RecreatedInvitation.tsx`: recipe-driven public composition below the hero.
- `src/components/invitations/InvitationHero.tsx`: full-screen cover opening with fallback.
- `src/components/invitations/EventEditor.tsx`: wires uploads, analysis, review, apply, and normal save.
- `src/components/invitations/PublicInvitation.tsx`: composes hero, recreation, details, gallery, and RSVP.
- `supabase/migrations/046_invitation_reference_analysis.sql`: JSONB columns, constraints, private rate-limit RPC.

---

### Task 1: Define and normalize the public design recipe

**Files:**
- Create: `src/lib/invitations/design-recipe.ts`
- Create: `src/lib/invitations/design-recipe.test.ts`

**Interfaces:**
- Produces: `InvitationDesignRecipe`, `DEFAULT_INVITATION_DESIGN_RECIPE`, `normalizeInvitationDesignRecipe(input)`, and `ensureReadableRecipe(recipe)`.
- Consumed by: repository projections, editor review, and public renderer.

- [ ] **Step 1: Write failing normalization tests**

Cover valid normalization, rejection of arbitrary CSS-like strings, numeric bounding, invalid colors, unknown versions, content-order deduplication, and contrast repair.

```ts
test("normalizes an allowlisted recipe and removes duplicate content sections", () => {
  const result = normalizeInvitationDesignRecipe({
    version: 1,
    palette: { background: "#f8f4ea", surface: "#ffffff", text: "#173927", mutedText: "#536459", accent: "#b58a55", overlay: "#10251a" },
    typography: { display: "formal-script", body: "humanist-sans", weight: 500, tracking: 0.01, scale: "dramatic" },
    composition: { family: "framed", alignment: "center", maxWidth: 760, rhythm: "airy", heroTextPlacement: "center" },
    frame: { style: "botanical", width: 2, radius: "none", inset: true },
    decoration: { motif: "botanical", density: "rich", symmetry: "mirrored", divider: "flourish" },
    hero: { overlayStrength: 0.42, textColor: "#ffffff", focalX: 0.5, focalY: 0.4, minHeightVh: 100 },
    contentOrder: ["intro", "details", "intro", "gallery", "rsvp"],
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.value.contentOrder, ["intro", "details", "gallery", "rsvp"]);
});

test("rejects arbitrary presentation values", () => {
  const result = normalizeInvitationDesignRecipe({ version: 1, typography: { display: "url(https://evil.test/font.woff)" } });
  assert.equal(result.ok, false);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx tsx --test src/lib/invitations/design-recipe.test.ts`

Expected: FAIL because `design-recipe.ts` does not exist.

- [ ] **Step 3: Implement the finite contract and normalizer**

Define the exact public contract:

```ts
export type InvitationDesignRecipe = {
  version: 1;
  palette: {
    background: string; surface: string; text: string;
    mutedText: string; accent: string; overlay: string;
  };
  typography: {
    display: "formal-script" | "editorial-serif" | "classic-serif" | "geometric-sans" | "humanist-sans";
    body: "classic-serif" | "humanist-sans" | "geometric-sans";
    weight: 400 | 500 | 600 | 700;
    tracking: number;
    scale: "restrained" | "balanced" | "dramatic";
  };
  composition: {
    family: "framed" | "centered" | "asymmetric" | "editorial" | "layered";
    alignment: "left" | "center";
    maxWidth: number;
    rhythm: "compact" | "balanced" | "airy";
    heroTextPlacement: "top" | "center" | "bottom";
  };
  frame: {
    style: "none" | "line" | "double" | "botanical" | "ornamental";
    width: number;
    radius: "none" | "soft" | "rounded";
    inset: boolean;
  };
  decoration: {
    motif: "none" | "botanical" | "floral" | "geometric" | "ribbon" | "ornamental";
    density: "minimal" | "balanced" | "rich";
    symmetry: "none" | "balanced" | "mirrored";
    divider: "none" | "line" | "dots" | "flourish";
  };
  hero: {
    overlayStrength: number;
    textColor: string;
    focalX: number;
    focalY: number;
    minHeightVh: number;
  };
  contentOrder: Array<"intro" | "details" | "gallery" | "counts" | "rsvp">;
};
```

Normalize tracking to `[-0.08, 0.12]`, width to `[320, 1120]`, frame width to `[0, 8]`, focal coordinates to `[0, 1]`, overlay to `[0.2, 0.8]`, and hero height to `[80, 100]`. Implement WCAG relative-luminance helpers and adjust hero/body text to `#FFFFFF` or `#111111` when contrast is below 4.5:1.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npx tsx --test src/lib/invitations/design-recipe.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/invitations/design-recipe.ts src/lib/invitations/design-recipe.test.ts
git commit -m "feat: define invitation design recipes"
```

---

### Task 2: Persist private analysis and public recipes safely

**Files:**
- Create: `supabase/migrations/046_invitation_reference_analysis.sql`
- Create: `src/lib/invitations/reference-analysis.ts`
- Create: `src/lib/invitations/reference-analysis.test.ts`
- Create: `src/lib/invitations/analysis-repository.ts`
- Modify: `src/lib/invitations/types.ts`
- Modify: `src/lib/invitations/repository-core.ts`
- Modify: `src/lib/invitations/repository.ts`
- Modify: `src/lib/invitations/repository.test.ts`

**Interfaces:**
- Consumes: `InvitationDesignRecipe` and `normalizeInvitationDesignRecipe` from Task 1.
- Produces: `InvitationReferenceAnalysis`, private persistence functions, `reserve_invitation_analysis_attempt`, management projections containing analysis, and public projections containing only `designRecipe`.

- [ ] **Step 1: Write failing projection and migration-contract tests**

```ts
test("public lookup exposes a validated recipe but never raw reference analysis", async () => {
  const result = await getPublicInvitationBySlug("mercy-and-john", repositoryWithAnalysisRow);
  assert.equal(result?.event.designRecipe?.version, 1);
  assert.equal("referenceAnalysis" in (result?.event ?? {}), false);
});

test("analysis migration keeps reservation service-role-only", () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.reserve_invitation_analysis_attempt.*FROM PUBLIC/si);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.reserve_invitation_analysis_attempt.*TO service_role/si);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npx tsx --test src/lib/invitations/reference-analysis.test.ts src/lib/invitations/repository.test.ts`

Expected: FAIL because the new fields and contracts are absent.

- [ ] **Step 3: Add migration 046**

Add nullable `design_recipe jsonb` and `reference_analysis jsonb`, plus `analysis_window_started_at timestamptz`, `analysis_attempt_count integer NOT NULL DEFAULT 0`, and checks requiring objects when JSON is non-null and a non-negative counter.

Create `reserve_invitation_analysis_attempt(p_event_id uuid, p_limit integer DEFAULT 5, p_window interval DEFAULT interval '1 hour') RETURNS boolean` with `SECURITY DEFINER`, `SET search_path = public, pg_temp`, a row lock, atomic window reset/increment, and service-role-only execution.

- [ ] **Step 4: Implement private analysis and repository contracts**

```ts
export type ExtractedFactKey = "title" | "honoreeNames" | "startsAt" | "venueName" | "address" | "description";
export type ExtractedFact = { key: ExtractedFactKey; value: string; confidence: number; evidence: string };
export type InvitationReferenceAnalysis = {
  schemaVersion: 1;
  referencePath: string;
  model: string;
  createdAt: string;
  facts: ExtractedFact[];
  paletteCandidates: string[];
  recipe: InvitationDesignRecipe;
};
```

Add repository methods:

```ts
reserveAttempt(eventId: string): Promise<boolean>;
saveAnalysis(eventId: string, analysis: InvitationReferenceAnalysis): Promise<void>;
getAnalysis(eventId: string): Promise<InvitationReferenceAnalysis | null>;
```

Extend management selects/projections with both JSON fields. Extend public selects/projections with `design_recipe` only. Normalize JSON at both boundaries and fall back to `null` on invalid stored data.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `npx tsx --test src/lib/invitations/reference-analysis.test.ts src/lib/invitations/repository.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/046_invitation_reference_analysis.sql src/lib/invitations/reference-analysis.ts src/lib/invitations/reference-analysis.test.ts src/lib/invitations/analysis-repository.ts src/lib/invitations/types.ts src/lib/invitations/repository-core.ts src/lib/invitations/repository.ts src/lib/invitations/repository.test.ts
git commit -m "feat: persist invitation reference analysis"
```

---

### Task 3: Extract a deterministic palette from the reference image

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/lib/invitations/palette.ts`
- Create: `src/lib/invitations/palette.test.ts`

**Interfaces:**
- Produces: `extractInvitationPalette(bytes): Promise<string[]>`.
- Consumed by: `analyzeInvitationReference` in Task 4.

- [ ] **Step 1: Install the direct image-processing dependency**

Run: `npm install sharp`

Expected: `sharp` appears under `dependencies` and the lockfile updates.

- [ ] **Step 2: Write failing palette tests with generated pixel fixtures**

Use `sharp({ create: ... }).composite(...)` in the test to create a small in-memory image with known ivory, green, and gold regions.

```ts
test("returns clustered dominant colors in coverage order", async () => {
  const colors = await extractInvitationPalette(referenceBytes);
  assert.deepEqual(colors.slice(0, 3), ["#F3F0E5", "#245A38", "#B88A53"]);
});
```

Also test transparent pixels, near-duplicate clustering, and a malformed image rejection.

- [ ] **Step 3: Run tests and verify RED**

Run: `npx tsx --test src/lib/invitations/palette.test.ts`

Expected: FAIL because `extractInvitationPalette` is absent.

- [ ] **Step 4: Implement bounded sampling and clustering**

Resize to fit within 160×160, flatten transparency onto white, convert to raw RGB, quantize each channel to 16-value buckets, count coverage, merge colors whose RGB Euclidean distance is below 28, discard clusters below 1% coverage, and return at most eight uppercase six-digit hex colors.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `npx tsx --test src/lib/invitations/palette.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/invitations/palette.ts src/lib/invitations/palette.test.ts
git commit -m "feat: extract invitation reference palettes"
```

---

### Task 4: Analyze the reference through a constrained vision boundary

**Files:**
- Create: `src/lib/invitations/reference-analyzer.ts`
- Create: `src/lib/invitations/reference-analyzer.test.ts`

**Interfaces:**
- Consumes: palette extraction and analysis/recipe normalizers.
- Produces: `analyzeInvitationReference(input, dependencies): Promise<InvitationReferenceAnalysis>` and `INVITATION_ANALYSIS_SCHEMA_VERSION = 1`.

- [ ] **Step 1: Write failing orchestration tests**

Test a valid response, prose around JSON, unknown enum values, missing factual evidence, conflicting palette output, and provider failure. The provider double returns the complete Anthropic text boundary; assertions target the normalized analysis, not the double.

```ts
test("combines sampled colors with constrained vision analysis", async () => {
  const result = await analyzeInvitationReference(input, {
    extractPalette: async () => ["#F3F0E5", "#245A38", "#B88A53"],
    analyzeVision: async () => validModelJson,
    now: () => new Date("2026-09-15T15:00:00Z"),
  });
  assert.deepEqual(result.paletteCandidates, ["#F3F0E5", "#245A38", "#B88A53"]);
  assert.equal(result.facts.find((fact) => fact.key === "honoreeNames")?.value, "Mercy & John");
  assert.equal(result.recipe.decoration.motif, "botanical");
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npx tsx --test src/lib/invitations/reference-analyzer.test.ts`

Expected: FAIL because the analyzer is absent.

- [ ] **Step 3: Implement the provider-independent analyzer**

Use the model `claude-haiku-4-5-20251001`, a maximum of 2,500 output tokens, and one base64 image block. The prompt must state that values are visible evidence only, confidence is `[0,1]`, absent facts are omitted, and presentation must use the exact recipe enums. Extract the first JSON object, parse it, normalize facts and recipe, then reconcile recipe palette roles against deterministic candidates.

Reject evidence longer than 160 characters, values longer than their event-field limits, malformed dates, and responses containing code-like presentation values.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npx tsx --test src/lib/invitations/reference-analyzer.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/invitations/reference-analyzer.ts src/lib/invitations/reference-analyzer.test.ts
git commit -m "feat: analyze invitation design references"
```

---

### Task 5: Add the authorized, rate-limited analysis endpoint

**Files:**
- Create: `src/app/api/invitations/events/[eventId]/analyze-reference/route.ts`
- Create: `src/app/api/invitations/events/[eventId]/analyze-reference/route.test.ts`
- Modify: `src/lib/invitations/media.ts`
- Modify: `src/lib/invitations/media.test.ts`

**Interfaces:**
- Consumes: existing `requireInvitationAccess`, event management lookup, analysis repository, and analyzer.
- Produces: `POST /api/invitations/events/:eventId/analyze-reference` returning `{ analysis, reused }`.

- [ ] **Step 1: Write failing route-policy and media-read tests**

Cover cross-origin 403, unauthorized 401, missing event 404, missing designed reference 409, unchanged cached analysis reuse, exhausted limit 429, invalid stored media 409, provider failure 502, and successful private persistence.

```ts
test("reuses matching analysis before reserving another paid attempt", async () => {
  const response = await handleAnalyze(request, context, dependenciesWithMatchingAnalysis);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { analysis: existingAnalysis, reused: true });
  assert.equal(attemptReservations, 0);
  assert.equal(providerCalls, 0);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npx tsx --test src/app/api/invitations/events/'[eventId]'/analyze-reference/route.test.ts src/lib/invitations/media.test.ts`

Expected: FAIL because the endpoint and private byte reader are absent.

- [ ] **Step 3: Add event-scoped private media reading**

Add `readInvitationMediaBytes(path, eventId, "designed_invite")`. Validate the path with `isInvitationMediaPathForEvent`, download through the service-role storage client, cap the returned buffer at `INVITATION_IMAGE_MAX_BYTES`, and run the existing MIME/magic validation before returning `{ bytes, mediaType }`.

- [ ] **Step 4: Implement the endpoint**

Order operations exactly: same-origin check → access check → event lookup → reference-path check → matching-analysis reuse → serialized reservation → private validated download → analysis → persistence → sanitized response. Set `maxDuration = 120`.

Return stable error codes: `reference_required`, `reference_invalid`, `analysis_rate_limited`, `analysis_unavailable`.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `npx tsx --test src/app/api/invitations/events/'[eventId]'/analyze-reference/route.test.ts src/lib/invitations/media.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/invitations/events/'[eventId]'/analyze-reference/route.ts src/app/api/invitations/events/'[eventId]'/analyze-reference/route.test.ts src/lib/invitations/media.ts src/lib/invitations/media.test.ts
git commit -m "feat: add invitation reference analysis endpoint"
```

---

### Task 6: Add import review and reviewed apply behavior to the editor

**Files:**
- Create: `src/components/invitations/ReferenceImportReview.tsx`
- Create: `src/components/invitations/ReferenceImportReview.interaction.test.tsx`
- Modify: `src/components/invitations/EventEditor.tsx`
- Modify: `src/components/invitations/EventEditor.interaction.test.tsx`
- Modify: `messages/en.json`
- Modify: `messages/es.json`
- Modify: `src/lib/invitations/notifications.test.ts`

**Interfaces:**
- Consumes: `InvitationReferenceAnalysis` from management projection.
- Produces: `ReferenceImportReview({ current, analysis, onApply })` and editor application into unsaved form state.

- [ ] **Step 1: Write failing review interaction tests**

Cover analysis loading/error/retry, current-versus-suggested display, low-confidence defaults, individual selection, apply-all-safe, apply-selected, and the requirement that applying marks the editor dirty without sending PATCH.

```tsx
test("applies reviewed facts and recipe to the form without saving or publishing", async () => {
  renderEditor({ analysis });
  await user.click(screen.getByRole("checkbox", { name: /honoree names/i }));
  await user.click(screen.getByRole("button", { name: /apply selected/i }));
  assert.equal((screen.getByLabelText(/honoree names/i) as HTMLInputElement).value, "Mercy & John");
  assert.match(screen.getByText(/unsaved changes/i).textContent ?? "", /unsaved/i);
  assert.equal(fetchCalls.filter((call) => call.method === "PATCH").length, 0);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npx tsx --test src/components/invitations/ReferenceImportReview.interaction.test.tsx src/components/invitations/EventEditor.interaction.test.tsx`

Expected: FAIL because the review component is absent.

- [ ] **Step 3: Implement the review component**

Use semantic fieldsets and checkboxes. Show evidence and confidence as plain language (`High`, `Review`, `Low`) rather than unexplained percentages. Default-select facts at `>= 0.85`; never default-select conflicting or invalid facts. Palette/type/layout groups can be selected independently.

- [ ] **Step 4: Wire the editor**

Rename upload helper copy so cover means “Full-screen opening photo” and designed invite means “Design reference.” Add **Analyze invitation**, progress state, stable error messages, and the review panel. Convert affected editor inputs to controlled draft state or a reducer so `onApply` can update visible form values without saving. Include `designRecipe` in the existing PATCH payload only after review application.

- [ ] **Step 5: Add English and Spanish copy with parity coverage**

Add keys for analysis action/state, media-role explanations, review headings, confidence labels, apply actions, and stable endpoint errors. Extend the existing locale-key parity test to include all new keys.

- [ ] **Step 6: Run tests and verify GREEN**

Run: `npx tsx --test src/components/invitations/ReferenceImportReview.interaction.test.tsx src/components/invitations/EventEditor.interaction.test.tsx src/lib/invitations/notifications.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/invitations/ReferenceImportReview.tsx src/components/invitations/ReferenceImportReview.interaction.test.tsx src/components/invitations/EventEditor.tsx src/components/invitations/EventEditor.interaction.test.tsx messages/en.json messages/es.json src/lib/invitations/notifications.test.ts
git commit -m "feat: review invitation reference imports"
```

---

### Task 7: Render the cover hero and recreated invitation

**Files:**
- Create: `src/components/invitations/InvitationHero.tsx`
- Create: `src/components/invitations/RecreatedInvitation.tsx`
- Modify: `src/components/invitations/PublicInvitation.tsx`
- Modify: `src/components/invitations/PublicInvitation.render.test.tsx`
- Modify: `src/components/invitations/InvitationPublicProvider.render.test.tsx`

**Interfaces:**
- Consumes: normalized `event.designRecipe`, `media.cover`, and existing public event content.
- Produces: the public full-screen opening and controlled responsive composition.

- [ ] **Step 1: Write failing public rendering tests**

```tsx
test("uses the cover as the opening and never emits the private designed reference", () => {
  const html = renderPublished({ cover, designedInvite, designRecipe: botanicalRecipe });
  assert.match(html, /data-invitation-hero="cover"/);
  assert.match(html, new RegExp(escapeRegExp(cover.url)));
  assert.doesNotMatch(html, new RegExp(escapeRegExp(designedInvite.url)));
});

test("renders a palette hero fallback when no cover exists", () => {
  const html = renderPublished({ cover: null, designedInvite, designRecipe: botanicalRecipe });
  assert.match(html, /data-invitation-hero="palette"/);
  assert.doesNotMatch(html, /designed-invite\.png/);
});
```

Also cover default-recipe compatibility, all composition families, content order, hidden count behavior, and unchanged RSVP availability.

- [ ] **Step 2: Run tests and verify RED**

Run: `npx tsx --test src/components/invitations/PublicInvitation.render.test.tsx src/components/invitations/InvitationPublicProvider.render.test.tsx`

Expected: FAIL because the current code prefers `media.designedInvite ?? media.cover`.

- [ ] **Step 3: Implement `InvitationHero`**

Render a `min-height` of 80–100dvh from the recipe, background image with `background-position` from focal coordinates, a palette overlay, names/title/date, and a localized scroll link to `#invitation-content`. Add keyboard-visible focus and respect reduced motion. Use palette fallback when `cover` is null.

- [ ] **Step 4: Implement `RecreatedInvitation`**

Map finite recipe properties to static class maps and CSS custom properties. Use one distinctive reference-derived device—frame/motif/divider—while keeping details and RSVP visually disciplined. Do not convert enum values into class names dynamically. Decorative motifs must be CSS or local, non-user-authored assets with `aria-hidden="true"`.

- [ ] **Step 5: Recompose `PublicInvitation`**

Remove `heroMedia = media.designedInvite ?? media.cover`. Pass only `media.cover` to `InvitationHero`; never pass designed reference media into a public child. Keep gallery/video, calendar, location, aggregates, and RSVP inside allowlisted content-order slots.

- [ ] **Step 6: Run tests and verify GREEN**

Run: `npx tsx --test src/components/invitations/PublicInvitation.render.test.tsx src/components/invitations/InvitationPublicProvider.render.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/invitations/InvitationHero.tsx src/components/invitations/RecreatedInvitation.tsx src/components/invitations/PublicInvitation.tsx src/components/invitations/PublicInvitation.render.test.tsx src/components/invitations/InvitationPublicProvider.render.test.tsx
git commit -m "feat: recreate responsive invitation designs"
```

---

### Task 8: Add separate AI-assisted wording

**Files:**
- Create: `src/lib/invitations/wording.ts`
- Create: `src/lib/invitations/wording.test.ts`
- Create: `src/app/api/invitations/events/[eventId]/suggest-wording/route.ts`
- Create: `src/app/api/invitations/events/[eventId]/suggest-wording/route.test.ts`
- Modify: `src/components/invitations/ReferenceImportReview.tsx`
- Modify: `src/components/invitations/ReferenceImportReview.interaction.test.tsx`
- Modify: `messages/en.json`
- Modify: `messages/es.json`

**Interfaces:**
- Produces: optional `{ description, rsvpPrompt, styleNote }` suggestions; consumes confirmed current event facts and extracted tone only.

- [ ] **Step 1: Write failing copy-boundary tests**

Test authorization, same-origin enforcement, factual input allowlist, length bounds, English/Spanish response, unsupported output rejection, and applying wording as unsaved editor content.

```ts
test("wording input excludes private owner and guest data", () => {
  const promptInput = buildInvitationWordingInput(event, analysis);
  assert.equal("notificationEmail" in promptInput, false);
  assert.equal("owner" in promptInput, false);
  assert.equal("rsvps" in promptInput, false);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npx tsx --test src/lib/invitations/wording.test.ts src/app/api/invitations/events/'[eventId]'/suggest-wording/route.test.ts src/components/invitations/ReferenceImportReview.interaction.test.tsx`

Expected: FAIL because wording generation is absent.

- [ ] **Step 3: Implement constrained wording generation**

Use current confirmed title, honorees, date, venue, locale, event type, and extracted tone. Do not send owner credentials, notification destinations, guest responses, or raw analysis evidence. Bound description to 600 characters, RSVP prompt to 180, and style note to 240. Omit rather than invent missing logistical facts.

- [ ] **Step 4: Implement endpoint and review UI**

Use the same origin/access/event checks as analysis. Label every result “AI suggestion,” allow individual selection, and apply to unsaved form state. Do not store wording separately from the normal event save.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `npx tsx --test src/lib/invitations/wording.test.ts src/app/api/invitations/events/'[eventId]'/suggest-wording/route.test.ts src/components/invitations/ReferenceImportReview.interaction.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/invitations/wording.ts src/lib/invitations/wording.test.ts src/app/api/invitations/events/'[eventId]'/suggest-wording/route.ts src/app/api/invitations/events/'[eventId]'/suggest-wording/route.test.ts src/components/invitations/ReferenceImportReview.tsx src/components/invitations/ReferenceImportReview.interaction.test.tsx messages/en.json messages/es.json
git commit -m "feat: suggest editable invitation wording"
```

---

### Task 9: Verify end-to-end privacy, responsiveness, and deployment readiness

**Files:**
- Modify: `src/lib/invitations/e2e-fixtures.ts`
- Modify: `tests/invitations/invitation-flow.spec.ts`
- Modify: `.env.example`
- Modify: `docs/superpowers/specs/2026-09-15-invitation-reference-recreation-design.md` only if verification reveals an approved contract correction

**Interfaces:**
- Consumes: the complete feature.
- Produces: automated proof that upload → analyze → review → save → preview → publish works without leaking the reference.

- [ ] **Step 1: Extend deterministic E2E fixtures**

Add a test-only analysis response and known cover/reference media while preserving the production guard (`NODE_ENV !== "production" && INVITATION_E2E_FIXTURES === "1"`). Never call Anthropic from E2E.

- [ ] **Step 2: Add browser scenarios**

At 390×844 and 1440×1000, verify:

1. owner analyzes a designed reference;
2. review does not mutate until apply;
3. apply marks unsaved state;
4. save persists the recipe;
5. preview disables RSVP;
6. public invitation begins with cover media;
7. designed reference URL/path is absent from public HTML;
8. recreated details and RSVP remain usable;
9. missing cover uses palette fallback;
10. keyboard navigation reaches review controls and the hero scroll action.

- [ ] **Step 3: Run the complete feature suites**

Run:

```bash
npx tsx --test src/lib/invitations/*.test.ts src/lib/supabase/*.test.ts
npx tsx --test src/components/invitations/*.test.ts src/components/invitations/*.test.tsx
npx playwright test tests/invitations/invitation-flow.spec.ts
npx tsc --noEmit
npx eslint src
npm run build
```

Expected: all tests and build pass; lint has no errors. Existing documented `<img>` warnings may remain only if unchanged by this feature.

- [ ] **Step 4: Perform security and privacy inspection**

Inspect a public `/invite/:slug` response and confirm it contains `designRecipe` and the signed cover URL but contains none of: `referenceAnalysis`, `designedInvitePath`, designed-reference signed URL, model identifier, evidence text, owner contact data, or rate-limit metadata.

- [ ] **Step 5: Document deployment configuration**

Keep the existing `ANTHROPIC_API_KEY`; add comments for the invitation analysis use, 120-second route duration, five-attempt hourly limit, and migration 046. Add no client-exposed AI secret.

- [ ] **Step 6: Commit**

```bash
git add src/lib/invitations/e2e-fixtures.ts tests/invitations/invitation-flow.spec.ts .env.example docs/superpowers/specs/2026-09-15-invitation-reference-recreation-design.md
git commit -m "test: verify invitation reference recreation"
```

---

## Self-review

- **Spec coverage:** Guest hero, reference privacy, factual extraction, deterministic palette, constrained AI, review-before-save, separate wording generation, persistence, rate limiting, cache reuse, failure states, responsive rendering, contrast, localization, and public projection privacy each map to Tasks 1–9.
- **Scope:** Pixel-perfect cloning, arbitrary/generated fonts, generated code, vector reconstruction, automatic publishing, and cover generation remain excluded.
- **Placeholder scan:** The plan contains no deferred implementation markers; every task names concrete files, interfaces, tests, commands, and expected outcomes.
- **Type consistency:** `InvitationDesignRecipe`, `InvitationReferenceAnalysis`, `analyzeInvitationReference`, and repository field names are defined once and consumed consistently by later tasks.
