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

## Fix Round 1 — concurrency, lifecycle validation, and credential isolation

### Changes

- `src/components/invitations/EventEditor.tsx` now disables the event form during a save, blocks all lifecycle controls until an explicit save completes, displays localized save-first guidance, and reconciles the returned normalized event into inputs and both previews (including event type, timezone/date, and venue).
- `src/components/invitations/EventEditor.interaction.test.tsx` adds browser-level regressions for save-time locking, dirty lifecycle blocking, normalized-save preview reconciliation, and isolated duplicate-email credential errors.
- `src/app/api/invitations/events/[eventId]/status/route.ts` now calls `validateStatusTransition`, so every transition back to `published` (including `reopen`) validates the current persisted event and applies `allowPastEvent` only for founders.
- `src/app/api/invitations/events/[eventId]/credentials/route.ts` is a founder-only credential operation. Event PATCH no longer performs owner writes, so a duplicate owner email cannot make a successful event write appear to have failed. Duplicate conflicts return an owner-email field error.
- `src/lib/invitations/validation.ts`, `repository-core.ts`, and `repository.ts` separate event updates from `InvitationOwnerCredentialUpdate`; repository tests exercise the independent owner-write failure boundary.
- `messages/en.json` and `messages/es.json` add matching save-first, credential-save, and duplicate-email copy.

### RED / GREEN evidence

- Inherited RED evidence in the original report remains historical evidence for the original Task 4 implementation; it was not rerun in this round.
- Observed RED in this round: `npx tsx --test src/components/invitations/EventEditor.interaction.test.tsx src/lib/invitations/validation.test.ts src/lib/invitations/repository.test.ts` initially produced **19 passed, 4 failed**. The failures were exactly the unimplemented inherited interaction regressions: inputs remained editable during save, dirty lifecycle controls were enabled, normalized save responses left the preview stale, and no independent credential form existed.
- Observed GREEN: the same focused command subsequently produced **23 passed, 0 failed**. `npx tsc --noEmit` exited **0**. The complete source-test run below produced **556 passed, 0 failed**.

### Commands and results

- `npx tsx --test src/components/invitations/EventEditor.interaction.test.tsx src/lib/invitations/validation.test.ts src/lib/invitations/repository.test.ts` — 23 passed, 0 failed.
- `npx tsc --noEmit` — exit 0.
- `node -e '…compare invitations.editor keys in messages/en.json and messages/es.json…'` — editor locale keys synchronized.
- `rg --files src -g '*.test.ts' -g '*.test.tsx' -0 | xargs -0 npx tsx --test` — 556 passed, 0 failed. Existing `next-intl` `ENVIRONMENT_FALLBACK` diagnostics remained non-failing.
- `git diff --check` — clean.

### Remaining concern

- This fix intentionally uses an independent credential request instead of a cross-table transaction. A credential failure leaves the independently saved event untouched and accurately reported; a future all-or-nothing combined editing experience would require a dedicated database RPC.

## Fix Round 2 — credential form state accuracy

### Changes

- `src/components/invitations/EventEditor.tsx` now tracks credential dirtiness independently from event dirtiness. Editing owner credentials enables the credential Save button and reports unsaved work; validation, duplicate-email, HTTP, and network failures preserve that state; only a successful credential response clears it.
- Credential HTTP form errors now use credential-specific localized copy rather than the generic event-save message. Duplicate owner-email errors remain field-specific.
- A successful credential save clears the sensitive PIN field and reports success without changing the independent event-form state.
- `src/components/invitations/EventEditor.interaction.test.tsx` now requires unsaved state before and after a duplicate rejection, and clean/saved state plus cleared PIN after an accepted credential save.

### RED / GREEN evidence

- Observed RED: after tightening the interaction tests, `npx tsx --test src/components/invitations/EventEditor.interaction.test.tsx` produced **3 passed, 2 failed** because edited credential forms still displayed “No unsaved changes.”
- Observed GREEN: the final interaction/render run produced **8 passed, 0 failed**; TypeScript completed with exit 0 and invitation-editor locale keys matched.

### Commands and results

- `npx tsx --test src/components/invitations/EventEditor.interaction.test.tsx src/components/invitations/EventEditor.render.test.tsx` — 8 passed, 0 failed.
- `npx tsc --noEmit` — exit 0.
- `node -e '…compare invitations.editor keys in messages/en.json and messages/es.json…'` — editor locale keys synchronized.
- `git diff --check` — clean.
