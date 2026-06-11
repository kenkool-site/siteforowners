# Compact Single-Service Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a compact horizontal Runway service card when a group contains one visible service, while preserving the complete image.

**Architecture:** Keep booking and content rendering in the existing `renderService` helper and add an `isCompact` argument that controls layout classes. Determine compact mode at the group render site from `visibleServices.length === 1`, leaving all multi-service grids unchanged.

**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind CSS, Node test runner

---

### Task 1: Specify the compact layout behavior

**Files:**
- Modify: `tests/runway-template-polish.test.mjs`

- [ ] **Step 1: Write the failing structural test**

Add a test that reads `RunwayServices.tsx` and asserts:

```js
test("runway uses a compact no-crop layout for a single visible service", async () => {
  const services = await readFile(files.services, "utf8");

  assert.match(
    services,
    /const isCompactGroup = visibleServices\.length === 1/,
    "Runway should detect a group with one visible service",
  );
  assert.match(
    services,
    /renderService\(service, i, isCompactGroup\)/,
    "Runway should pass compact layout state into service rendering",
  );
  assert.match(
    services,
    /object-contain/,
    "Runway should preserve the complete service image",
  );
  assert.match(
    services,
    /grid-cols-\[42%_minmax\(0,1fr\)\]/,
    "A single service should use the selected compact horizontal layout",
  );
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node --test tests/runway-template-polish.test.mjs
```

Expected: the new test fails because `isCompactGroup` and the horizontal grid class do not exist.

### Task 2: Implement the single-service layout

**Files:**
- Modify: `src/components/templates/services/RunwayServices.tsx`

- [ ] **Step 1: Add compact mode to the renderer**

Change the helper signature to:

```tsx
const renderService = (service: DisplayService, i: number, isCompact = false) => {
```

Use conditional classes on the card, image wrapper, image, metadata, heading,
description, and booking button. Compact mode must:

- Use `grid grid-cols-[42%_minmax(0,1fr)]`.
- Remove the fixed top image height and negative margins.
- Give the image column a compact `min-h-[15rem]`.
- Keep `object-contain` and disable hover image scaling so the image never clips.
- Reduce padding and text/button spacing.
- Clamp the description to three lines.

- [ ] **Step 2: Select compact mode per group**

After computing `visibleServices`, add:

```tsx
const isCompactGroup = visibleServices.length === 1;
```

Pass it into the renderer:

```tsx
renderService(service, i, isCompactGroup)
```

- [ ] **Step 3: Run the focused test and verify GREEN**

Run:

```bash
node --test tests/runway-template-polish.test.mjs
```

Expected: all Runway polish tests pass.

### Task 3: Validate responsive and type safety

**Files:**
- Verify: `src/components/templates/services/RunwayServices.tsx`
- Verify: `tests/runway-template-polish.test.mjs`

- [ ] **Step 1: Run TypeScript compilation**

Run:

```bash
npx tsc --noEmit
```

Expected: exit code 0.

- [ ] **Step 2: Run related service tests**

Run:

```bash
node --test tests/runway-template-polish.test.mjs
npx tsx --test src/components/templates/services/groupServices.test.ts
```

Expected: all tests pass.

- [ ] **Step 3: Verify the rendered template**

Open the known local development URL in the in-app browser at a 375px viewport.
Confirm:

- A one-service group uses the compact horizontal card.
- The portrait image is completely visible.
- The card is materially shorter than the previous vertical version.
- A multi-service group retains the existing vertical grid cards.
