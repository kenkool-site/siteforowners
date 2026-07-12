# Task 6 — Full Verification: `feat/home-services-service-images`

Branch: `feat/home-services-service-images`
Range verified: `241f3ec..f9d600a` (plus one fix commit `2179674` added during this task)
Date: 2026-07-12
Working dir: `/Users/aws/Downloads/web-project/siteforowners`

Files touched by the branch (`git diff --name-only 95d5ac0..HEAD`):

```
public/defaults/services/home_services/README.md
src/app/(admin)/clients/[tenantId]/edit/HomeServicesSiteEditor.tsx
src/app/(admin)/clients/[tenantId]/edit/ServiceImageControl.tsx
src/components/templates/home-services/HomeServicesServices.tsx
src/lib/home-services/editor-validation.test.ts
src/lib/home-services/editor-validation.ts
src/lib/templates/service-images.test.ts
src/lib/templates/service-images.ts
```

---

## Step 1 — Full unit test suite

Command:

```
find src -name '*.test.ts' | xargs npx tsx --test
```

Result: **458/458 pass, 0 fail, 0 cancelled.**

```
1..458
# tests 458
# suites 0
# pass 458
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 2573.235708
```

No Runway contract test failure was observed (the known pre-existing failure mentioned in a prior feature's ledger did not reproduce here — full green run, so the "confirm pre-existing on merge-base" fallback step was not needed).

---

## Step 2 — Typecheck + lint + build

### `npx tsc --noEmit`
No output (clean).

### `npm run lint`
```
> siteforowners@0.1.0 lint
> next lint

✔ No ESLint warnings or errors
```

### `npm run build`
```
> siteforowners@0.1.0 build
> next build

  ▲ Next.js 14.2.35
  - Environments: .env.local

   Creating an optimized production build ...
 ✓ Compiled successfully
   Linting and checking validity of types ...
   Collecting page data ...
 ⚠ Using edge runtime on a page currently disables static generation for that page
   Generating static pages (0/74) ...
   Generating static pages (74/74)
   Finalizing page optimization ...
   Collecting build traces ...
```
(Full route table omitted here — 74/74 static pages generated, no errors. `⚠ Using edge runtime...` is the standard Next.js edge-runtime notice, not a failure.)

**Result: clean.**

---

## Step 3 — Default-image auto-match smoke test

### 3a/3b — first attempt (per literal task script)

```
cp public/defaults/services/locs/loc-repair.jpg 'public/defaults/services/home_services/lawn-mowing-maintenance.jpg'
npm run gen:service-images
```

Manifest generated 45 entries, including:

```
"home_services/lawn-mowing-maintenance": "/defaults/services/home_services/lawn-mowing-maintenance.jpg",
```

(Pre-existing, unrelated warning also printed, present before this test and not caused by this branch:
`2 slug(s) have multiple files` for `braids/cornrows-feed-in-braids` and `braids/medium-box-braids` — stale duplicate `.jpg`/`.png` pairs already in the repo, untouched by this branch.)

### 3d — test file + inline verification

`npx tsx --test src/lib/templates/service-images.test.ts` → 3/3 pass.

Inline script:
```js
import { serviceManifestImage } from './src/lib/templates/service-images';
serviceManifestImage('home_services', 'Lawn Mowing & Maintenance')
```
→ **returned `undefined`, not the expected path.** MISMATCH.

### Root cause found (real bug, part of this branch's diff)

`public/defaults/services/home_services/README.md` (new in this branch) documents:

> `"Lawn Mowing & Maintenance" → lawn-mowing-maintenance.jpg`

But the actual `slugifyServiceName` in `src/lib/templates/service-images.ts` replaces `&` with `" and "` (surrounded by spaces, later collapsed to a single `-` by the non-alnum regex), and this exact behavior is asserted by the branch's own test:

```ts
// src/lib/templates/service-images.test.ts:13-18
test("serviceManifestImage applies slug rules (& -> and) before the lookup", () => {
  assert.equal(
    serviceManifestImage("locs", "Retwist & Style"),
    SERVICE_IMAGE_FILES["locs/retwist-and-style"],
  );
});
```

So `slugifyServiceName("Lawn Mowing & Maintenance")` actually produces `"lawn-mowing-and-maintenance"`, not `"lawn-mowing-maintenance"`. The README's own worked example contradicts the shipped, tested behavior. Confirmed with:

```
npx tsx -e "import { slugifyServiceName } from '.../service-images'; console.log(slugifyServiceName('Lawn Mowing & Maintenance'))"
# => "lawn-mowing-and-maintenance"
```

**Impact:** a founder following the README literally would name a file `lawn-mowing-maintenance.jpg`, run `gen:service-images`, and the image would silently never auto-match the "Lawn Mowing & Maintenance" service (by design, `serviceManifestImage` returns `undefined` rather than erroring on a miss — see the doc comment in `service-images.ts` — so there's no error, just a missing image).

### Fix applied

`public/defaults/services/home_services/README.md`: corrected the example to
`"Lawn Mowing & Maintenance" → lawn-mowing-and-maintenance.jpg`.

Committed as `2179674`:
```
fix(home-services): correct wrong slug example in defaults README
```

### Re-run smoke test with the correct filename

```
cp public/defaults/services/locs/loc-repair.jpg 'public/defaults/services/home_services/lawn-mowing-and-maintenance.jpg'
npm run gen:service-images
```

Manifest now contains:
```
"home_services/lawn-mowing-and-maintenance": "/defaults/services/home_services/lawn-mowing-and-maintenance.jpg",
```

`npx tsx --test src/lib/templates/service-images.test.ts` → 3/3 pass.

Inline verification:
```
npx tsx -e "
import { serviceManifestImage } from './src/lib/templates/service-images';
const result = serviceManifestImage('home_services', 'Lawn Mowing & Maintenance');
console.log('result:', result);
"
# result: /defaults/services/home_services/lawn-mowing-and-maintenance.jpg
# OK: matches expected path
```

**Result: the underlying auto-match feature works correctly** — the only defect was the misleading README example, now fixed.

### 3e — Cleanup

```
rm 'public/defaults/services/home_services/lawn-mowing-and-maintenance.jpg'
npm run gen:service-images
git status --short
```

`git status --short` after cleanup shows only the two pre-existing, unrelated modified report files (`task-4-report.md`, `task-5-report.md`) — the manifest is back to its original 44-entry state, tree is clean w.r.t. this test.

---

## Step 4 — NOT verified (requires running app / Supabase / browser)

The following in-browser editor flows were **not** exercised, per instructions (no dev server, no Supabase hit):

- `ServiceImageControl.tsx` upload button (drag/drop or file picker) end-to-end upload to Supabase Storage.
- The "Choose default" defaults picker UI listing files from `public/defaults/services/<type>/`.
- `HomeServicesSiteEditor.tsx` Recent Work editor: save/reload round-trip, and the in-flight-upload id-keying fix from commit `f9d600a` (keying project updates by id to survive in-flight uploads) — only covered indirectly by `editor-validation.test.ts` unit tests, not by an actual UI interaction.
- Any real Supabase Storage upload/validation path (`isValidPersistedServiceImageUrl`) under a live admin session.
- Client-visible rendering of `HomeServicesServices.tsx` with real tenant data in a browser.

## Release caveats

1. **Editor upload/defaults-picker/Recent-Work-editor UI is unverified** — needs a manual pass with a running dev server, Supabase credentials, and an admin session before shipping to a real client.
2. Per the "Duplicated Surfaces" project note, home-services service images should be checked in **both** the founder admin editor and any customer-facing preview/live equivalent, if one exists for this feature — not confirmed here since it's UI-only.
3. Two pre-existing, unrelated stale-duplicate warnings from `gen:service-images` (`braids/cornrows-feed-in-braids`, `braids/medium-box-braids` each have both `.png` and `.jpg` on disk) — not caused by this branch, but worth a follow-up cleanup ticket since they mask which file actually wins.

---

## Final-review fixes

Commit: `92e4938` — `fix(home-services): surface gallery errors per row and apply async image patches functionally`

File touched: `src/app/(admin)/clients/[tenantId]/edit/HomeServicesSiteEditor.tsx` (plus one new test in `src/lib/home-services/editor-validation.test.ts`).

### Finding 1 — gallery validation errors had no display surface

Added an `errors: HomeServicesEditorError[]` prop to `GalleryProjectsSection`, wired at the call site as `<GalleryProjectsSection config={draft.home_services_config} errors={configErrors} onChange={updateConfig} />`. Added a local `GalleryProjectErrors` component (mirrors the `Errors` helper in `HomeServicesContentEditor.tsx`): filters `configErrors` by `error.rowId === project.id`, falling back to `error.field.startsWith("gallery_projects.<index>.")` for errors without a `rowId`, rendered as `<p className="text-xs text-red-600">{reason}</p>` per project row — consistent with the existing red error text already used elsewhere in this section (e.g. `ProjectImageControl`'s upload error).

### Finding 2 — `ServiceImageControl` upload committed a stale full-draft snapshot keyed by index

Added `patchServiceImage(clientId, image)` in `HomeServicesSiteEditor`, using a functional `setDraft` update that maps `current.services` by `client_id` (guards on empty `clientId`, matching the recommended shape exactly). Added an `onImageChange` prop to `ServicesSection` and wired `ServiceImageControl`'s `onChange` to `(image) => onImageChange(service.client_id ?? "", image)` instead of the old index-based `updateService(index, { image })`. Synchronous text-input updates (`updateService` for name/description) were left unchanged, per the finding's guidance — they have no async gap.

### Finding 3 — `GalleryProjectsSection.updateProject` used a stale `config` snapshot

`updateConfig` in `HomeServicesSiteEditor` now accepts either a plain `HomeServicesConfig` or an updater function `(current) => HomeServicesConfig`, applied inside a functional `setDraft`. This is a widening change (existing callers passing a plain value are unaffected — verified by clean `tsc`). `GalleryProjectsSection`'s `onChange` prop type was updated to accept the same union, and `updateProject` now calls `onChange((current) => ({ ...current, gallery_projects: current.gallery_projects.map(...) }))` — fully functional end-to-end, so an in-flight project-image upload can no longer revert concurrent edits or resurrect a removed project. No `any` used.

### Minor 5 (optional, done)

Added `"fails closed on merged updates when stored config already has a bad gallery image url"` to `src/lib/home-services/editor-validation.test.ts`, asserting `validateHomeServicesConfigUpdate({ gallery_projects: [{ id: "p1", image: "javascript:alert(1)" }] }, { coverage_summary_en: "Serving Richmond" }).ok === false`.

### Verification

1. `npx tsx --test src/lib/home-services/editor-validation.test.ts` → **11/11 pass** (10 pre-existing + 1 new).
2. `npx tsc --noEmit` → clean, no output.
3. `npm run lint` → `✔ No ESLint warnings or errors`.

### Deviations from recommended shapes

None. All three fixes match the recommended shapes in the review verbatim (prop names `errors`/`onImageChange` chosen to fit existing naming conventions in the file, but behavior and structure match exactly).
