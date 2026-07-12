# Home-Services Service Images & Image-First Recent Work — Design

**Date:** 2026-07-12
**Branch:** feat/home-services-template-foundation (continuation)
**Status:** Approved

## Goal

1. Services in the home-services template get an image, editable from the founder
   site editor, with default images the founder drops into a project folder.
2. The Recent Work section's editor becomes image-first and simple: one uploaded
   image + a short bilingual description per project (no more raw URL inputs, no
   before/after in the editor).

## Background (what already exists)

- `ServiceItem` (`src/lib/ai/types.ts`) already has `image?: string`, and
  `HomeServicesServices.tsx` already renders `service.image` when set. The gap is
  editor UI and defaults.
- Default-images system: `public/defaults/services/<type>/<slug>.<ext>` +
  auto-generated manifest (`src/lib/templates/service-image-manifest.ts`, rebuilt
  via `npm run gen:service-images`) + `serviceDefaultImage(type, name)`
  (`src/lib/templates/service-images.ts`). Every vertical uses it **except**
  `home_services`, whose 8 seed services use remote Pexels stock URLs
  (`default-services.ts`).
- Upload endpoints: `POST /api/admin/services/upload-image` (single file →
  `service-images` bucket, used by `ServiceRow`) and `POST /api/upload-images`
  (multi-file → `preview-images` bucket, used by `GalleryEditor`).
- Validation: `isValidPersistedServiceImageUrl`
  (`src/lib/validation/service-image-url.ts`) accepts `/defaults/...` paths,
  Supabase bucket URLs, and public HTTPS URLs. `/api/update-site` validates
  service images via `collectInvalidServiceImageErrors`, but does **not**
  validate `gallery_projects` image URLs.
- Surfaces: `home_services_config` (section copy, gallery projects) is edited
  only in the founder editor (`HomeServicesSiteEditor.tsx`). The owner admin
  edits generic services via `ServiceRow`, which already has image upload — no
  second surface to mirror.

## Decisions (user-confirmed)

- **Recent Work:** single image + caption per project in the editor. Existing
  `before_image`/`after_image` data still renders on the site; the editor stops
  offering those fields.
- **Defaults:** auto-match by service-name slug at render time from
  `public/defaults/services/home_services/`, replacing nothing in the DB.
- **Editor UI:** upload button **plus** a picker grid of the default images.
- **Auto-match approach:** render-time resolution (option A), not persist-on-save
  and not seed-time-only. Rationale: swapping a file in the folder updates every
  site instantly; services without a matching file show no image (never a 404);
  works for renamed/added services and already-saved tenants.

## Design

### 1. Defaults folder + manifest helper

- New folder `public/defaults/services/home_services/` with a short `README.md`
  explaining naming: files are named by service-name slug
  (`lawn-mowing-maintenance.jpg`, `tree-trimming.webp`; extensions
  jpg/jpeg/png/webp) and picked up by `npm run gen:service-images`.
- New helper in `src/lib/templates/service-images.ts`:
  `serviceManifestImage(type: BusinessType, name: string): string | undefined` —
  manifest lookup only, returns `undefined` on miss (unlike
  `serviceDefaultImage`, which guesses a `.jpg` path). No 404s from guessed
  paths.
- Seed services in `default-services.ts` keep Pexels URLs for now. Follow-up
  (out of scope): switch seeds to `withImages("home_services", ...)` once the
  folder covers all 8 seed names.

### 2. Template: services list

`HomeServicesServices.tsx` resolves the card image as
`service.image || serviceManifestImage("home_services", service.name)`.
Card layout unchanged.

### 3. Founder editor: service image control

In `ServicesSection` of
`src/app/(admin)/clients/[tenantId]/edit/HomeServicesSiteEditor.tsx`, each
service row gains an image control:

- Thumbnail preview when `image` is set.
- **Upload** — single file to `POST /api/admin/services/upload-image`
  (5MB max, jpeg/png/webp, `service-images` bucket), sets `image` to the
  returned URL. Same pattern as `ServiceRow`.
- **Choose default** — expands a small grid of all manifest entries under
  `home_services/`; clicking one sets `image` to its `/defaults/...` path.
- **Remove** — clears `image` (render-time auto-match then applies, if a
  matching default exists).

Persisted through the existing `handleSave` → `POST /api/update-site` flow;
`isValidPersistedServiceImageUrl` already accepts both URL forms.

### 4. Founder editor: Recent Work simplified

`GalleryProjectsSection` (same file) replaces the three raw URL text inputs
(`before_image`, `after_image`, `image`) with:

- One image per project: file picker → `POST /api/upload-images`
  (`preview-images` bucket), thumbnail preview, remove button. Sets `image`.
  The editor thumbnail falls back to `image || before_image || after_image`
  (same resolution as the template) so legacy before/after projects aren't
  blank; uploading replaces the project's display image by setting `image`.
- Caption (English) / Caption (Español) text inputs (existing fields).
- Optional service name (existing field).
- No defaults picker here — Recent Work is real job photos.

Types (`HomeServicesGalleryProject`) and template rendering
(`HomeServicesGallery.tsx`) keep `before_image`/`after_image` so existing data
still renders; only the editor drops them. `parseHomeServicesConfig` continues
to pass them through.

### 5. Validation

`/api/update-site` additionally validates `gallery_projects` image URLs
(`image`, `before_image`, `after_image` when present) with
`isValidPersistedServiceImageUrl`, rejecting the save with a clear per-project
error message on failure. `/defaults/...` paths remain accepted.

### 6. Tests

- Unit tests for `serviceManifestImage`: manifest hit, miss returns
  `undefined`, slug normalization (`&`, apostrophes, spaces).
- Tests for gallery-project URL validation in the update-site route logic
  (valid bucket URL, valid `/defaults/...`, rejected `javascript:`/private-host
  URL).
- Existing `default-services.test.ts` + manifest CI test continue to guard
  misnamed default files.

## Out of scope

- Owner-admin surface changes (already has image upload via `ServiceRow`).
- Switching the 8 seed services from Pexels to local defaults (follow-up
  one-liner once images exist).
- Mobile layout changes to the services or Recent Work sections.
- Any change to other verticals' image behavior.
