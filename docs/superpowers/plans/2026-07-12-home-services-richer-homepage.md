# Richer Home-Services Homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configurable bilingual section copy, an editable three-step process, structured city/ZIP coverage, and the approved richer conversion-story homepage.

**Architecture:** Keep presentation data in validated `generated_copy.home_services_config` JSONB. Add focused public components and a focused founder content editor while preserving legacy coverage summaries, the estimate modal, and stylist templates.

**Tech Stack:** Next.js 14, React 18, strict TypeScript, Tailwind CSS, next-intl, Supabase JSONB, Node tests through `tsx`.

## Global Constraints

- Order: hero, trust, services, recent work, process, reviews/service areas, final CTA, footer.
- Structured city/ZIP lists are authoritative; maps are optional.
- Legacy `coverage_summary_en/es` remains a rendering fallback.
- Limits: 3 process steps, 20 service areas, 10 ZIPs per area.
- ZIPs are five digits or ZIP+4; duplicate areas and ZIPs are rejected.
- No migration or indexable city pages in this phase.
- Estimate delivery and stylist behavior remain unchanged.
- Mobile-first at 375 px, bilingual, strict TypeScript, no `any`.

---

### Task 1: Extend and validate the content model

**Files:**
- Modify: `src/lib/home-services/types.ts`
- Modify: `src/lib/home-services/types.test.ts`
- Create: `src/lib/home-services/content-defaults.ts`
- Create: `src/lib/home-services/content-defaults.test.ts`
- Create: `src/lib/home-services/editor-validation.ts`
- Create: `src/lib/home-services/editor-validation.test.ts`

**Interfaces:**
- Produces: `HomeServicesSectionCopy`, `HomeServicesProcessStep`, `HomeServicesServiceArea`, `HOME_SERVICES_CONTENT_DEFAULTS`, `resolveHomeServicesSectionCopy`, `resolveHomeServicesProcessSteps`, `parseZipInput`, `validateHomeServicesEditorConfig`.

- [ ] **Step 1: Write failing parser tests**

```typescript
test("parses structured process and areas while preserving legacy summary", () => {
  const config = parseHomeServicesConfig({
    coverage_summary_en: "Serving Richmond",
    process_steps: [{ id: "one", title_en: "Tell us", body_en: "Send details", title_es: "Cuéntenos", body_es: "Envíe detalles" }],
    service_areas: [{ id: "richmond", name: "Richmond", zip_codes: ["77406", "77469-1234"] }],
  });
  assert.equal(config.process_steps.length, 1);
  assert.deepEqual(config.service_areas[0].zip_codes, ["77406", "77469-1234"]);
  assert.equal(config.coverage_summary_en, "Serving Richmond");
});
```

- [ ] **Step 2: Run RED**

Run: `npx tsx --test src/lib/home-services/types.test.ts src/lib/home-services/content-defaults.test.ts`  
Expected: FAIL because new fields/modules do not exist.

- [ ] **Step 3: Add exact domain types**

```typescript
export interface HomeServicesProcessStep { id: string; title_en: string; body_en: string; title_es: string; body_es: string }
export interface HomeServicesServiceArea { id: string; name: string; zip_codes: string[]; note_en?: string; note_es?: string }
export interface HomeServicesSectionCopy { eyebrow_en?: string; title_en?: string; intro_en?: string; eyebrow_es?: string; title_es?: string; intro_es?: string }
```

Add `section_copy`, `process_steps`, `service_areas`, and `show_process` to the
config. Defensively trim, limit, validate ZIPs, and keep valid rows without
changing legacy summary behavior.

- [ ] **Step 4: Implement defaults and resolvers**

Provide bilingual copy for services, recent work, process, reviews, service
areas, and final CTA plus the approved three default process steps. Configured
values win; missing values fall back.

- [ ] **Step 5: Write validation tests**

Test malformed ZIP, duplicate ZIP across areas, duplicate case-insensitive area,
incomplete bilingual process row, and all row limits. Assert row paths such as
`service_areas.1.zip_codes`.

- [ ] **Step 6: Implement editor validation**

```typescript
export type HomeServicesEditorError = { field: string; reason: string };
export type HomeServicesEditorValidation = { ok: true; value: HomeServicesConfig } | { ok: false; errors: HomeServicesEditorError[] };
```

`parseZipInput` accepts comma/newline-separated input. Editor validation blocks
invalid input rather than silently repairing it.

- [ ] **Step 7: Verify and commit**

Run: `npx tsx --test src/lib/home-services/types.test.ts src/lib/home-services/content-defaults.test.ts src/lib/home-services/editor-validation.test.ts && npx tsc --noEmit`  
Expected: PASS.

```bash
git add src/lib/home-services
git commit -m "feat: model richer home-services content"
```

---

### Task 2: Seed truthful bilingual defaults

**Files:**
- Modify: `src/lib/home-services/preset-outdoor-services.ts`
- Modify: `src/lib/home-services/preset-outdoor-services.test.ts`
- Modify: `src/lib/home-services/build-preview-config.ts`
- Modify: `src/lib/home-services/build-preview-config.test.ts`

**Interfaces:**
- Consumes: shared defaults from Task 1.
- Produces: richer new previews with no invented service locations.

- [ ] **Step 1: Write failing preset test**

```typescript
test("seeds three bilingual process steps but no invented areas", () => {
  const config = parseHomeServicesConfig(buildOutdoorServicesPreset().generated_copy?.home_services_config);
  assert.equal(config.process_steps.length, 3);
  assert.ok(config.process_steps.every((step) => step.title_en && step.title_es));
  assert.deepEqual(config.service_areas, []);
});
```

- [ ] **Step 2: Run RED**

Run: `npx tsx --test src/lib/home-services/preset-outdoor-services.test.ts src/lib/home-services/build-preview-config.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Seed defaults**

Use shared section/process defaults. Keep `service_areas: []`; wizard addresses
may populate only legacy summaries and must not infer multiple cities or ZIPs.

- [ ] **Step 4: Verify and commit**

Run the two focused files; expect PASS.

```bash
git add src/lib/home-services/preset-outdoor-services.ts src/lib/home-services/preset-outdoor-services.test.ts src/lib/home-services/build-preview-config.ts src/lib/home-services/build-preview-config.test.ts
git commit -m "feat: seed richer home-services defaults"
```

---

### Task 3: Build the approved public composition

**Files:**
- Create: `HomeServicesSectionHeading.tsx`, `HomeServicesProcess.tsx`, `HomeServicesProofAndAreas.tsx`, `HomeServicesFinalCta.tsx` under `src/components/templates/home-services/`
- Modify: `HomeServicesTemplate.tsx`, `HomeServicesHero.tsx`, `HomeServicesServices.tsx`, `HomeServicesGallery.tsx`, `HomeServicesReviews.tsx`, `HomeServicesServiceAreas.tsx`
- Modify: `messages/en.json`, `messages/es.json`
- Modify: `tests/home-services-template-contract.test.mjs`

**Interfaces:**
- Consumes: resolved copy, process steps, structured areas, existing `onEstimate`.
- Produces: approved homepage order and responsive composition.

- [ ] **Step 1: Write failing public contracts**

Assert exact section order, shared estimate callback, process `grid-cols-1
md:grid-cols-3`, semantic area `<ul>`, ZIP rendering, mobile stacking, and
single-section full-width fallback.

- [ ] **Step 2: Run RED**

Run: `npx tsx --test tests/home-services-template-contract.test.mjs`  
Expected: FAIL.

- [ ] **Step 3: Implement heading and process components**

Render localized eyebrow/title/intro and an ordered three-step list. Use defaults
when configuration is absent; hide process only when `show_process === false`.

- [ ] **Step 4: Implement structured area rendering**

Render city, joined ZIPs, and localized note. When no structured rows exist,
render the current summary paragraph. Add a compact hero signal using the count
and first three area names, never an address.

- [ ] **Step 5: Implement proof composition and final CTA**

Two columns only when reviews and areas both exist; otherwise full width. Final
CTA includes only configured Call/Message actions and opens the existing modal.

- [ ] **Step 6: Wire resolved section copy and order**

Use approved order and preserve service preselection, preview mock mode, and
stylist routing.

- [ ] **Step 7: Verify and commit**

Run: `npx tsx --test tests/home-services-template-contract.test.mjs src/lib/home-services/content-defaults.test.ts && npx tsc --noEmit`  
Expected: PASS.

```bash
git add src/components/templates/home-services messages tests/home-services-template-contract.test.mjs
git commit -m "feat: enrich the home-services homepage"
```

---

### Task 4: Extend the founder editor safely

**Files:**
- Create: `src/app/(admin)/clients/[tenantId]/edit/HomeServicesContentEditor.tsx`
- Modify: `src/app/(admin)/clients/[tenantId]/edit/HomeServicesSiteEditor.tsx`
- Modify: `src/app/api/update-site/route.ts`
- Modify: `tests/home-services-editor-contract.test.mjs`

**Interfaces:**
- Consumes: `validateHomeServicesEditorConfig`, `parseZipInput`.
- Produces: paired section copy fields, process/area add-remove-reorder, row errors, validated save.

- [ ] **Step 1: Write failing editor contracts**

Assert paired EN/ES fields, process and area controls, ZIP input, `show_process`,
row-level errors, validation before fetch, and merge-based persistence.

- [ ] **Step 2: Run RED**

Run: `npx tsx --test tests/home-services-editor-contract.test.mjs`  
Expected: FAIL.

- [ ] **Step 3: Build the focused editor**

Use stable IDs, Up/Down controls with disabled boundaries, 44 px targets, and
retain values after validation errors. Show errors beside the matching row.

- [ ] **Step 4: Validate client and server paths**

Run validation before fetch. Defensively validate
`generated_copy.home_services_config` in update-site so crafted requests cannot
bypass limits; keep merge behavior and unrelated config.

- [ ] **Step 5: Verify and commit**

Run: `npx tsx --test tests/home-services-editor-contract.test.mjs src/lib/home-services/editor-validation.test.ts && npx tsc --noEmit`  
Expected: PASS.

```bash
git add 'src/app/(admin)/clients/[tenantId]/edit' src/app/api/update-site/route.ts tests/home-services-editor-contract.test.mjs
git commit -m "feat: edit richer home-services content"
```

---

### Task 5: Compatibility and release verification

**Files:**
- Modify only for feature defects found by verification.

- [ ] **Step 1: Run feature suite**

Run: `npx tsx --test src/lib/home-services/*.test.ts src/components/templates/home-services/*.test.ts src/components/templates/home-services/*.test.tsx tests/home-services-*.test.mjs tests/estimate-*.test.mjs`  
Expected: all feature tests pass.

- [ ] **Step 2: Run production gates**

Run: `npx tsc --noEmit && npm run build && git diff --check`  
Expected: exit 0.

- [ ] **Step 3: Verify public views**

At 375 px and desktop, verify order, city/ZIP readability, process, proof
fallback, bilingual switch, and all estimate CTAs. Verify a legacy summary-only
preview still renders.

- [ ] **Step 4: Verify founder editing**

On non-production test data, add/reorder rows, prove invalid ZIP/duplicates block
save, save valid data, reload, and verify both locales.

- [ ] **Step 5: Record final state**

Run: `git status --short && git log -6 --oneline`  
Expected: clean working tree and focused commits.
