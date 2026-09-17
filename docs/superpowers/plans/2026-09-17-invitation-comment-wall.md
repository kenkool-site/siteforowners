# Invitation Comment Wall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional, text-only public guestbook with immediate publishing, spam controls, and owner/co-host/founder moderation.

**Architecture:** Store comments in an isolated invitation comment subsystem and perform public creation through one atomic Postgres RPC that enforces availability, deduplication, and rate limits. A passcode-aware public route serves the invitation wall, while protected event routes and a shared management component provide the portal controls. Public invitation and owner dashboard projections receive only the small comment data they need.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, next-intl, Supabase/Postgres, Tailwind CSS, Node test runner via `tsx` and JSDOM.

**Spec:** `docs/superpowers/specs/2026-09-17-invitation-comment-wall-design.md`

## Global Constraints

- `comment_wall_enabled` defaults to `false` for existing and new invitations.
- Public comments require a display name of 1-80 trimmed characters and a body of 1-1,000 trimmed characters.
- Anyone with access to the invitation may post; no RSVP, account, email address, or phone number is required.
- Public comments publish immediately and are newest first.
- The first version is text-only: no photos, replies, reactions, guest editing, approval queue, email, or SMS.
- Owners, active co-hosts, and founders may enable/disable, hide/restore, and permanently delete comments.
- Disabling the wall hides all comments but does not delete them or change individual visibility.
- Published and RSVP-closed invitations may show and accept comments; draft, offline, and expired invitations may not.
- A passcode-protected invitation must not expose or accept comments until the event-scoped passcode cookie is valid.
- Store only a one-way requester hash, never a raw IP address.
- Limit one requester to five created comments per invitation per rolling ten minutes.
- Identical event/requester/name/body submissions within two minutes return the original comment as a successful duplicate.
- Portal-only activity indicators are shared per event; no delivery notifications are sent.

---

## File Structure

**Create**

- `supabase/migrations/053_invitation_comment_wall.sql` — event flags, comments, short-lived submission controls, indexes, grants, and atomic submission RPC.
- `src/lib/invitations/comments.ts` — comment types, validation, projections, availability rules, cursor encoding, and orchestration interfaces.
- `src/lib/invitations/comments.test.ts` — pure domain, cursor, access, duplicate-result, and summary tests.
- `src/lib/invitations/comments-migration-contract.test.ts` — SQL schema, privilege, and RPC contract tests.
- `src/app/api/invitations/public/[slug]/comments/route.ts` — passcode-aware public list/create endpoint.
- `src/app/api/invitations/events/[eventId]/comments/route.ts` — protected list, toggle, review, moderation, and deletion endpoint.
- `src/components/invitations/InvitationCommentWall.tsx` — public list, pagination, and text-only post dialog.
- `src/components/invitations/InvitationCommentWall.interaction.test.tsx` — public wall interaction and scroll-lock tests.
- `src/components/invitations/GuestbookManager.tsx` — portal setting and comment moderation UI.
- `src/components/invitations/GuestbookManager.interaction.test.tsx` — toggle, hide/restore, and delete interaction tests.
- `src/app/invitations/manage/[eventId]/guestbook/page.tsx` — owner/co-host Guestbook page.
- `src/app/(admin)/admin/invitations/[eventId]/guestbook/page.tsx` — founder Guestbook page.

**Modify**

- `src/lib/invitations/types.ts` — event flag/review timestamp and public/management comment types.
- `src/lib/invitations/repository-core.ts` — map new event fields through management and public projections.
- `src/lib/invitations/repository.ts` — select new fields and implement comment persistence.
- `src/lib/invitations/e2e-fixtures.ts` — fixture event fields and in-memory comment operations.
- `src/lib/invitations/public-access.ts` — retain the wall flag in the safe client projection.
- `src/app/invite/[slug]/page.tsx` — load the initial authorized comment page.
- `src/app/invitations/preview/[eventId]/page.tsx` — pass an empty/disabled preview comment page without enabling posting.
- `src/components/invitations/PublicInvitation.tsx` — place Comment Wall after content/gallery/counts and before the footer.
- `src/components/invitations/PublicInvitation.render.test.tsx` — public placement and disabled-state assertions.
- `src/app/invitations/manage/[eventId]/page.tsx` — load the compact Guestbook summary.
- `src/components/invitations/OwnerGuestDashboard.tsx` — render Guestbook status/count/new indicator/link.
- `src/components/invitations/OwnerGuestDashboard.render.test.tsx` — dashboard summary assertions.
- `src/components/invitations/EventEditor.tsx` — add the mode-aware Guestbook management link.
- `messages/en.json` — English public and portal Guestbook copy.
- `messages/es.json` — Spanish public and portal Guestbook copy.

---

### Task 1: Database foundation and event projections

**Files:**
- Create: `supabase/migrations/053_invitation_comment_wall.sql`
- Create: `src/lib/invitations/comments-migration-contract.test.ts`
- Modify: `src/lib/invitations/types.ts`
- Modify: `src/lib/invitations/repository-core.ts`
- Modify: `src/lib/invitations/repository.ts`
- Modify: `src/lib/invitations/repository.test.ts`

**Interfaces:**
- Produces: `invitation_events.comment_wall_enabled`, `invitation_events.comment_wall_reviewed_at`.
- Produces: `invitation_comments(id,event_id,guest_name,body,is_hidden,created_at,updated_at)`.
- Produces: `submit_invitation_comment(p_event_id uuid,p_guest_name text,p_body text,p_ip_hash text,p_content_hash text)` returning `comment_id`, `guest_name`, `body`, `created_at`, and `outcome` (`created` or `duplicate`).
- Produces: `InvitationEvent.commentWallEnabled: boolean` and `commentWallReviewedAt: string | null`.

- [ ] **Step 1: Write the failing SQL contract test**

Assert that migration 053 adds both event columns with the required default, creates both comment tables with RLS enabled, revokes anonymous/authenticated access, declares the descending event/comment index, and grants only `service_role` execution on the RPC.

```ts
assert.match(sql, /comment_wall_enabled boolean NOT NULL DEFAULT false/i);
assert.match(sql, /CREATE TABLE public\.invitation_comments/i);
assert.match(sql, /CHECK \(char_length\(btrim\(guest_name\)\) BETWEEN 1 AND 80\)/i);
assert.match(sql, /CHECK \(char_length\(btrim\(body\)\) BETWEEN 1 AND 1000\)/i);
assert.match(sql, /CREATE OR REPLACE FUNCTION public\.submit_invitation_comment/i);
assert.match(sql, /GRANT EXECUTE .* TO service_role/i);
```

- [ ] **Step 2: Run the contract test and verify it fails**

Run: `npx tsx --test src/lib/invitations/comments-migration-contract.test.ts`

Expected: FAIL because migration 053 does not exist.

- [ ] **Step 3: Create the migration with an atomic submission RPC**

The RPC must lock the selected event, reject disabled/unavailable/expired events, purge submission-control rows older than one day for the same event/requester, return a matching comment from the last two minutes before consuming quota, enforce fewer than five created rows in ten minutes, insert the public comment, record `(event_id, ip_hash, content_hash, comment_id, created_at)`, and return the safe row. Use stable database exceptions `COMMENT_WALL_CLOSED` and `COMMENT_RATE_LIMITED`.

```sql
ALTER TABLE public.invitation_events
  ADD COLUMN comment_wall_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN comment_wall_reviewed_at timestamptz;

CREATE TABLE public.invitation_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.invitation_events(id) ON DELETE CASCADE,
  guest_name text NOT NULL CHECK (char_length(btrim(guest_name)) BETWEEN 1 AND 80),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 1000),
  is_hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

- [ ] **Step 4: Extend event types and repository projections**

Add snake-case fields to `InvitationManagementRow`/`InvitationPublicRow`, camel-case fields to `InvitationEvent`/`PublicInvitationEvent`, both columns to `MANAGEMENT_SELECT` and `PUBLIC_SELECT`, and exact mapping in both repository-core conversion functions.

```ts
commentWallEnabled: row.comment_wall_enabled,
commentWallReviewedAt: row.comment_wall_reviewed_at,
```

- [ ] **Step 5: Run focused tests**

Run: `npx tsx --test src/lib/invitations/comments-migration-contract.test.ts src/lib/invitations/repository.test.ts src/lib/invitations/repository-relationships.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/053_invitation_comment_wall.sql src/lib/invitations/comments-migration-contract.test.ts src/lib/invitations/types.ts src/lib/invitations/repository-core.ts src/lib/invitations/repository.ts src/lib/invitations/repository.test.ts
git commit -m "feat: add invitation comment storage"
```

### Task 2: Comment domain and repository boundary

**Files:**
- Create: `src/lib/invitations/comments.ts`
- Create: `src/lib/invitations/comments.test.ts`
- Modify: `src/lib/invitations/repository.ts`
- Modify: `src/lib/invitations/e2e-fixtures.ts`

**Interfaces:**
- Produces: `PublicInvitationComment`, `InvitationCommentForManagement`, `InvitationCommentPage`, `InvitationGuestbookSummary`, and `CommentMutationResult`.
- Produces: `parseInvitationCommentInput(input)` returning `{ ok: true, value: { guestName, body, honeypot } } | { ok: false, errors }`.
- Produces: `encodeCommentCursor({ createdAt, id })` and `decodeCommentCursor(value)`.
- Produces: `invitationCommentsRepository.listPublic`, `.submit`, `.summary`, `.listForManagement`, `.setEnabled`, `.markReviewed`, `.setHidden`, and `.remove`.

- [ ] **Step 1: Write failing domain tests**

Cover trimming, empty/overlong fields, non-object payloads, honeypot retention for the route, stable cursor round trips, malformed cursor rejection, lifecycle access for `published`/`rsvp_closed`, and new-count calculation from `commentWallReviewedAt`.

```ts
assert.deepEqual(parseInvitationCommentInput({ guestName: "  Ada  ", body: "  Congratulations!  ", website: "" }), {
  ok: true,
  value: { guestName: "Ada", body: "Congratulations!", honeypot: "" },
});
assert.equal(canUseInvitationCommentWall({ status: "rsvp_closed", expireAt: null, commentWallEnabled: true }, now), true);
```

- [ ] **Step 2: Run the domain tests and verify they fail**

Run: `npx tsx --test src/lib/invitations/comments.test.ts`

Expected: FAIL because the comments module does not exist.

- [ ] **Step 3: Implement the pure comment domain**

Use opaque base64url JSON cursors containing only ISO `createdAt` and UUID `id`. Public projection includes only `{ id, guestName, body, createdAt }`. Management projection additionally includes `isHidden` and `updatedAt`. Define stable result codes `comment_wall_closed`, `rate_limited`, `invalid_request`, and `event_unavailable`.

- [ ] **Step 4: Implement repository operations**

Use keyset predicates for `(created_at,id)` and page size 10 publicly. Management lists all rows newest first. Toggle and review mutations update only the addressed event. Hide/restore/delete mutations filter by both `event_id` and comment ID and return whether a row changed. Map RPC database errors to the stable domain codes without logging bodies or IP hashes.

- [ ] **Step 5: Add in-memory fixture support**

Add fixture comment storage, event defaults, and repository-compatible list/submit/summary/moderation operations so invitation E2E mode never reaches Supabase for this feature.

- [ ] **Step 6: Run focused tests**

Run: `npx tsx --test src/lib/invitations/comments.test.ts src/lib/invitations/repository.test.ts src/lib/invitations/public-client-projection.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/invitations/comments.ts src/lib/invitations/comments.test.ts src/lib/invitations/repository.ts src/lib/invitations/e2e-fixtures.ts
git commit -m "feat: add invitation comment domain"
```

### Task 3: Passcode-aware public comment API

**Files:**
- Create: `src/app/api/invitations/public/[slug]/comments/route.ts`
- Create: `src/lib/invitations/comments-public-route.test.ts`

**Interfaces:**
- Consumes: `parseInvitationCommentInput`, `canUseInvitationCommentWall`, comment repository operations, `getPublicInvitationBySlug`, event-state helpers, passcode-cookie verification, `getClientIp`, and `hashIp`.
- Produces: `GET /api/invitations/public/:slug/comments?cursor=...` and `POST /api/invitations/public/:slug/comments`.

- [ ] **Step 1: Write failing route-contract tests**

Read the route source and assert that both handlers resolve the exact slug, verify effective state and wall flag, require the event-scoped passcode cookie when configured, and that POST checks same-origin, parses input, hashes the requester address, hashes normalized content, and never logs the body.

```ts
assert.match(source, /getInvitationPasscodeCookieName\(invitation\.event\.id\)/);
assert.match(source, /verifyInvitationPasscodeSession/);
assert.match(source, /isSameOrigin\(request\)/);
assert.doesNotMatch(source, /console\.(?:error|info)\([^\n]*body/);
```

- [ ] **Step 2: Run the route test and verify it fails**

Run: `npx tsx --test src/lib/invitations/comments-public-route.test.ts`

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement shared public authorization inside the route**

Return 404-style `event_unavailable` for missing, draft, offline, expired, or failed-passcode access so the route does not reveal private event/comment state. Return `comment_wall_closed` with 409 only after the invitation itself is authorized but the wall is disabled.

- [ ] **Step 4: Implement GET and POST**

GET returns `{ comments, nextCursor }` with `cache-control: private, no-store`. POST returns 201 for `created`, 200 for `duplicate`, 400 for invalid input, 409 for a closed wall, and 429 for the rate limit. A populated honeypot returns `{ ok: true }` without calling submit.

- [ ] **Step 5: Run focused tests**

Run: `npx tsx --test src/lib/invitations/comments-public-route.test.ts src/lib/invitations/auth.test.ts src/lib/invitations/public-access.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add 'src/app/api/invitations/public/[slug]/comments/route.ts' src/lib/invitations/comments-public-route.test.ts
git commit -m "feat: expose public invitation comments"
```

### Task 4: Public Comment Wall UI

**Files:**
- Create: `src/components/invitations/InvitationCommentWall.tsx`
- Create: `src/components/invitations/InvitationCommentWall.interaction.test.tsx`
- Modify: `src/components/invitations/PublicInvitation.tsx`
- Modify: `src/components/invitations/PublicInvitation.render.test.tsx`
- Modify: `src/app/invite/[slug]/page.tsx`
- Modify: `src/app/invitations/preview/[eventId]/page.tsx`
- Modify: `messages/en.json`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `initialPage: InvitationCommentPage`, event slug, `enabled`, `preview`, and safe palette colors.
- Produces: `InvitationCommentWall` with an inline list, cursor pagination, and scroll-locked dialog.

- [ ] **Step 1: Write failing rendering and interaction tests**

Assert the wall is absent when disabled, appears after gallery/count content and before the footer when enabled, renders newest comments, opens the form from “Leave a note,” locks body scrolling, retains entered values after a failed fetch, prepends a successful comment once, and appends a “Show more” page without duplicates.

```tsx
assert.equal(container.textContent?.includes("Guestbook"), false);
assert.ok(html.indexOf('data-invitation-comment-wall="true"') < html.indexOf('data-invitation-footer="true"'));
```

- [ ] **Step 2: Run the UI tests and verify they fail**

Run: `npx tsx --test src/components/invitations/InvitationCommentWall.interaction.test.tsx src/components/invitations/PublicInvitation.render.test.tsx`

Expected: FAIL because the component and props do not exist.

- [ ] **Step 3: Implement the Comment Wall component**

Use invitation surface/text/accent values and `readableTextColor(accent)` for solid actions. The modal follows `InvitationRsvpDialog` body-lock/restore behavior, supports Escape and backdrop close, focuses the close button, uses an accessible live region, and does not clear form values until success. Disable the post action during submission.

- [ ] **Step 4: Wire authorized initial comments into public rendering**

After `resolvePublicInvitationPage` passes lifecycle and passcode checks, call `listPublicInvitationComments(event.id)` only when `commentWallEnabled` is true. Preview passes an empty page and disables posting. Add the wall below the ordered invitation article and above `InvitationFooter`.

- [ ] **Step 5: Add complete English and Spanish copy**

Include headings, invitation text, name/comment labels, character guidance, leave/post/posting/show-more actions, success, close, closed, invalid, rate-limited, and retry errors in both locale files.

- [ ] **Step 6: Run focused tests**

Run: `npx tsx --test src/components/invitations/InvitationCommentWall.interaction.test.tsx src/components/invitations/PublicInvitation.render.test.tsx src/lib/invitations/public-client-projection.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/invitations/InvitationCommentWall.tsx src/components/invitations/InvitationCommentWall.interaction.test.tsx src/components/invitations/PublicInvitation.tsx src/components/invitations/PublicInvitation.render.test.tsx 'src/app/invite/[slug]/page.tsx' 'src/app/invitations/preview/[eventId]/page.tsx' messages/en.json messages/es.json
git commit -m "feat: render public invitation guestbook"
```

### Task 5: Protected management API and moderation UI

**Files:**
- Create: `src/app/api/invitations/events/[eventId]/comments/route.ts`
- Create: `src/lib/invitations/comments-management-route.test.ts`
- Create: `src/components/invitations/GuestbookManager.tsx`
- Create: `src/components/invitations/GuestbookManager.interaction.test.tsx`
- Create: `src/app/invitations/manage/[eventId]/guestbook/page.tsx`
- Create: `src/app/(admin)/admin/invitations/[eventId]/guestbook/page.tsx`

**Interfaces:**
- Consumes: `requireInvitationAccess`, `isSameOrigin`, management comment repository operations, and existing owner/founder page authorization.
- Produces: protected GET/PATCH/DELETE comment operations and shared `GuestbookManager`.

- [ ] **Step 1: Write failing management route and interaction tests**

Assert every operation calls `requireInvitationAccess`, mutations require same-origin, IDs are UUID-validated, comment mutations are scoped by event, and delete requires explicit confirmation in the component. Exercise enabling, disabling, hiding, restoring, and deleting with mocked fetch responses.

- [ ] **Step 2: Run tests and verify they fail**

Run: `npx tsx --test src/lib/invitations/comments-management-route.test.ts src/components/invitations/GuestbookManager.interaction.test.tsx`

Expected: FAIL because the route and component do not exist.

- [ ] **Step 3: Implement the protected route**

GET returns the event flag and all non-deleted comments, including hidden rows. PATCH accepts exactly one discriminated command:

```ts
type GuestbookCommand =
  | { action: "set_enabled"; enabled: boolean }
  | { action: "mark_reviewed" }
  | { action: "set_hidden"; commentId: string; hidden: boolean };
```

DELETE accepts `{ commentId }`. Return 404 when the comment does not belong to the addressed event. Log only event/comment IDs and actor kind.

- [ ] **Step 4: Implement the shared management component**

Render the enable switch, visible/hidden badges, newest-first list, empty states, hide/restore controls, and a confirmed permanent delete action. Apply optimistic state only after a successful response, show recoverable row/form errors, and announce results through `aria-live`.

- [ ] **Step 5: Create owner/co-host and founder pages**

The owner page verifies the signed owner session and `invitationOwnerOwnsEvent`. The founder page relies on the protected admin layout. Both load event plus management comments, mark the shared review timestamp, wrap in `InvitationPublicProvider`, and render the same `GuestbookManager` with the appropriate back link.

- [ ] **Step 6: Run focused tests**

Run: `npx tsx --test src/lib/invitations/comments-management-route.test.ts src/components/invitations/GuestbookManager.interaction.test.tsx src/lib/invitations/access.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add 'src/app/api/invitations/events/[eventId]/comments/route.ts' src/lib/invitations/comments-management-route.test.ts src/components/invitations/GuestbookManager.tsx src/components/invitations/GuestbookManager.interaction.test.tsx 'src/app/invitations/manage/[eventId]/guestbook/page.tsx' 'src/app/(admin)/admin/invitations/[eventId]/guestbook/page.tsx'
git commit -m "feat: manage invitation guestbook"
```

### Task 6: Portal summaries and navigation

**Files:**
- Modify: `src/app/invitations/manage/[eventId]/page.tsx`
- Modify: `src/components/invitations/OwnerGuestDashboard.tsx`
- Modify: `src/components/invitations/OwnerGuestDashboard.render.test.tsx`
- Modify: `src/components/invitations/EventEditor.tsx`
- Modify: `messages/en.json`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `InvitationGuestbookSummary { enabled, totalCount, newCount }`.
- Produces: owner landing-page Guestbook card and mode-aware editor link (`/invitations/manage/:id/guestbook` for owners, `/admin/invitations/:id/guestbook` for founders).

- [ ] **Step 1: Write failing dashboard render tests**

Assert disabled/enabled copy, total and new counts, and the owner Guestbook link. Assert that zero new comments does not show an attention badge.

```tsx
assert.match(html, /Guestbook/);
assert.match(html, /3 new/);
assert.match(html, new RegExp(`/invitations/manage/${event.id}/guestbook`));
```

- [ ] **Step 2: Run the dashboard test and verify it fails**

Run: `npx tsx --test src/components/invitations/OwnerGuestDashboard.render.test.tsx`

Expected: FAIL because the dashboard has no Guestbook summary.

- [ ] **Step 3: Load and render the compact summary**

Fetch RSVP dashboard and Guestbook summary concurrently with independent error logging so one failure does not hide the other. Render the Guestbook card above the guest ledger without changing the guest list as the landing focus.

- [ ] **Step 4: Add editor navigation for both actor modes**

Add a clear Guestbook link in the editor header or response area using the correct mode-specific route. Do not place moderation controls inside the event save form.

- [ ] **Step 5: Add localized portal copy**

Include enabled/disabled, total, new, open, back, hide, restore, delete, confirmation, empty, status, and operation-error strings in English and Spanish.

- [ ] **Step 6: Run focused tests**

Run: `npx tsx --test src/components/invitations/OwnerGuestDashboard.render.test.tsx src/components/invitations/EventEditor.render.test.tsx src/lib/invitations/owner-dashboard-route-contract.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add 'src/app/invitations/manage/[eventId]/page.tsx' src/components/invitations/OwnerGuestDashboard.tsx src/components/invitations/OwnerGuestDashboard.render.test.tsx src/components/invitations/EventEditor.tsx messages/en.json messages/es.json
git commit -m "feat: surface guestbook in invitation portals"
```

### Task 7: Full verification and rollout handoff

**Files:**
- Modify only files required to correct failures found by the commands below.

**Interfaces:**
- Consumes: all prior task outputs.
- Produces: migration-ready, lint-clean, type-safe production build and deployment instructions.

- [ ] **Step 1: Run all invitation tests**

Run: `/bin/zsh -lc "npx tsx --test $(rg --files src -g '*.test.ts' -g '*.test.tsx' | tr '\n' ' ')"`

Expected: all tests PASS.

- [ ] **Step 2: Run static verification**

Run: `npx tsc --noEmit`

Expected: exit 0.

Run: `npm run lint`

Expected: exit 0 with no lint errors.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: exit 0 and all invitation routes compile.

- [ ] **Step 4: Review the final diff**

Run: `git diff --check && git status --short && git log --oneline -8`

Expected: no whitespace errors, no unexpected modified files, and the unrelated `.claude/worktrees/feat-request-site-page` entry remains untouched.

- [ ] **Step 5: Commit verification fixes if needed**

```bash
git status --short
git add src messages supabase/migrations/053_invitation_comment_wall.sql
git commit -m "fix: harden invitation comment wall"
```

Run the commit only when verification required a correction. Confirm from the
status output that `.claude/worktrees/feat-request-site-page` is not staged.

- [ ] **Step 6: Prepare rollout instructions**

The handoff must state that `supabase/migrations/053_invitation_comment_wall.sql` is applied before deploying application code, then give the six-step smoke test from the design: disabled absence, enable/post, public/portal visibility, hide/restore, disable/re-enable retention, and permanent deletion.
