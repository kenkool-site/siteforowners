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

## Fix Round 1 — 2026-09-14

### Outcome

Resolved all six blocking review findings. Cleanup now proves complete, exact-counted database pagination before deleting anything. MP4 validation uses movie/video timelines (not the first audio track) and container magic now permits explicit MP4 brands and exact WebM DocType only. Media mutations no longer remount dirty event fields. Singleton removal is a compare-and-clear operation before storage deletion. New gallery rows are finalized through an event-locked, service-role-only RPC in migration 039; the Task 7 RSVP migration is consequently reserved as 040 per the controller ruling.

### RED / GREEN evidence

- **Timeline/container/delete RED:** `npx tsx --test src/lib/invitations/media.test.ts` exited 1 — 13 passed, 4 failed because the MP4 timeline reader and conditional singleton remover were absent and loose magic admitted HEIC/Matroska. A second RED for default silent-MP4 validation exited 1 — 17 passed, 1 failed.
- **Cleanup RED:** `npx tsx --test src/lib/invitations/media-cleanup.test.ts` exited 1 because the fail-closed paginated cleanup boundary did not exist.
- **Atomic migration RED:** `npx tsx --test src/lib/invitations/media-migration-contract.test.ts` exited 1 with `ENOENT` for migration 039.
- **Dirty draft RED:** `npx tsx --test src/components/invitations/EventEditor.interaction.test.tsx` exited 1 — 5 passed, 2 failed; both upload and removal reset dirty title/venue fields.
- **Focused GREEN:** `npx tsx --test src/lib/invitations/media.test.ts src/lib/invitations/media-cleanup.test.ts src/lib/invitations/media-migration-contract.test.ts src/lib/invitations/validation.test.ts src/components/invitations/EventEditor.interaction.test.tsx src/components/invitations/EventEditor.render.test.tsx` exited 0 — 52 passed, 0 failed.

### Verification commands and exact results

| Command | Result |
| --- | --- |
| Focused command above | exit 0 — 52 passed, 0 failed |
| `rg --files src -g '*.test.ts' -g '*.test.tsx' -0 \| xargs -0 npx tsx --test` | exit 0 — 589 passed, 0 failed |
| `npx tsc --noEmit` | exit 0 |
| JSON parse plus recursive `invitations.editor` key comparison | exit 0 — JSON valid; 151 English/Spanish editor keys synchronized |
| `git diff --check` | exit 0 — no whitespace errors |

### Files changed

- Added `src/lib/invitations/media-cleanup.ts` and `media-cleanup.test.ts` for exact-count reference pagination, fail-closed completeness checks, and deletion behavior.
- Added `supabase/migrations/039_invitation_media_atomic.sql` and `src/lib/invitations/media-migration-contract.test.ts` for the event-row lock, hard cap, gap-safe sort allocation, and service-role-only RPC contract.
- Updated `src/lib/invitations/media.ts` and `media.test.ts` with explicit MP4/WebM identity checks, MP4 movie/video timeline parsing, silent/mismatched deterministic fixtures, atomic-cap rollback coverage, and conditional singleton-removal ordering.
- Updated the cleanup and media API routes to use the new boundaries, exact paginated queries, the gallery RPC, and conditional singleton clearing.
- Updated `EventEditor.tsx` and its interaction tests so only an accepted event save advances the uncontrolled-form reconciliation key; media upload/removal preserve dirty drafts.

### Self-review

- Both database reference sources request exact counts, stable ID ordering, and 1,000-row ranges until the declared total is collected. Missing/inconsistent totals, short pages, or any query error reject before the first storage delete. Tests cover 1,001 rows in each source, a second-page failure, missing count, and incomplete page.
- MP4 magic requires a structurally valid leading `ftyp` with an allowlisted MP4 major brand. WebM magic parses the bounded EBML header and requires exact `DocType=webm`; HEIC ISO-BMFF and Matroska-renamed-WebM fixtures are rejected.
- MP4 duration takes the maximum declared movie/video timeline and requires a video track, while `music-metadata` remains the server media parser and supplies WebM duration. A silent 45-second MP4 passes; a 120-second video/movie with 10-second audio is rejected.
- Singleton DELETE retains the initial event/path ownership check, then conditionally updates by event ID and the exact currently persisted path, requires a returned affected row, and deletes storage only afterward. The injected race test preserves a concurrent replacement's reference and object and returns `conflict`.
- The gallery RPC locks the owning event row before count/allocation/insert, so concurrent adds serialize and only twelve can commit. It uses `MAX(sort_order)+1`, not count, so gapped orders cannot collide. Public, anon, and authenticated execution are revoked; only service role is granted.
- RPC cap/finalization failure flows through the upload finalizer and deletes the new object. Existing replacement paths are deleted only after successful database finalization.
- No `any`, client-side service-role client, or secret exposure was introduced.

### Concerns / handoff

- No live Supabase instance was available. The transactional SQL is covered by migration contract tests and route-independent behavioral tests, but deployment smoke testing should execute migration 039 and race two gallery insert RPC calls at a count of eleven.
- The original report's statements that no migration was needed and that uniqueness alone enforced the concurrent gallery cap are superseded by this fix round.

## Fix Round 2 — 2026-09-14

### Outcome

Resolved the remaining cleanup-snapshot and malformed-container findings. Cron reference discovery is now one service-role RPC returning a scalar aggregate from one PostgreSQL statement/MVCC snapshot, eliminating both PostgREST row caps and offset-page churn. MP4 atom reads are version- and payload-bounded and require `music-metadata` to accept the container. WebM DocType handling is fixed-size, directly compared, fully bounded, and protected by fail-safe magic validation.

### RED / GREEN evidence

- **MP4/WebM RED:** `npx tsx --test src/lib/invitations/media.test.ts` exited 1 — 20 passed, 4 failed. The four-byte `mdhd` leaked into a sibling atom, version 2 was treated as version 0, parser-rejected MP4 fell back to the custom timeline, and oversized WebM DocType threw `RangeError`.
- **Snapshot behavior RED:** `npx tsx --test src/lib/invitations/media-cleanup.test.ts` exited 1 — 0 passed, 3 failed because cleanup still expected offset-page readers rather than one validated snapshot.
- **Snapshot migration RED:** `npx tsx --test src/lib/invitations/media-migration-contract.test.ts` exited 1 — 3 passed, 1 failed because migration 039 did not define the snapshot RPC.
- **Focused GREEN:** `npx tsx --test src/lib/invitations/media.test.ts src/lib/invitations/media-cleanup.test.ts src/lib/invitations/media-migration-contract.test.ts` exited 0 — 31 passed, 0 failed.

### Verification commands and exact results

| Command | Result |
| --- | --- |
| Focused command above | exit 0 — 31 passed, 0 failed |
| `rg --files src -g '*.test.ts' -g '*.test.tsx' -0 \| xargs -0 npx tsx --test` | exit 0 — 594 passed, 0 failed |
| `npx tsc --noEmit` | exit 0 |
| `git diff --check` | exit 0 — no whitespace errors |

### Files changed

- Updated `supabase/migrations/039_invitation_media_atomic.sql` with `get_invitation_media_reference_snapshot()`, a stable SQL/security-definer/empty-search-path JSONB aggregate RPC granted only to `service_role`.
- Updated the cron route and `media-cleanup.ts` to consume exactly one snapshot object, reject malformed/error results before deletion, and avoid database row pagination entirely.
- Updated cleanup and migration tests for a single 1,001-path snapshot, one-call semantics, malformed/error fail-closed behavior, the singleton/gallery aggregate contract, and RPC privilege isolation.
- Updated `media.ts` and deterministic fixtures/tests for atom-local field bounds, supported versions only, valid silent/mismatched MP4 containers, parser rejection precedence, and oversized/truncated EBML handling.

### Self-review

- The RPC returns every non-null designed-invite, cover, video, and gallery storage path through one `UNION ALL` subquery and one `jsonb_agg`; the cron never pages database references. PostgreSQL executes the scalar SQL function against one statement snapshot, so same-count delete/insert churn cannot shift an unseen boundary row.
- Cleanup validates that the RPC result is a non-array object with a `paths` array containing only non-empty strings. RPC errors or malformed values reject before the first call to storage removal.
- MP4 `mvhd`/`mdhd` accept only versions 0 and 1 and enforce their complete version-specific atom payload sizes before reading timescale/duration. `hdlr` requires its handler field to be atom-local and version 0. A malformed video timeline invalidates the whole custom result rather than falling back to movie duration.
- `music-metadata` must successfully parse every MP4 before the custom movie/video duration is trusted. Tests prove a custom-readable MP4 without the track header is rejected when the library rejects it, while a structurally valid silent MP4 remains accepted and a long-video/short-audio MP4 remains over-limit.
- WebM DocType must declare exactly four bytes and those bytes must equal `webm`; oversized and truncated EBML return `invalid_media_type`. Magic checks are also catch-guarded so no malformed header can escape as a route-level 500.
- The new RPC has a pinned empty search path and revokes PUBLIC, anon, and authenticated execution; no service-role capability crosses the server boundary and no `any` was introduced.

### Concerns / handoff

- No live PostgreSQL/Supabase instance was available. Migration contract and boundary behavior tests are green; deployment should smoke-test the scalar JSONB shape returned by Supabase RPC once migration 039 is applied.
