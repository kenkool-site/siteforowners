# Task 4 Report — Service image control in the founder editor

## Status: DONE

## What was implemented

1. **Created** `src/app/(admin)/clients/[tenantId]/edit/ServiceImageControl.tsx` — verbatim from the brief.
   - Client component `ServiceImageControl({ image, tenantId, onChange })`.
   - Uploads to `POST /api/admin/services/upload-image` (FormData: `image` + `tenant_id`), parses `{ url }` / `{ error }` response defensively (no `any`).
   - Reads `SERVICE_IMAGE_FILES` manifest, filters to keys prefixed `home_services/`, and renders a "Choose default" picker only when that list is non-empty (currently empty, so the picker button/grid do not render — expected, per the brief's own comment, since no `home_services/` entries exist yet in the manifest).
   - "Remove image" calls `onChange(undefined)`.

2. **Modified** `src/app/(admin)/clients/[tenantId]/edit/HomeServicesSiteEditor.tsx`:
   - Added `import { ServiceImageControl } from "./ServiceImageControl";`.
   - `ServicesSection` now takes a required `tenantId: string` prop.
   - Inside the per-service card, after the description block and before "Remove service", added the `<FieldLabel>Image</FieldLabel>` + `<ServiceImageControl>` block, wired to `updateService(index, { image })` (uses the existing spread-merge/patch pattern already in the file — `{ ...service, ...patch }` with `image: undefined` overwrites and `JSON.stringify` drops the key on save, per the brief's note).
   - Call site updated: `<ServicesSection draft={draft} contentLocale={contentLocale} tenantId={tenantId} onChange={setDraft} />`. Confirmed `tenantId` was already in scope in `HomeServicesSiteEditor` (line 751: `const tenantId = typeof tenant.id === "string" ? tenant.id : "";`), so no new prop threading was needed.

Diff is exactly the 4 hunks the brief specified: import, signature, JSX block insertion, call-site prop. No other lines touched.

## Verification

```
npx tsc --noEmit
```
Output: clean, no errors.

```
npm run lint
```
Output: `✔ No ESLint warnings or errors`

Both were run as `npx tsc --noEmit && npm run lint` per the brief; both passed with zero output/warnings (not even pre-existing ones surfaced).

## Files changed

- `src/app/(admin)/clients/[tenantId]/edit/ServiceImageControl.tsx` (new, 126 lines)
- `src/app/(admin)/clients/[tenantId]/edit/HomeServicesSiteEditor.tsx` (+12/-1)

## Commit

- `bda9d7f` — `feat(home-services): service image upload + defaults picker in founder editor`

## Self-review findings

- Verified `ServiceItem.image?: string` already exists in `src/lib/ai/types.ts` (added by an earlier task) — no type gap.
- Verified `/api/admin/services/upload-image/route.ts` exists (implemented in an earlier task) — endpoint contract matches what the component calls.
- Verified `FieldLabel` is defined locally in `HomeServicesSiteEditor.tsx` (~line 66) and used inside that file for the wiring snippet, not imported into the new component file — matches the brief's note.
- Verified `SERVICE_IMAGE_FILES` manifest currently has no `home_services/`-prefixed keys (existing keys are `barbershop/`, `braids/`, `locs/`, `nails/`, `restaurant/`, `salon/`), so `HOME_SERVICES_DEFAULTS` is `[]` today and the "Choose default" button/grid are correctly hidden until a later manifest regeneration adds home-services defaults. Expected per the brief, not a bug.
- No `any` used; both `unknown`-typed fetch-response parsing paths are narrowed before use.
- Both `<img>` tags carry the required `// eslint-disable-next-line @next/next/no-img-element` comment, and lint confirms no warnings.
- Mobile-first: the control uses `flex`/`grid` with `gap`, no fixed widths beyond the thumbnail (`h-16 w-24`), and the default-picker grid drops to `grid-cols-3` below `sm`, consistent with the rest of the editor's mobile-first patterns.
- Did not touch `serviceManifestImage` or the gallery URL validation added in earlier tasks, per the instruction not to touch them.
- Note: a stale `task-4-report.md` from an unrelated earlier "Task 4" (home-services estimate modal) previously occupied this path; it has been overwritten with this task's report.

## Concerns

None. Implementation matches the brief verbatim; verification is clean.
