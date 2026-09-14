# Task 4 — Shared event editor and owner management routes

## Status and summary

Implemented the shared bilingual invitation editor, protected owner list/detail pages, founder reuse, event and lifecycle mutation routes, update/publish validation, repository management writes, and founder-only credential/limit controls.

The frontend-design pass follows the approved cool-plum event-binder direction: `#FBFAFC` canvas, `#2B2231` ink, `#F1EDF4` mist, `#6D456F` plum, restrained flat sections, Geist controls, and Fraunces only in the responsive invitation preview. Mobile uses one editing column, a horizontally scrollable five-section rail, an inline theme preview, and a sticky Save bar; desktop adds a narrow section rail and quiet preview/status sidebar.

## RED / GREEN

- Initial RED: `npx tsx --test src/lib/invitations/validation.test.ts src/components/invitations/EventEditor.render.test.tsx` produced 2 passes and 6 failures because `parseEventUpdate`, `validatePublishableEvent`, and `EventEditor` did not exist.
- Update/status repository RED: the focused repository/validation run produced 11 passes and 2 intended failures for absent update-row/status-command behavior, then passed after implementation.
- Publish chronology RED: 8 passed and 1 failed because incoherent publish timing was not yet rejected, then 9/9 passed.
- Founder credentials RED: 14 passed and 2 failed because founder credential normalization and hash-safe owner rows were absent, then passed after implementation.
- Mobile preview RED: 2 passed and 1 failed because the preview existed only in the desktop rail, then 3/3 passed after adding it to the mobile editing column.

## Verification

- `npx tsx --test src/lib/invitations/validation.test.ts src/components/invitations/EventEditor.render.test.tsx src/lib/invitations/repository.test.ts` — 19 passed, 0 failed.
- `npx tsc --noEmit` — exit 0.
- `rg --files src -g '*.test.ts' -g '*.test.tsx' -0 | xargs -0 npx tsx --test` — 549 passed, 0 failed. Existing `next-intl` server-render tests emit `ENVIRONMENT_FALLBACK` diagnostics but do not fail.
- `git diff --check` — clean.
- `messages/en.json` and `messages/es.json` parse successfully.

## Files

- Created `src/components/invitations/EventEditor.tsx` and `EventEditor.render.test.tsx`.
- Created `src/app/api/invitations/events/[eventId]/route.ts` and `status/route.ts`.
- Created `src/app/invitations/page.tsx` and `src/app/invitations/manage/[eventId]/page.tsx`.
- Modified `src/app/(admin)/admin/invitations/[eventId]/page.tsx` to reuse the normalized editor.
- Extended `src/lib/invitations/validation.ts`, `validation.test.ts`, `repository.ts`, `repository-core.ts`, and `repository.test.ts`.
- Added complete English/Spanish editor and owner-list messages in `messages/en.json` and `messages/es.json`.

## Self-review

- Every mutation rejects non-matching/missing Origin before using the accepted `requireInvitationAccess` guard. Founder identity comes from `admin_session`; owner identity comes from the signed invitation-owner cookie, never request data.
- Owner parsing drops founder limits and owner credentials. Founder PIN changes and shared passcodes are scrypt-hashed server-side. Neither hash is selected by management projections or returned by API responses; absent passcodes leave the stored hash untouched, and only `removePasscode: true` clears it.
- Start/end/deadline/expiry controls round-trip as event-timezone wall times. `endsAt` remains nullable and must be later than `startsAt`; deadline and expiry ordering are checked during edits and publish.
- Status commands are allowlisted and constrained by current state so `reopen` cannot bypass publish validation. Publish returns field errors for required content, future time (unless founder override), notification email, coherent timing, and media.
- One owner event redirects directly; multiple events use restrained binder cards. Founder and owner details pass the same `EditorEvent` projection to the same component, with founder mode solely revealing limits and credentials.

## Concerns / handoff

- Media validity in this task is limited to a safe, non-empty persisted media path. Task 5 owns MIME/size/duration validation and should pass its richer media result into publish validation.
- Event and founder-only owner-credential updates use two service-role writes; a rare second-write failure can leave event content saved while credentials remain unchanged. If cross-table atomic editing becomes operationally important, add a narrowly scoped database RPC.
- No live Supabase database was used; repository contracts and TypeScript integration were exercised locally.
