# Task 5 — Private media upload and validation

## Status

Implemented and self-reviewed on `feat/invitation-events-mvp`. The existing migration 036 already defines `invitation-media` as a private 50 MB bucket and revokes client-table access; this task adds the validated server upload/read/delete flow, cleanup cron, and editor controls without a new migration.

## RED / GREEN evidence

- **Media RED:** `npx tsx --test src/lib/invitations/media.test.ts` exited 1 because `./media` did not exist.
- **Media GREEN:** after the validation/path/signing/transaction/orphan implementation, the focused media suite passed. Follow-up RED cycles covered event/kind path ownership and signed management snapshots before those helpers were added.
- **Editor RED:** `npx tsx --test src/components/invitations/EventEditor.render.test.tsx` produced 3 passes and 2 intended failures because the four media slots, visible limits, and required gallery alt control were absent.
- **Direct-path RED:** `npx tsx --test src/lib/invitations/validation.test.ts` produced 12 passes and 1 intended failure because raw event PATCH input silently ignored direct media paths instead of rejecting them.
- **Gallery replacement RED:** the editor render suite produced 5 passes and 1 intended failure because gallery rows had Remove but not Replace controls.
- **Final GREEN:** all focused, editor, typecheck, and full-source commands below passed.

## Verification commands and exact results

| Command | Result |
| --- | --- |
| `npx tsx --test src/lib/invitations/media.test.ts src/lib/invitations/validation.test.ts` | exit 0 — 26 passed, 0 failed |
| `npx tsx --test src/components/invitations/EventEditor.render.test.tsx src/components/invitations/EventEditor.interaction.test.tsx` | exit 0 — 11 passed, 0 failed |
| `npx tsc --noEmit` | exit 0 |
| `rg --files src -g '*.test.ts' -g '*.test.tsx' -0 \| xargs -0 npx tsx --test` | first sandbox run could not create the tsx IPC socket (`EPERM`); approved rerun exited 0 — 574 passed, 0 failed |
| `git diff --check` | exit 0, no whitespace errors |
| JSON parse plus recursive `invitations.editor` key comparison | exit 0 — JSON valid and 161 English/Spanish editor keys synchronized |
| `npm ls music-metadata --depth=0` | exit 0 — `music-metadata@11.15.0` |

`npm run lint` could not execute project linting because ESLint reports the pre-existing `@next/next` plugin conflict between this worktree's `.eslintrc.json` and `../../.eslintrc.json`. TypeScript and all source tests are green.

## Files

- Added `src/lib/invitations/media.ts` and `media.test.ts`.
- Added `src/app/api/invitations/events/[eventId]/media/route.ts`.
- Added `src/app/api/cron/invitation-media-cleanup/route.ts`.
- Updated `src/components/invitations/EventEditor.tsx` and its render tests.
- Updated owner/founder event pages to provide signed initial media snapshots.
- Updated `src/lib/invitations/validation.ts` and its tests to reject direct media path PATCH fields.
- Updated `messages/en.json` and `messages/es.json` with matched media UI/error copy.
- Added `music-metadata` to `package.json` and `package-lock.json`.

## Self-review

- POST and DELETE require an exact same-origin request and accepted `requireInvitationAccess` authorization. POST resolves authorization and the event before calling `request.formData()`.
- Validation compares exact MIME, filename extension, and magic bytes for JPEG/PNG/WebP or MP4/WebM. Images stop at 10 MB; videos stop at 50 MB and require a finite positive duration of at most 60 seconds from server-side `music-metadata`.
- Every new object path is `{eventId}/{kind}/{randomUUID()}.{validatedExtension}`. Signed reads use the private bucket and exactly 900 seconds.
- Singleton columns and gallery rows are finalized only by the media route. Raw event PATCH rejects all three media fields, so newly stored paths prove passage through validation.
- Upload finalization deletes a new object after database failure. All singleton and gallery replacements finalize the database before deleting the old object. Gallery adds cap at 12; the existing `(event_id, sort_order)` uniqueness also prevents two concurrent twelfth inserts.
- DELETE first matches event authorization, event/kind path shape, and the persisted event column or gallery `id + event_id + storage_path` record before removing database and storage state.
- The cron requires a configured `CRON_SECRET`, recursively paginates the private bucket, collects all live singleton/gallery references, and deletes only unreferenced objects whose age is strictly greater than 24 hours.
- The frontend-design pass preserves Task 4's cool-plum flat event-binder language: functional ruled rows, compact previews, mobile-first controls, visible progress/errors/limits, and matched English/Spanish copy. Gallery alt text is required for add/replace, and new adds disable at 12 while Replace/Remove remain available.
- No `any` was introduced. Service-role construction remains in server-executed code and no secret or privileged client crosses the client boundary.

## Concerns / handoff

- No live Supabase/storage integration was available; database/storage adapters are compiler-checked and transaction ordering is exercised through dependency-injected behavioral tests.
- Deployment still must have migration 036 applied so the private bucket, invitation columns, gallery constraints, RLS, and revocations exist.
- `npm install` reported the repository's current audit total (29 vulnerabilities) and Node-engine warnings for transitive ESLint packages under Node 22.2.0; no unrelated dependency upgrades were attempted.
