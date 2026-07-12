# Task 5 Report: Image-first Recent Work editor

## What was implemented

All changes confined to `src/app/(admin)/clients/[tenantId]/edit/HomeServicesSiteEditor.tsx`:

1. **Import** — added `useRef` to the React import on line 3:
   `import { useState, useEffect, useRef } from "react";`

2. **New `ProjectImageControl` component** — inserted directly above `GalleryProjectsSection` (which had shifted from the brief's line 541 to line 552 due to Task 4's `ServiceImageControl` import). Handles a single image upload per Recent Work project via `POST /api/upload-images` (FormData field `images`), shows a thumbnail/placeholder, upload/replace and remove buttons, and inline error text. On upload success or removal it also clears `before_image`/`after_image` so legacy before/after pairs (which the live template still prefers) can't silently override the new single image.

3. **Reworked `GalleryProjectsSection` JSX** — dropped the three raw URL `TextInput`s (`before_image`, `after_image`, `image`) in favor of `<ProjectImageControl>`; captions relabeled "Description (English)/(Español)"; `service_name` kept as its own full-width input labeled "Service name (optional)"; `updateProject` helper untouched; section title changed from "Gallery projects" to "Recent work". Add/Remove project buttons unchanged.

Implementation matches the brief's code verbatim (verified via `git diff` before commit — no substantive deviations).

## Verification

```
npx tsc --noEmit
```
→ no output, exit clean.

```
npm run lint
```
→ `✔ No ESLint warnings or errors`

Both required by the brief passed with no errors or warnings.

## Files changed

- `src/app/(admin)/clients/[tenantId]/edit/HomeServicesSiteEditor.tsx` (+93/-10)

## Self-review findings

- Diff matches the brief's Step 1–3 code verbatim; no unrelated lines touched.
- `HomeServicesGalleryProject` type (`src/lib/home-services/types.ts`) confirms fields used (`image`, `before_image`, `after_image`, `caption_en`, `caption_es`, `service_name`) all exist and are optional strings — `undefined` patches are valid.
- `<img>` element correctly carries the `@next/next/no-img-element` eslint-disable comment, consistent with the codebase's other image controls (e.g. `ServiceImageControl` from Task 4).
- Confirmed `TextInput`, `SectionCard` already imported/defined in this file (used as-is, no new imports needed for those).
- Only the target file was staged and committed; a pre-existing unstaged change to `.superpowers/sdd/task-4-report.md` (from a prior task, not touched by this session) was left alone.

## Concerns

None. Change is self-contained, matches the brief exactly, and both verification commands pass cleanly.

## Fix: stale-index race

### Finding

In `GalleryProjectsSection`, `updateProject` patched `config.gallery_projects` by array **index**. `ProjectImageControl.handlePick` uploads asynchronously (`fetch` to `/api/upload-images`); if the admin removed or reordered an earlier project while an upload was in flight, the resolved `onChange` callback still closed over the stale `index` and patched whatever project now occupied that position — silently overwriting a different project's `image`/`before_image`/`after_image`.

### Fix

Changed `updateProject` in `GalleryProjectsSection` (`src/app/(admin)/clients/[tenantId]/edit/HomeServicesSiteEditor.tsx`) to key by project `id` instead of index:

```tsx
const updateProject = (id: string, patch: Partial<HomeServicesGalleryProject>) => {
  const next = config.gallery_projects.map((project) =>
    project.id === id ? { ...project, ...patch } : project,
  );
  onChange({ ...config, gallery_projects: next });
};
```

Updated all call sites in the section to pass `project.id` instead of `index`: the `ProjectImageControl` `onChange`, the two caption `TextInput`s (English/Español), and the `service_name` `TextInput`. `index` remains in the `map((project, index) => ...)` callback because it is still used by the "Remove project" button's `filter((_, i) => i !== index)` — no unused-variable cleanup was needed.

If a project is deleted mid-upload, `map` finds no element with the stale `id` and the patch becomes a harmless no-op, which is the desired behavior.

Scope: only `GalleryProjectsSection` in this one file was touched. `ServiceImageControl.tsx` and the Services section were not modified.

### Verification

```
npx tsc --noEmit
```
→ no output, exit clean.

```
npm run lint
```
→ `✔ No ESLint warnings or errors`

There is no unit test covering this editor component; these two commands are the covering verification for this change.

### Commit

`fix(home-services): key recent-work project updates by id to survive in-flight uploads`
