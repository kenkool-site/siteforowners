# Mobile Service Editor UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the owner service editor stable and obvious on mobile by guiding owners to newly added services, preventing browser zoom and horizontal overflow, and keeping save controls above the floating navigation.

**Architecture:** Keep `ServicesClient` as the state owner for the service collection and save lifecycle. Add a small pure helper for creating new service records, pass a one-time autofocus signal into `ServiceRow`, and limit styling changes to responsive input sizing, add-on layout, and the fixed save bar.

**Tech Stack:** Next.js 14, React, TypeScript, Tailwind CSS, Node test runner with `tsx`

---

### Task 1: New Service Creation Helper

**Files:**
- Create: `src/lib/admin-services.ts`
- Create: `src/lib/admin-services.test.ts`

- [ ] **Step 1: Write the failing helper tests**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createBlankService } from "./admin-services";

test("createBlankService creates an expanded-ready blank service", () => {
  const service = createBlankService("new-service-id");
  assert.deepEqual(service, {
    name: "",
    price: "",
    duration_minutes: 60,
    client_id: "new-service-id",
  });
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npx tsx --test src/lib/admin-services.test.ts`

Expected: FAIL because `admin-services` does not exist.

- [ ] **Step 3: Implement the helper**

```ts
import type { ServiceItem } from "@/lib/ai/types";

export function createBlankService(clientId: string): ServiceItem {
  return {
    name: "",
    price: "",
    duration_minutes: 60,
    client_id: clientId,
  };
}
```

- [ ] **Step 4: Run the focused test**

Run: `npx tsx --test src/lib/admin-services.test.ts`

Expected: 1 passing test.

### Task 2: Guided Add-Service Flow

**Files:**
- Modify: `src/app/site/[slug]/admin/services/ServicesClient.tsx`
- Modify: `src/app/site/[slug]/admin/_components/ServiceRow.tsx`

- [ ] **Step 1: Track the newly added service ID**

Add `newServiceId` state in `ServicesClient`. In `add()`, create an ID, append `createBlankService(id)`, set the ID as the active new service, clear saved state, and allow the render cycle to create the row.

- [ ] **Step 2: Pass autofocus intent by stable service ID**

Pass `autoFocusName={s.client_id === newServiceId}` and `onAutoFocusComplete={() => setNewServiceId(null)}` into `ServiceRow`.

- [ ] **Step 3: Focus and scroll from the rendered row**

Add a `nameInputRef` in `ServiceRow`. When `autoFocusName` becomes true:

```ts
requestAnimationFrame(() => {
  containerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(() => {
    nameInputRef.current?.focus({ preventScroll: true });
    onAutoFocusComplete?.();
  }, 350);
});
```

Attach the ref to the service-name input and keep blank services expanded.

- [ ] **Step 4: Add a temporary inline cue**

When `autoFocusName` is true, render:

```tsx
<div className="rounded-xl bg-pink-50 px-3 py-2 text-xs font-black text-pink-700">
  New service added — complete the details, then save.
</div>
```

Place it below the primary name/price/duration fields.

### Task 3: Mobile Zoom and Overflow Fixes

**Files:**
- Modify: `src/app/site/[slug]/admin/_components/ServiceRow.tsx`
- Modify: `src/app/site/[slug]/admin/_components/ServiceReorderRow.tsx`

- [ ] **Step 1: Make form controls iPhone-safe**

Use `text-base sm:text-sm` on owner-editable text inputs, textareas, and selects. Use `text-base sm:text-xs` for add-on text and price inputs so mobile Safari never focuses a control below 16px.

- [ ] **Step 2: Constrain duration controls**

Add `min-w-0 max-w-full shrink-0` to the duration wrapper and use 16px select text on mobile.

- [ ] **Step 3: Replace overflowing add-on rows**

Change each add-on row to:

```tsx
<div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex sm:items-center">
```

Put the name input across the first mobile row, and group duration, price, and remove controls in a second container using `col-span-2 flex min-w-0 items-center gap-2 sm:contents`.

- [ ] **Step 4: Harden row width containment**

Add `w-full min-w-0` to service row wrappers and `overflow-x-clip` to the services page root so a malformed or legacy value cannot cause document-level horizontal scrolling.

### Task 4: Safe Mobile Save Bar

**Files:**
- Modify: `src/app/site/[slug]/admin/services/ServicesClient.tsx`

- [ ] **Step 1: Add saved-confirmation lifecycle**

Use an effect keyed by `savedAt` to clear the saved confirmation after 1800ms.

- [ ] **Step 2: Render the bar only when needed**

Define:

```ts
const showSaveBar = dirty || saving || error !== null || savedAt !== null;
```

Only render the fixed bar when `showSaveBar` is true.

- [ ] **Step 3: Position above mobile navigation**

Use:

```tsx
className="pointer-events-none fixed inset-x-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-30 px-3 md:bottom-4 md:px-8"
```

Increase the page’s mobile bottom padding to at least `pb-40`.

- [ ] **Step 4: Use a compact mobile status/action layout**

Render one rounded dark status container with a flexible status label and fixed-width save button. Keep errors inside the container using `min-w-0`, `break-words`, and a bounded width.

- [ ] **Step 5: Hide after successful save**

Show **Saved ✓** while `savedAt` is active and `dirty` is false. When the timeout clears `savedAt`, the bar disappears.

### Task 5: Verification

**Files:**
- Test: `src/lib/admin-services.test.ts`
- Test: existing `src/lib/*.test.ts`

- [ ] **Step 1: Run focused tests**

Run: `npx tsx --test src/lib/admin-services.test.ts src/lib/admin-navigation.test.ts`

Expected: all focused tests pass.

- [ ] **Step 2: Run the complete test suite**

Run: `npx tsx --test $(rg --files src -g '*.test.ts' | tr '\n' ' ')`

Expected: zero failures.

- [ ] **Step 3: Run type and whitespace checks**

Run: `npx tsc --noEmit`

Run: `git diff --check`

Expected: both exit successfully.

- [ ] **Step 4: Run the production build**

Run: `npm run build`

Expected: Next.js build completes successfully.

- [ ] **Step 5: Verify mobile behavior in browser**

At 320px, 375px, and 390px widths:

- Add Service scrolls to the new card and focuses Service name.
- The viewport does not zoom when focusing any field.
- The document has no horizontal overflow.
- Add-on controls remain inside the card.
- The save bar remains above the floating navigation.
- The successful-save confirmation disappears after approximately 1.8 seconds.
