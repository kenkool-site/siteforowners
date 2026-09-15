# Contact-Idempotent RSVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make RSVP submission idempotent by event-scoped normalized contact, simplify guest follow-up UX, use celebrant names in notifications, and contain mobile dialog scrolling.

**Architecture:** Replace the event-locked RSVP RPC with a compatible contact-matching implementation that returns `created`, `updated`, or `unchanged`. Propagate the outcome through the existing application boundary, suppress unchanged notifications, and simplify the client without removing legacy fragment compatibility. Lock the document while the existing dialog is open and contain scrolling inside its card.

**Tech Stack:** PostgreSQL/Supabase RPC, Next.js 14, React 18, TypeScript, next-intl, Node test runner with tsx.

**Spec:** `docs/superpowers/specs/2026-09-15-contact-idempotent-rsvp-design.md`

## Global Constraints

- Contact matching is scoped to one invitation and uses normalized email or phone.
- If email and phone identify different rows, fail with `INVITE_CONTACT_CONFLICT` without mutation.
- Identical submissions return `unchanged`; changed submissions update atomically without double-counting capacity.
- Contact updates remain subject to public RSVP availability, passcode, deadline, capacity, and rate limits.
- Do not expose new edit links; continue accepting legacy URL-fragment credentials.
- Notification display names prefer `honoree_names` and fall back to `title`.
- Unchanged submissions send no owner or guest notification.
- Execute inline; do not dispatch subagents.

---

### Task 1: Atomic Contact-Based RSVP Mutation

**Files:**
- Create: `supabase/migrations/051_contact_idempotent_invitation_rsvp.sql`
- Create: `src/lib/invitations/contact-rsvp-migration-contract.test.ts`
- Modify: `src/lib/invitations/rsvp.ts`
- Modify: `src/lib/invitations/rsvp.test.ts`
- Modify: `src/lib/invitations/e2e-fixtures.ts`
- Modify: `src/lib/invitations/capacity-fixture.test.ts`

**Interfaces:**
- Produces: `RsvpMutationKind = "created" | "updated" | "unchanged"`.
- Produces: public API response field `outcome: RsvpMutationKind`.
- Produces: error code `contact_conflict` mapped from `INVITE_CONTACT_CONFLICT`.

- [ ] **Step 1: Write failing mutation and migration tests**

Add tests proving a second create request with matching normalized contact returns `unchanged`, a materially different request returns `updated` with the same RSVP ID, distinct email/phone matches return `contact_conflict`, and updates preserve submission/capacity accounting. Add a migration contract asserting event-row locking, normalized contact matching, conflict detection, and all three mutation kinds.

- [ ] **Step 2: Run tests and verify expected failures**

Run:
`npx tsx --test src/lib/invitations/rsvp.test.ts src/lib/invitations/capacity-fixture.test.ts src/lib/invitations/contact-rsvp-migration-contract.test.ts`

Expected: FAIL because `unchanged`, `contact_conflict`, and migration 051 do not exist.

- [ ] **Step 3: Implement the compatible database RPC**

Create migration 051 by replacing the current RPC signature from migration 043. Under the existing event lock:

```sql
SELECT array_agg(DISTINCT id)
INTO v_contact_ids
FROM public.invitation_rsvps
WHERE event_id = p_event_id
  AND ((v_email IS NOT NULL AND lower(email) = v_email)
    OR (v_phone IS NOT NULL AND regexp_replace(phone, '[^0-9+]', '', 'g') = v_phone));

IF cardinality(v_contact_ids) > 1 THEN
  RAISE EXCEPTION USING MESSAGE = 'INVITE_CONTACT_CONFLICT';
END IF;
```

Use the single contact match as `v_existing` when no explicit ID is supplied. Compare normalized editable fields with `IS NOT DISTINCT FROM`; return `unchanged` without an update when equal. Apply submission limits only when no existing row is selected. Exclude the selected row from capacity totals before evaluating the replacement party size. Preserve legacy token validation for explicit guest IDs and administrative ID-based updates.

- [ ] **Step 4: Propagate outcomes through TypeScript and fixtures**

Accept `unchanged` in `isSubmitRsvpRpcRow`, return the row mutation kind, map `INVITE_CONTACT_CONFLICT`, and include `outcome` in the public response. Update the fixture mutation to use the same contact selection/conflict/unchanged behavior. Return an edit token only for a genuinely created row, while the public response no longer emits an edit URL.

- [ ] **Step 5: Run focused tests and commit**

Run the Task 1 test command and `npx tsc --noEmit`; expect PASS. Commit as `feat: make invitation rsvp contact-idempotent`.

---

### Task 2: Notification Identity and Idempotent Delivery

**Files:**
- Modify: `src/lib/invitations/notifications.ts`
- Modify: `src/lib/invitations/notifications.test.ts`
- Modify: `src/lib/invitations/rsvp.ts`
- Modify: `src/lib/invitations/rsvp.test.ts`

**Interfaces:**
- Consumes: `RsvpMutationKind` and public response `outcome` from Task 1.
- Produces: `NotificationEventContext.honoreeNames: string` and `notificationDisplayTitle(event)`.

- [ ] **Step 1: Write failing notification tests**

Add tests asserting “New RSVP — Mercy & John” when `title` is “Save the Date in style” and `honoreeNames` is “Mercy & John,” title fallback when names are blank, no edit-token URL in new guest confirmation, and zero notification reservations for `unchanged`.

- [ ] **Step 2: Run and verify failures**

Run: `npx tsx --test src/lib/invitations/notifications.test.ts src/lib/invitations/rsvp.test.ts`

Expected: FAIL because notification context lacks honoree names and unchanged submissions still schedule notification work.

- [ ] **Step 3: Implement display title and unchanged suppression**

Select `honoree_names` in notification context and derive:

```ts
export function notificationDisplayTitle(event: Pick<NotificationEventContext, "title" | "honoreeNames">): string {
  return event.honoreeNames.trim() || event.title;
}
```

Use the result for owner email subject/body, SMS, and guest confirmations. Do not schedule notification dispatch when the mutation outcome is `unchanged`. Send guest confirmations with the invitation URL only and `editUrl: null` for all new submissions.

- [ ] **Step 4: Run focused tests and commit**

Run the Task 2 tests and `npx tsc --noEmit`; expect PASS. Commit as `fix: clarify invitation rsvp notifications`.

---

### Task 3: Simplify Guest RSVP Outcomes

**Files:**
- Modify: `src/components/invitations/RsvpForm.tsx`
- Modify: `src/components/invitations/RsvpForm.interaction.test.tsx`
- Modify: `src/components/invitations/RsvpForm.render.test.tsx`
- Modify: `messages/en.json`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: API response `outcome: "created" | "updated" | "unchanged"`.
- Preserves: parsing an explicit legacy fragment credential for previously issued links.

- [ ] **Step 1: Write failing form tests**

Assert that successful responses render saved/updated/already-responded copy based on `outcome`, never render “Copy edit link,” never call clipboard or localStorage for new responses, keep the form fields mounted, and label a subsequent submit “Update response.”

- [ ] **Step 2: Run and verify failures**

Run: `npx tsx --test src/components/invitations/RsvpForm.interaction.test.tsx src/components/invitations/RsvpForm.render.test.tsx`

Expected: FAIL because copy-link UI and edit URL storage are still present.

- [ ] **Step 3: Implement outcome-driven UX**

Remove copy state, copy handler, new-response localStorage writes, and copy-link button. Retain one-time legacy fragment parsing. Render localized keys `successCreated`, `successUpdated`, and `successUnchanged`; use `result?.ok ? t("update") : t("submit")` for the action after success. Clear the success state when a form field changes so the next response is not presented as already complete while editing.

- [ ] **Step 4: Run focused tests and commit**

Run Task 3 tests and `npx tsc --noEmit`; expect PASS. Commit as `fix: simplify guest rsvp follow-up`.

---

### Task 4: Contain RSVP Dialog Scrolling

**Files:**
- Modify: `src/components/invitations/InvitationRsvpDialog.tsx`
- Modify: `src/components/invitations/InvitationRsvpDialog.interaction.test.tsx`

**Interfaces:**
- Produces: open-dialog body lock that records/restores `window.scrollY` and prior inline body styles.

- [ ] **Step 1: Write failing scroll-lock tests**

Open the dialog at a nonzero mocked scroll position and assert `body.style.position === "fixed"`, negative `top`, and `width === "100%"`. Close by button and Escape and assert original styles plus `scrollTo(0, savedY)` are restored. Assert overlay/card contain `overscroll-contain` and the card has bounded vertical scrolling.

- [ ] **Step 2: Run and verify failures**

Run: `npx tsx --test src/components/invitations/InvitationRsvpDialog.interaction.test.tsx`

Expected: FAIL because the dialog currently does not lock or restore body scrolling.

- [ ] **Step 3: Implement scroll ownership**

In the open-state effect, capture `scrollY` and body inline styles, set fixed positioning/top/width/overflow, and restore them plus the saved scroll position in cleanup. Add `overflow-y-auto overscroll-contain` to the viewport overlay, `overscroll-contain` and bounded `max-height` to the card, and a sticky header so the close control remains reachable.

- [ ] **Step 4: Run focused tests and commit**

Run Task 4 tests and `npx tsc --noEmit`; expect PASS. Commit as `fix: contain invitation rsvp dialog scrolling`.

---

### Task 5: Integration Verification

**Files:**
- Modify only if verification exposes a regression.

**Interfaces:**
- Consumes all prior tasks; produces a deployable branch requiring migration 051 before application deployment.

- [ ] **Step 1: Run all tests**

Run: `/bin/zsh -lc "rg --files src -g '*.test.ts' -g '*.test.tsx' -0 | xargs -0 npx tsx --test"`

Expected: zero failures.

- [ ] **Step 2: Run static and production checks**

Run `npx tsc --noEmit`, `npm run lint`, and `npm run build`. Expect zero errors; document any non-blocking existing warnings.

- [ ] **Step 3: Inspect migration/deployment order and worktree**

Run `git diff --check`, `git status --short`, and verify migration 051 is committed before handing off deployment instructions.
