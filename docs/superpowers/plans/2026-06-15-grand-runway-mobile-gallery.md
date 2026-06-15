# Grand and Runway Mobile Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Grand and Runway use a no-crop, nine-image mobile gallery grid by default while preserving the existing slider as an owner- and founder-configurable option.

**Architecture:** Store one optional boolean at `generated_copy.section_settings.mobile_gallery_slider`; missing or false selects the new grid, while true selects the existing carousel. Keep image-limit logic in a small pure helper, keep mobile presentation inside `RunwayGallery`, and let both editor surfaces persist the same setting through their existing save paths.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript strict mode, Tailwind CSS, Supabase, Node test runner through `tsx`.

---

## File Map

- Create `src/components/templates/galleries/mobileGallery.ts` for the nine-image preview policy.
- Create `src/components/templates/galleries/mobileGallery.test.ts` for pure visibility-policy tests.
- Modify `src/components/templates/galleries/RunwayGallery.tsx` to conditionally render grid or slider on mobile.
- Modify `src/components/templates/TemplateOrchestrator.tsx` to type and pass the shared setting.
- Modify `tests/runway-template-polish.test.mjs` to protect the shared Grand/Runway rendering contract.
- Create `tests/mobile-gallery-settings-contract.test.mjs` to protect both editor surfaces and the owner API contract.
- Modify `src/app/site/[slug]/admin/photos/page.tsx` to load the slider preference.
- Modify `src/app/site/[slug]/admin/photos/PhotosClient.tsx` to edit, dirty-track, and save the preference.
- Modify `src/app/api/admin/images/route.ts` to validate, load, and preserve the preference.
- Modify `src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx` to expose the same preference to founders.

### Task 1: Add the Mobile Gallery Visibility Policy

**Files:**
- Create: `src/components/templates/galleries/mobileGallery.ts`
- Create: `src/components/templates/galleries/mobileGallery.test.ts`

- [ ] **Step 1: Write the failing helper tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  MOBILE_GALLERY_PREVIEW_LIMIT,
  getVisibleMobileGalleryImages,
  hasMoreMobileGalleryImages,
} from "./mobileGallery";

const images = Array.from({ length: 12 }, (_, index) => `image-${index + 1}`);

test("mobile gallery preview is limited to nine images", () => {
  assert.equal(MOBILE_GALLERY_PREVIEW_LIMIT, 9);
  assert.deepEqual(
    getVisibleMobileGalleryImages(images, false),
    images.slice(0, 9),
  );
});

test("expanded mobile gallery returns every image", () => {
  assert.equal(getVisibleMobileGalleryImages(images, true), images);
});

test("mobile gallery only offers expansion above nine images", () => {
  assert.equal(hasMoreMobileGalleryImages(images), true);
  assert.equal(hasMoreMobileGalleryImages(images.slice(0, 9)), false);
});
```

- [ ] **Step 2: Run the tests and verify the missing-module failure**

Run:

```bash
npx tsx --test src/components/templates/galleries/mobileGallery.test.ts
```

Expected: FAIL because `./mobileGallery` does not exist.

- [ ] **Step 3: Implement the pure visibility helper**

```ts
export const MOBILE_GALLERY_PREVIEW_LIMIT = 9;

export function getVisibleMobileGalleryImages<T>(
  images: T[],
  expanded: boolean,
): T[] {
  return expanded ? images : images.slice(0, MOBILE_GALLERY_PREVIEW_LIMIT);
}

export function hasMoreMobileGalleryImages(images: readonly unknown[]): boolean {
  return images.length > MOBILE_GALLERY_PREVIEW_LIMIT;
}
```

- [ ] **Step 4: Run the focused helper tests**

Run:

```bash
npx tsx --test src/components/templates/galleries/mobileGallery.test.ts
```

Expected: three passing tests.

- [ ] **Step 5: Commit the helper and tests**

```bash
git add src/components/templates/galleries/mobileGallery.ts src/components/templates/galleries/mobileGallery.test.ts
git commit -m "feat: add mobile gallery visibility policy"
```

### Task 2: Add the Default No-Crop Mobile Grid

**Files:**
- Modify: `src/components/templates/galleries/RunwayGallery.tsx`
- Modify: `tests/runway-template-polish.test.mjs`

- [ ] **Step 1: Add failing gallery source-contract assertions**

Extend the existing Runway gallery test with:

```js
assert.match(
  gallery,
  /mobileSliderEnabled\s*=\s*false/,
  "Runway gallery should default to the mobile grid",
);
assert.match(
  gallery,
  /getVisibleMobileGalleryImages/,
  "Runway gallery should use the tested nine-image visibility policy",
);
assert.match(
  gallery,
  /grid-cols-3/,
  "The default mobile gallery should use three columns",
);
assert.match(
  gallery,
  /object-contain/,
  "The default mobile gallery should preserve the complete source image",
);
assert.match(gallery, /See More Looks/, "Long galleries should offer expansion");
assert.match(gallery, /Show Less/, "Expanded galleries should be collapsible");
assert.match(
  gallery,
  /mobileSliderEnabled\s*&&/,
  "The existing carousel should only render when explicitly enabled",
);
```

- [ ] **Step 2: Run the contract test and verify it fails**

Run:

```bash
node --test tests/runway-template-polish.test.mjs
```

Expected: FAIL because the new prop, helper, grid, and expansion controls are absent.

- [ ] **Step 3: Add the grid prop, imports, and expansion state**

Update the component contract and state:

```ts
import {
  getVisibleMobileGalleryImages,
  hasMoreMobileGalleryImages,
} from "./mobileGallery";

interface RunwayGalleryProps {
  images: string[];
  colors: ThemeColors;
  mobileSliderEnabled?: boolean;
}

export function RunwayGallery({
  images,
  colors,
  mobileSliderEnabled = false,
}: RunwayGalleryProps) {
  const galleryImages = images;
  const galleryImageKey = galleryImages.join("\u0000");
  const [mobileGridExpanded, setMobileGridExpanded] = useState(false);
  const visibleMobileGridImages = getVisibleMobileGalleryImages(
    galleryImages,
    mobileGridExpanded,
  );
  const canExpandMobileGrid = hasMoreMobileGalleryImages(galleryImages);

  useEffect(() => {
    setMobileGridExpanded(false);
  }, [galleryImageKey]);
```

Keep hooks unconditional. In each carousel-only effect or callback, return immediately when `mobileSliderEnabled` is false so grid mode does not run autoplay timers, scrolling, or intersection observers.

- [ ] **Step 4: Replace the unconditional mobile carousel with a mode branch**

Wrap the current carousel block—from the mobile `div.md:hidden` opening tag through its matching closing tag—with `{mobileSliderEnabled && (...)}`. Do not alter the carousel's internal JSX. Then add the grid as a separate mutually exclusive block:

```tsx
{!mobileSliderEnabled && (
  <div className="md:hidden">
    <>
      <div className="grid grid-cols-3 gap-2">
        {visibleMobileGridImages.map((src, index) => (
          <div
            key={`mobile-grid-${src}-${index}`}
            className="relative aspect-square overflow-hidden border bg-[#0D0B08]"
            style={{ borderColor: `${gold}42` }}
          >
            <Image
              src={src}
              alt={`Editorial hair gallery image ${index + 1}`}
              fill
              className="object-contain"
              sizes="33vw"
              unoptimized
            />
          </div>
        ))}
      </div>
      {canExpandMobileGrid && (
        <button
          type="button"
          onClick={() => setMobileGridExpanded((expanded) => !expanded)}
          aria-expanded={mobileGridExpanded}
          className="mt-6 inline-flex min-h-12 w-full items-center justify-center border px-5 text-[0.68rem] font-black uppercase tracking-[0.24em] transition hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
          style={{ borderColor: `${gold}66`, color: gold }}
        >
          {mobileGridExpanded ? "Show Less" : "See More Looks"}
        </button>
      )}
    </>
  </div>
)}
```

Do not change the `hidden md:grid` desktop bento section.

- [ ] **Step 5: Run helper and gallery contract tests**

Run:

```bash
npx tsx --test src/components/templates/galleries/mobileGallery.test.ts
node --test tests/runway-template-polish.test.mjs
```

Expected: all tests pass.

- [ ] **Step 6: Commit the mobile gallery UI**

```bash
git add src/components/templates/galleries/RunwayGallery.tsx tests/runway-template-polish.test.mjs
git commit -m "feat: add no-crop mobile gallery grid"
```

### Task 3: Wire the Shared Setting Through Grand and Runway

**Files:**
- Modify: `src/components/templates/TemplateOrchestrator.tsx`
- Modify: `tests/runway-template-polish.test.mjs`

- [ ] **Step 1: Add failing shared-setting assertions**

Add a test:

```js
test("grand and runway share the optional mobile gallery slider setting", async () => {
  const orchestrator = await readFile(files.orchestrator, "utf8");

  assert.match(
    orchestrator,
    /mobile_gallery_slider\?:\s*boolean/,
    "Section settings should type the optional slider preference",
  );
  assert.match(
    orchestrator,
    /const mobileGallerySliderEnabled = ss\.mobile_gallery_slider === true/,
    "Missing settings should resolve to the grid",
  );
  assert.match(
    orchestrator,
    /<RunwayGallery[\s\S]*mobileSliderEnabled=\{mobileGallerySliderEnabled\}/,
    "The shared Grand/Runway gallery should receive the preference",
  );
});
```

- [ ] **Step 2: Run the contract test and verify it fails**

Run:

```bash
node --test tests/runway-template-polish.test.mjs
```

Expected: FAIL because the setting is not typed or passed.

- [ ] **Step 3: Type, resolve, and pass the setting**

Add to `SectionSettings`:

```ts
mobile_gallery_slider?: boolean;
```

Resolve beside the other section settings:

```ts
const mobileGallerySliderEnabled = ss.mobile_gallery_slider === true;
```

Pass it in the shared Grand/Runway branch:

```tsx
<RunwayGallery
  images={galleryImages}
  colors={colors}
  mobileSliderEnabled={mobileGallerySliderEnabled}
/>
```

- [ ] **Step 4: Run the contract test**

Run:

```bash
node --test tests/runway-template-polish.test.mjs
```

Expected: all tests pass.

- [ ] **Step 5: Commit the template wiring**

```bash
git add src/components/templates/TemplateOrchestrator.tsx tests/runway-template-polish.test.mjs
git commit -m "feat: configure Grand and Runway mobile galleries"
```

### Task 4: Add Owner Photos Control and API Persistence

**Files:**
- Create: `tests/mobile-gallery-settings-contract.test.mjs`
- Modify: `src/app/site/[slug]/admin/photos/page.tsx`
- Modify: `src/app/site/[slug]/admin/photos/PhotosClient.tsx`
- Modify: `src/app/api/admin/images/route.ts`

- [ ] **Step 1: Write failing owner-surface contract tests**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  photosPage: "src/app/site/[slug]/admin/photos/page.tsx",
  photosClient: "src/app/site/[slug]/admin/photos/PhotosClient.tsx",
  imagesRoute: "src/app/api/admin/images/route.ts",
  siteEditor: "src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx",
};

test("owner Photos loads and saves the shared mobile gallery setting", async () => {
  const page = await readFile(files.photosPage, "utf8");
  const client = await readFile(files.photosClient, "utf8");

  assert.match(page, /mobile_gallery_slider/, "Photos page should load the setting");
  assert.match(
    page,
    /initialMobileGallerySlider/,
    "Photos page should pass the setting to its client",
  );
  assert.match(
    client,
    /Mobile gallery slider/,
    "Photos should expose a plainly named owner toggle",
  );
  assert.match(
    client,
    /mobileGallerySlider/,
    "Photos should track the toggle in local state",
  );
  assert.match(
    client,
    /mobile_gallery_slider:\s*snapshotToSave\.mobileGallerySlider/,
    "Photos should include the preference in its save request",
  );
});

test("owner images API validates and preserves the mobile gallery setting", async () => {
  const route = await readFile(files.imagesRoute, "utf8");

  assert.match(route, /mobile_gallery_slider/, "Images API should expose the setting");
  assert.match(
    route,
    /typeof rawMobileGallerySlider !== "boolean"/,
    "Images API should reject non-boolean supplied values",
  );
  assert.match(
    route,
    /settings\.mobile_gallery_slider = mobileGallerySlider/,
    "Images API should update the nested setting",
  );
  assert.match(
    route,
    /const nextCopy = \{ \.\.\.copy, section_settings: settings \}/,
    "Images API should preserve sibling generated copy and section settings",
  );
});
```

- [ ] **Step 2: Run the contract tests and verify they fail**

Run:

```bash
node --test tests/mobile-gallery-settings-contract.test.mjs
```

Expected: FAIL because the owner page, owner client, and API do not expose the setting.

- [ ] **Step 3: Load the setting on the owner Photos server page**

Extend the loader return type and query:

```ts
async function loadPhotos(previewSlug: string | null): Promise<{
  images: string[];
  galleryVideoUrl: string | null;
  galleryVideoTitle: string | null;
  mobileGallerySlider: boolean;
}> {
```

Select `generated_copy`, resolve:

```ts
const copy = (data?.generated_copy as Record<string, unknown> | null) ?? {};
const settings =
  (copy.section_settings as Record<string, unknown> | undefined) ?? {};
const mobileGallerySlider = settings.mobile_gallery_slider === true;
```

Pass:

```tsx
<PhotosClient
  initialImages={images}
  initialGalleryVideoUrl={galleryVideoUrl}
  initialGalleryVideoTitle={galleryVideoTitle}
  initialMobileGallerySlider={mobileGallerySlider}
/>
```

- [ ] **Step 4: Add owner toggle state, dirty tracking, and payload**

Add the prop and snapshot field:

```ts
initialMobileGallerySlider: boolean;

interface PhotosSnapshot {
  images: string[];
  galleryVideoUrl: string | null;
  galleryVideoTitle: string;
  mobileGallerySlider: boolean;
}
```

Track and save it:

```ts
const [mobileGallerySlider, setMobileGallerySlider] = useState(
  initialMobileGallerySlider,
);

mobile_gallery_slider: snapshotToSave.mobileGallerySlider,
```

Render a simple owner-friendly control below `GalleryEditor`:

```tsx
<section className="rounded-[1.5rem] border border-warm-cream1 bg-white p-5 shadow-sm">
  <div className="flex items-center justify-between gap-4">
    <div>
      <h2 className="text-sm font-black text-warm-deep">Mobile gallery slider</h2>
      <p className="mt-1 text-xs font-bold leading-5 text-warm-textMuted">
        Off shows a clean photo grid. Turn it on for a swipeable slider in Grand and Runway.
      </p>
    </div>
    <button
      type="button"
      onClick={() => setMobileGallerySlider((enabled) => !enabled)}
      aria-pressed={mobileGallerySlider}
      aria-label="Mobile gallery slider"
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
        mobileGallerySlider ? "bg-pop-pink" : "bg-warm-cream1"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
          mobileGallerySlider ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  </div>
</section>
```

- [ ] **Step 5: Extend the images API snapshot and validation**

Add to `PreviewSnapshot` and `loadSnapshot`:

```ts
mobile_gallery_slider: boolean;
```

Resolve missing values to false:

```ts
mobile_gallery_slider: settings.mobile_gallery_slider === true,
```

Validate a supplied value without changing stored state when older callers omit it:

```ts
const rawMobileGallerySlider = b.mobile_gallery_slider;
const touchMobileGallerySlider = rawMobileGallerySlider !== undefined;
if (
  touchMobileGallerySlider &&
  typeof rawMobileGallerySlider !== "boolean"
) {
  return NextResponse.json(
    {
      error: "Validation failed",
      errors: [
        {
          field: "mobile_gallery_slider",
          reason: "must be a boolean",
        },
      ],
    },
    { status: 400 },
  );
}
const mobileGallerySlider = rawMobileGallerySlider as boolean | undefined;
```

Read-modify-write `generated_copy` when either nested setting is supplied:

```ts
const { data: existing } = await supabase
  .from("previews")
  .select("generated_copy")
  .eq("slug", slug)
  .maybeSingle();
const copy =
  (existing?.generated_copy as Record<string, unknown> | null) ?? {};
const settings = {
  ...((copy.section_settings as Record<string, unknown> | undefined) ?? {}),
};

if (touchAbout) settings.about_image_url = aboutImageUrl;
if (touchMobileGallerySlider) {
  settings.mobile_gallery_slider = mobileGallerySlider;
}

const nextCopy = { ...copy, section_settings: settings };
```

Use one update containing `images`, `generated_copy`, `gallery_video_url`, and `gallery_video_title` when `touchAbout || touchMobileGallerySlider`; retain the current images-only update otherwise. Preserve the existing about-image behavior by only changing `about_image_url` when `touchAbout` is true.

- [ ] **Step 6: Run owner contract and existing gallery-video contracts**

Run:

```bash
node --test tests/mobile-gallery-settings-contract.test.mjs
node --test tests/gallery-video-contract.test.mjs
```

Expected: all tests pass.

- [ ] **Step 7: Commit owner configuration**

```bash
git add tests/mobile-gallery-settings-contract.test.mjs \
  'src/app/site/[slug]/admin/photos/page.tsx' \
  'src/app/site/[slug]/admin/photos/PhotosClient.tsx' \
  src/app/api/admin/images/route.ts
git commit -m "feat: add owner mobile gallery setting"
```

### Task 5: Add the Founder SiteEditor Control

**Files:**
- Modify: `src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx`
- Modify: `tests/mobile-gallery-settings-contract.test.mjs`

- [ ] **Step 1: Add failing founder contract assertions**

```js
test("founder SiteEditor edits the same mobile gallery setting", async () => {
  const editor = await readFile(files.siteEditor, "utf8");

  assert.match(
    editor,
    /mobile_gallery_slider:\s*existingSettings\.mobile_gallery_slider === true/,
    "SiteEditor should default missing values to the grid",
  );
  assert.match(
    editor,
    /Mobile gallery slider/,
    "SiteEditor should expose the shared setting",
  );
  assert.match(
    editor,
    /toggleSection\("mobile_gallery_slider"\)/,
    "SiteEditor should update the shared section settings object",
  );
});
```

- [ ] **Step 2: Run the contract test and verify it fails**

Run:

```bash
node --test tests/mobile-gallery-settings-contract.test.mjs
```

Expected: the owner tests pass and the founder test fails.

- [ ] **Step 3: Initialize and render the founder toggle**

Add to the `sectionSettings` initializer:

```ts
mobile_gallery_slider: existingSettings.mobile_gallery_slider === true,
```

Add a dedicated row beneath the Gallery visibility toggle:

```tsx
{sectionSettings.show_gallery && (
  <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-amber-100 bg-amber-50/40 px-4 py-2.5">
    <div className="min-w-0">
      <span className="text-sm font-medium text-gray-800">
        Mobile gallery slider
      </span>
      <p className="mt-0.5 text-xs text-gray-600">
        Off uses the recommended nine-photo grid. On restores the swipeable Grand and Runway slider.
      </p>
    </div>
    <button
      type="button"
      onClick={() => toggleSection("mobile_gallery_slider")}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        sectionSettings.mobile_gallery_slider ? "bg-green-500" : "bg-gray-300"
      }`}
      aria-pressed={sectionSettings.mobile_gallery_slider}
      aria-label="Mobile gallery slider"
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          sectionSettings.mobile_gallery_slider
            ? "translate-x-[18px]"
            : "translate-x-0.5"
        }`}
      />
    </button>
  </div>
)}
```

No save-handler change is required because both save payloads already spread `sectionSettings`.

- [ ] **Step 4: Run the shared-setting contract**

Run:

```bash
node --test tests/mobile-gallery-settings-contract.test.mjs
```

Expected: all tests pass.

- [ ] **Step 5: Commit the founder control**

```bash
git add 'src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx' tests/mobile-gallery-settings-contract.test.mjs
git commit -m "feat: add founder mobile gallery setting"
```

### Task 6: Verify Behavior and Regression Safety

**Files:**
- Verify only; no planned source changes.

- [ ] **Step 1: Run all targeted tests together**

Run:

```bash
npx tsx --test src/components/templates/galleries/mobileGallery.test.ts
node --test tests/runway-template-polish.test.mjs tests/mobile-gallery-settings-contract.test.mjs tests/gallery-video-contract.test.mjs
```

Expected: all targeted tests pass.

- [ ] **Step 2: Run all TypeScript tests**

Run:

```bash
/bin/zsh -lc "npx tsx --test $(rg --files src -g '*.test.ts' | tr '\n' ' ')"
```

Expected: all TypeScript tests pass.

- [ ] **Step 3: Run the complete JavaScript contract suite**

Run:

```bash
node --test tests/*.test.mjs
```

Expected: all contract tests pass.

- [ ] **Step 4: Run strict TypeScript validation**

Run:

```bash
npx tsc --noEmit
```

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 5: Run a production build**

Run:

```bash
npm run build
```

Expected: Next.js production build completes successfully.

- [ ] **Step 6: Verify both editor surfaces and the public gallery in-browser**

Run:

```bash
npm run dev
```

Use the in-app Browser at 375px width to verify:

1. An owner Photos page shows **Mobile gallery slider**, saves it, and reloads with the same state.
2. Founder SiteEditor shows the same preference and updates Live Preview.
3. Grand and Runway default to a three-column grid.
4. Portrait and landscape images are fully visible without cropping.
5. A gallery with more than nine images initially shows nine.
6. **See More Looks** reveals the remaining images and **Show Less** collapses them.
7. Enabling the slider restores swipe, arrows, progress, and autoplay.
8. Desktop Grand and Runway retain the existing bento layout.

- [ ] **Step 7: Inspect the final diff**

Run:

```bash
git diff --check
git status --short
git log -6 --oneline
```

Expected: no whitespace errors; only intended feature files are changed; task commits are present.

- [ ] **Step 8: Commit any verification-only corrections**

If browser or build verification required a focused correction:

```bash
git add src/components/templates/galleries/RunwayGallery.tsx \
  src/components/templates/TemplateOrchestrator.tsx \
  'src/app/site/[slug]/admin/photos/page.tsx' \
  'src/app/site/[slug]/admin/photos/PhotosClient.tsx' \
  src/app/api/admin/images/route.ts \
  'src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx' \
  tests/runway-template-polish.test.mjs \
  tests/mobile-gallery-settings-contract.test.mjs
git commit -m "fix: polish mobile gallery controls"
```

If no correction was needed, do not create an empty commit.
