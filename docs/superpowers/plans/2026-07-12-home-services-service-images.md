# Home-Services Service Images & Image-First Recent Work Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Home-services service cards get images — editable (upload or defaults picker) from the founder site editor, auto-matched at render time from a `public/defaults/services/home_services/` folder — and the Recent Work editor becomes one uploaded image + bilingual caption per project.

**Architecture:** Render-time default resolution: a new manifest-only helper `serviceManifestImage()` returns a `/defaults/...` path only when the file actually exists, and `HomeServicesServices` falls back to it when a service has no explicit image. Editor changes live in the founder `HomeServicesSiteEditor` (a new `ServiceImageControl` per service, and a reworked `GalleryProjectsSection` with upload instead of URL inputs). Gallery-project image URLs get validated in `validateHomeServicesEditorConfig`, which both the client pre-save check and the `/api/update-site` route already call.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Tailwind, Supabase storage, node:test via `npx tsx --test`.

**Spec:** `docs/superpowers/specs/2026-07-12-home-services-service-images-design.md`

## Global Constraints

- TypeScript strict — no `any`.
- Mobile-first: all editor UI must work at 375px width.
- Tests run with `npx tsx --test <file>` (no `npm test` script exists).
- Lint: `npm run lint`. Manifest regen: `npm run gen:service-images`.
- Conventional commits (`feat:`, `fix:`, `docs:`); work on branch `feat/home-services-service-images` (created in Task 1 from current HEAD of `feat/home-services-template-foundation`).
- `<img>` in editor components needs `// eslint-disable-next-line @next/next/no-img-element` (see `ServiceRow.tsx:248` for the pattern).

---

### Task 1: `serviceManifestImage` helper + defaults folder

**Files:**
- Create: `public/defaults/services/home_services/README.md`
- Modify: `src/lib/templates/service-images.ts` (append after `serviceDefaultImage`, line 31)
- Test: `src/lib/templates/service-images.test.ts` (new file)

**Interfaces:**
- Consumes: `SERVICE_IMAGE_FILES` from `@/lib/templates/service-image-manifest`, `slugifyServiceName` (same file).
- Produces: `serviceManifestImage(type: BusinessType, name: string): string | undefined` — used by Task 2 (template) and Task 4 (editor picker uses the manifest directly, not this function).

- [ ] **Step 1: Create the branch**

```bash
git checkout -b feat/home-services-service-images
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/templates/service-images.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { serviceManifestImage } from "./service-images";
import { SERVICE_IMAGE_FILES } from "./service-image-manifest";

test("serviceManifestImage resolves a known manifest entry from the display name", () => {
  assert.equal(
    serviceManifestImage("braids", "Medium Box Braids"),
    SERVICE_IMAGE_FILES["braids/medium-box-braids"],
  );
});

test("serviceManifestImage applies slug rules (& -> and) before the lookup", () => {
  assert.equal(
    serviceManifestImage("locs", "Retwist & Style"),
    SERVICE_IMAGE_FILES["locs/retwist-and-style"],
  );
});

test("serviceManifestImage returns undefined when no default file exists", () => {
  assert.equal(serviceManifestImage("home_services", "Totally Unknown Service"), undefined);
  assert.equal(serviceManifestImage("home_services", ""), undefined);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx tsx --test src/lib/templates/service-images.test.ts`
Expected: FAIL — `serviceManifestImage` is not exported.

- [ ] **Step 4: Implement the helper**

Append to `src/lib/templates/service-images.ts`:

```ts
/**
 * Manifest-only lookup: the default image for a service if (and only if) a
 * matching file exists under `public/defaults/services/<type>/`. Unlike
 * `serviceDefaultImage`, a miss returns undefined instead of a guessed path,
 * so callers render "no image" rather than a 404 — right for verticals like
 * home_services where the defaults folder fills up incrementally.
 */
export function serviceManifestImage(type: BusinessType, name: string): string | undefined {
  return SERVICE_IMAGE_FILES[`${type}/${slugifyServiceName(name)}`];
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx tsx --test src/lib/templates/service-images.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Create the defaults folder with README**

Create `public/defaults/services/home_services/README.md`:

```md
# Home-services default service images

Drop one image per service here, named by the service-name slug:

- "Lawn Mowing & Maintenance" → `lawn-mowing-maintenance.jpg`
- "Tree Trimming" → `tree-trimming.webp`

Slug rule: lowercase; `&` → `and`; apostrophes removed; every other run of
non-alphanumerics → `-` (see `slugifyServiceName` in
`src/lib/templates/service-images.ts`).

Allowed extensions: .jpg / .jpeg / .png / .webp. After adding, replacing, or
removing files, run:

    npm run gen:service-images

Any home-services service whose name slug matches a file here shows that image
automatically (an image uploaded on the service always wins). The site
editor's "Choose default" picker lists every image in this folder.
```

Then run: `npm run gen:service-images`
Expected: `src/lib/templates/service-image-manifest.ts` is unchanged (`git status` shows only the new README and test/helper edits) — the folder is empty of images, and the script ignores non-image files.

- [ ] **Step 7: Commit**

```bash
git add src/lib/templates/service-images.ts src/lib/templates/service-images.test.ts public/defaults/services/home_services/README.md
git commit -m "feat(home-services): add manifest-only default image lookup + defaults folder"
```

---

### Task 2: Render-time default images on service cards

**Files:**
- Modify: `src/components/templates/home-services/HomeServicesServices.tsx` (import block lines 1-10; card render lines 51-78)

**Interfaces:**
- Consumes: `serviceManifestImage` from Task 1.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the fallback**

In `HomeServicesServices.tsx`, add the import:

```ts
import { serviceManifestImage } from "@/lib/templates/service-images";
```

Inside the `services.map((service) => {` callback (line 51), alongside the existing `description` const, add:

```ts
const image = service.image || serviceManifestImage("home_services", service.name);
```

Then change the image block (lines 67-78) to use the resolved value — `service.image` becomes `image` in both the condition and the `src`:

```tsx
{image && (
  <div className="relative aspect-[16/10] w-full overflow-hidden">
    <Image
      src={image}
      alt=""
      fill
      className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
      unoptimized
    />
  </div>
)}
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/templates/home-services/HomeServicesServices.tsx
git commit -m "feat(home-services): fall back to folder defaults on service cards"
```

---

### Task 3: Validate gallery-project image URLs

**Files:**
- Modify: `src/lib/home-services/editor-validation.ts` (imports line 1-2; insert block before the `return errors.length` at line 164)
- Test: `src/lib/home-services/editor-validation.test.ts` (append)

**Interfaces:**
- Consumes: `isValidPersistedServiceImageUrl`, `PERSISTED_SERVICE_IMAGE_URL_ERROR` from `@/lib/validation/service-image-url`.
- Produces: `validateHomeServicesEditorConfig` now also errors on bad `gallery_projects[i].image|before_image|after_image` — automatically enforced client-side (`handleSave` in `HomeServicesSiteEditor.tsx:821`) and server-side (`/api/update-site` via `validateHomeServicesConfigUpdate`). Error `field` format: `gallery_projects.<index>.<fieldName>`, with `rowId` set to the project id.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/home-services/editor-validation.test.ts` (match the file's existing import style — it already imports `validateHomeServicesEditorConfig`; add `test`/`assert` imports only if writing helpers not already present):

```ts
test("rejects gallery project images that fail persisted-URL validation", () => {
  const result = validateHomeServicesEditorConfig({
    gallery_projects: [
      { id: "p1", image: "javascript:alert(1)" },
      { id: "p2", before_image: "http://192.168.1.5/x.jpg" },
    ],
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    const fields = result.errors.map((e) => e.field);
    assert.ok(fields.includes("gallery_projects.0.image"));
    assert.ok(fields.includes("gallery_projects.1.before_image"));
    assert.equal(result.errors[0]?.rowId, "p1");
  }
});

test("accepts local default paths, https URLs, and empty gallery image fields", () => {
  const result = validateHomeServicesEditorConfig({
    gallery_projects: [
      { id: "p1", image: "/defaults/services/home_services/lawn-mowing.jpg", caption_en: "Lawn" },
      { id: "p2", image: "https://example.com/photo.jpg" },
      { id: "p3", caption_en: "No image yet" },
    ],
  });
  assert.equal(result.ok, true);
});

test("rejects a non-list gallery_projects value", () => {
  const result = validateHomeServicesEditorConfig({ gallery_projects: "nope" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((e) => e.field === "gallery_projects"));
  }
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx tsx --test src/lib/home-services/editor-validation.test.ts`
Expected: the three new tests FAIL (no gallery validation yet); existing tests PASS.

- [ ] **Step 3: Implement the validation**

In `src/lib/home-services/editor-validation.ts`, add the import:

```ts
import {
  isValidPersistedServiceImageUrl,
  PERSISTED_SERVICE_IMAGE_URL_ERROR,
} from "@/lib/validation/service-image-url";
```

Insert before the final `return errors.length` in `validateHomeServicesEditorConfig` (after the service-areas block ending at line 162):

```ts
const galleryRows = source.gallery_projects;
if (galleryRows !== undefined && !Array.isArray(galleryRows)) {
  errors.push({
    field: "gallery_projects",
    reason: "Gallery projects must be a list.",
  });
} else if (Array.isArray(galleryRows)) {
  const IMAGE_FIELDS = ["image", "before_image", "after_image"] as const;
  galleryRows.forEach((value, index) => {
    const row = record(value);
    if (!row) return; // parseHomeServicesConfig drops malformed rows
    const rowId = trimmedString(row.id) || undefined;
    for (const field of IMAGE_FIELDS) {
      const url = trimmedString(row[field]);
      if (url && !isValidPersistedServiceImageUrl(url)) {
        errors.push({
          field: `gallery_projects.${index}.${field}`,
          reason: `Project image ${PERSISTED_SERVICE_IMAGE_URL_ERROR}.`,
          rowId,
        });
      }
    }
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test src/lib/home-services/editor-validation.test.ts`
Expected: PASS, including all pre-existing tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/home-services/editor-validation.ts src/lib/home-services/editor-validation.test.ts
git commit -m "feat(home-services): validate gallery project image URLs on save"
```

---

### Task 4: Service image control in the founder editor

**Files:**
- Create: `src/app/(admin)/clients/[tenantId]/edit/ServiceImageControl.tsx`
- Modify: `src/app/(admin)/clients/[tenantId]/edit/HomeServicesSiteEditor.tsx` — `ServicesSection` (lines 324-408) and its call site (line 982)

**Interfaces:**
- Consumes: `POST /api/admin/services/upload-image` (FormData: `image` file + `tenant_id`; returns `{ url: string }`, errors `{ error: string }`); `SERVICE_IMAGE_FILES` manifest.
- Produces: `ServiceImageControl({ image, tenantId, onChange }: { image: string | undefined; tenantId: string; onChange: (next: string | undefined) => void })` — also reused conceptually (not literally) by Task 5. `ServicesSection` gains a required `tenantId: string` prop.

- [ ] **Step 1: Create the component**

Create `src/app/(admin)/clients/[tenantId]/edit/ServiceImageControl.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { SERVICE_IMAGE_FILES } from "@/lib/templates/service-image-manifest";

const HOME_SERVICES_DEFAULTS = Object.entries(SERVICE_IMAGE_FILES)
  .filter(([key]) => key.startsWith("home_services/"))
  .map(([, path]) => path);

/**
 * Image picker for a home-services service row: upload to the service-images
 * bucket, or pick one of the shipped defaults from
 * public/defaults/services/home_services/ (picker hidden while that folder is
 * empty). Clearing falls back to the render-time slug match, if any.
 */
export function ServiceImageControl({
  image,
  tenantId,
  onChange,
}: {
  image: string | undefined;
  tenantId: string;
  onChange: (next: string | undefined) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState("");

  const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      if (tenantId) fd.append("tenant_id", tenantId);
      const res = await fetch("/api/admin/services/upload-image", { method: "POST", body: fd });
      const data: unknown = await res.json().catch(() => ({}));
      const body = (data ?? {}) as { url?: unknown; error?: unknown };
      if (!res.ok || typeof body.url !== "string") {
        setError(typeof body.error === "string" ? body.error : "Upload failed");
        return;
      }
      onChange(body.url);
    } catch {
      setError("Network error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div>
      <div className="flex items-start gap-3">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="h-16 w-24 rounded-lg border border-gray-200 object-cover" />
        ) : (
          <div className="flex h-16 w-24 items-center justify-center rounded-lg border border-dashed border-gray-200 text-xs text-gray-400">
            No image
          </div>
        )}
        <div className="flex flex-col gap-1 text-sm">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="text-left font-medium text-amber-700 hover:text-amber-900 disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Upload image"}
          </button>
          {HOME_SERVICES_DEFAULTS.length > 0 && (
            <button
              type="button"
              onClick={() => setPickerOpen((open) => !open)}
              className="text-left font-medium text-amber-700 hover:text-amber-900"
            >
              {pickerOpen ? "Hide defaults" : "Choose default"}
            </button>
          )}
          {image && (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="text-left text-xs text-red-600 hover:text-red-800"
            >
              Remove image
            </button>
          )}
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handlePick}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {pickerOpen && (
        <div className="mt-2 grid grid-cols-3 gap-2 rounded-lg border border-gray-100 p-2 sm:grid-cols-5">
          {HOME_SERVICES_DEFAULTS.map((path) => (
            <button
              key={path}
              type="button"
              onClick={() => {
                onChange(path);
                setPickerOpen(false);
              }}
              className={`overflow-hidden rounded-md border-2 ${
                image === path ? "border-amber-500" : "border-transparent hover:border-amber-300"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={path} alt="" className="aspect-[16/10] w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire it into `ServicesSection`**

In `HomeServicesSiteEditor.tsx`:

Add the import:

```ts
import { ServiceImageControl } from "./ServiceImageControl";
```

Change the `ServicesSection` signature (lines 324-332) to accept `tenantId`:

```tsx
function ServicesSection({
  draft,
  contentLocale,
  tenantId,
  onChange,
}: {
  draft: EditorDraft;
  contentLocale: HomeServicesLocale;
  tenantId: string;
  onChange: (next: EditorDraft) => void;
}) {
```

Inside the per-service card, after the description `<div>` (closes line 380) and before the "Remove service" button, add:

```tsx
<div className="mt-3">
  <FieldLabel>Image</FieldLabel>
  <ServiceImageControl
    image={service.image}
    tenantId={tenantId}
    onChange={(image) => updateService(index, { image })}
  />
</div>
```

Update the call site (line 982):

```tsx
<ServicesSection draft={draft} contentLocale={contentLocale} tenantId={tenantId} onChange={setDraft} />
```

Note: `updateService(index, { image: undefined })` works because `{ ...service, ...patch }` overwrites `image` with `undefined`, and `JSON.stringify` in `handleSave` then drops the key.

- [ ] **Step 3: Verify types and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors (lint warnings unrelated to these files are acceptable if pre-existing).

- [ ] **Step 4: Commit**

```bash
git add 'src/app/(admin)/clients/[tenantId]/edit/ServiceImageControl.tsx' 'src/app/(admin)/clients/[tenantId]/edit/HomeServicesSiteEditor.tsx'
git commit -m "feat(home-services): service image upload + defaults picker in founder editor"
```

---

### Task 5: Image-first Recent Work editor

**Files:**
- Modify: `src/app/(admin)/clients/[tenantId]/edit/HomeServicesSiteEditor.tsx` — imports (line 3), new `ProjectImageControl` component, `GalleryProjectsSection` (lines 541-592)

**Interfaces:**
- Consumes: `POST /api/upload-images` (FormData: `images` file(s); returns `{ urls: string[] }`, errors `{ error: string }`) — same endpoint `GalleryEditor` already uses from this editor; `HomeServicesGalleryProject` type.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add `useRef` to the React import**

Line 3 becomes:

```ts
import { useState, useEffect, useRef } from "react";
```

- [ ] **Step 2: Add `ProjectImageControl`**

Insert above `GalleryProjectsSection` (before line 541):

```tsx
/**
 * One display image per Recent Work project. Legacy before/after pairs still
 * render on the live site (the template prefers the pair), so uploading or
 * removing here also clears before_image/after_image — otherwise the old pair
 * would keep winning over the new upload.
 */
function ProjectImageControl({
  project,
  onChange,
}: {
  project: HomeServicesGalleryProject;
  onChange: (patch: Partial<HomeServicesGalleryProject>) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const displayImage = project.image || project.before_image || project.after_image;

  const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("images", file);
      const res = await fetch("/api/upload-images", { method: "POST", body: fd });
      const data: unknown = await res.json().catch(() => ({}));
      const body = (data ?? {}) as { urls?: unknown; error?: unknown };
      const url = Array.isArray(body.urls) ? body.urls[0] : undefined;
      if (!res.ok || typeof url !== "string") {
        setError(typeof body.error === "string" ? body.error : "Upload failed");
        return;
      }
      onChange({ image: url, before_image: undefined, after_image: undefined });
    } catch {
      setError("Network error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="flex items-start gap-3">
      {displayImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={displayImage} alt="" className="h-20 w-28 rounded-lg border border-gray-200 object-cover" />
      ) : (
        <div className="flex h-20 w-28 items-center justify-center rounded-lg border border-dashed border-gray-200 text-xs text-gray-400">
          No image
        </div>
      )}
      <div className="flex flex-col gap-1 text-sm">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="text-left font-medium text-amber-700 hover:text-amber-900 disabled:opacity-50"
        >
          {uploading ? "Uploading…" : displayImage ? "Replace image" : "Upload image"}
        </button>
        {displayImage && (
          <button
            type="button"
            onClick={() => onChange({ image: undefined, before_image: undefined, after_image: undefined })}
            className="text-left text-xs text-red-600 hover:text-red-800"
          >
            Remove image
          </button>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handlePick}
      />
    </div>
  );
}
```

- [ ] **Step 3: Rework `GalleryProjectsSection`**

Replace the body of `GalleryProjectsSection` (lines 553-591) — `updateProject` stays as is; the returned JSX becomes:

```tsx
return (
  <SectionCard title="Recent work">
    <div className="space-y-3">
      {config.gallery_projects.map((project, index) => (
        <div key={project.id} className="space-y-2 rounded-lg border border-gray-100 p-3">
          <ProjectImageControl
            project={project}
            onChange={(patch) => updateProject(index, patch)}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <TextInput value={project.caption_en || ""} onChange={(caption_en) => updateProject(index, { caption_en })} placeholder="Description (English)" />
            <TextInput value={project.caption_es || ""} onChange={(caption_es) => updateProject(index, { caption_es })} placeholder="Description (Español)" />
          </div>
          <TextInput value={project.service_name || ""} onChange={(service_name) => updateProject(index, { service_name })} placeholder="Service name (optional)" />
          <button
            type="button"
            onClick={() => onChange({ ...config, gallery_projects: config.gallery_projects.filter((_, i) => i !== index) })}
            className="text-xs text-red-600"
          >
            Remove project
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange({
            ...config,
            gallery_projects: [...config.gallery_projects, { id: crypto.randomUUID() }],
          })
        }
        className="text-sm text-amber-700"
      >
        Add project
      </button>
    </div>
  </SectionCard>
);
```

(The three URL `TextInput`s for `before_image`/`after_image`/`image` are gone; captions become "Description" placeholders; the section title changes from "Gallery projects" to "Recent work" to match the site section.)

- [ ] **Step 4: Verify types and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(admin)/clients/[tenantId]/edit/HomeServicesSiteEditor.tsx'
git commit -m "feat(home-services): image-first recent work editor with uploads"
```

---

### Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit test suite**

Run: `npx tsx --test src/lib/**/*.test.ts src/lib/*.test.ts`
(If glob expansion misbehaves in zsh, run: `find src -name '*.test.ts' | xargs npx tsx --test`)
Expected: all tests PASS — especially `default-services.test.ts` (home_services still on stock imagery), `service-images.test.ts`, `editor-validation.test.ts`, `service-image-url.test.ts`.

- [ ] **Step 2: Typecheck + lint + build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: clean build.

- [ ] **Step 3: End-to-end verify in the running app** (superpowers:verification-before-completion)

Start `npm run dev`, open a home-services preview's founder editor (`/clients/<tenantId>/edit`), and confirm:
1. Each service row shows the image control; uploading a JPG sets the thumbnail and, after Save, the service card on the preview shows it.
2. Dropping a test image named after a service (e.g. `lawn-mowing-maintenance.jpg`) into `public/defaults/services/home_services/`, running `npm run gen:service-images`, and restarting dev shows that image on the matching card with no per-service image set, and the "Choose default" picker appears in the editor. Remove the test image and regenerate the manifest afterwards if it was only for testing.
3. Recent Work editor shows upload + description fields only; uploading an image and saving renders it in the Recent Work section.
4. Saving a config with a bad URL hand-injected is rejected (covered by unit tests; skip manual check if awkward).

- [ ] **Step 4: Commit any fixes, then hand off**

Use superpowers:finishing-a-development-branch to decide merge/PR.
