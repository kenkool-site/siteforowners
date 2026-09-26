# Event Schedule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace free-text "schedule" content with a real structured Event Schedule (name + time + optional location per item), rendered as a new guest-facing timeline card, editable in the Event Editor, and usable to bulk-seed the existing Moments feature.

**Architecture:** One additive JSONB column (`invitation_events.event_schedule`) threaded through the existing `additionalSections`-shaped plumbing (types, repository mapping, validation, editor, public page). A new pure module owns parsing/validation/range-inference so every consumer (editor, public page, Moments manager) shares one source of truth for what a valid item looks like and how a missing end time is inferred. No schema link to Moments — a new host action in the existing Moments manager reads the schedule once and POSTs to the existing per-moment create endpoint.

**Tech Stack:** Next.js 14 App Router, TypeScript (strict), Supabase (Postgres/JSONB), next-intl, `tsx --test`.

**Spec:** `docs/superpowers/specs/2026-09-26-invitespot-event-schedule-design.md`

## Global Constraints

- Storage: one JSONB column on `invitation_events`, no new table — matches `additional_sections`' own existing convention (see spec's "Data model" section).
- Single date per event: every schedule item uses whatever date the host enters on its own `datetime-local` input (no locked-to-event-date enforcement in the UI) — see spec's "Data model" and "Host editor" sections.
- `name` is free text, no predefined list (confirmed with the user during brainstorming).
- Inferred end time: next item's `startsAt`, or the last item's own `startsAt` + 2 hours — see spec's "Moments integration" section. This is computed fresh every time it's needed, never stored.
- No ongoing sync between a schedule item and any Moment it seeded — once created, a Moment is fully independent (see spec's "Moments integration" section).
- `MAX_EVENT_SCHEDULE_ITEMS = 20`, `MAX_EVENT_SCHEDULE_NAME_LENGTH = 80`, `MAX_EVENT_SCHEDULE_LOCATION_NAME_LENGTH = 120`, `MAX_EVENT_SCHEDULE_LOCATION_ADDRESS_LENGTH = 300`.
- `npm run build` (not just `tsc --noEmit`) must pass before any task touching a `route.ts` file is considered done, per this repo's CLAUDE.md. (No task in this plan adds a new `route.ts`, but Task 5 touches an existing one's caller — run the build anyway as this plan's final check.)
- `tsx --test`'s bracket-glob defect: a literal path containing `[eventId]` silently matches 0 files — `cd` into the file's own directory and use the bare filename, or a quoted recursive glob.

---

### Task 1: Core `event-schedule` module

**Files:**
- Create: `src/lib/invitations/event-schedule.ts`
- Test: `src/lib/invitations/event-schedule.test.ts`

**Interfaces:**
- Produces: `EventScheduleItem = { name: string; startsAt: string; locationName?: string; locationAddress?: string }`; `parseInvitationEventSchedule(value: unknown): { ok: true; value: EventScheduleItem[] } | { ok: false; error: string }`; `normalizeInvitationEventSchedule(value: unknown): EventScheduleItem[]`; `computeInferredScheduleRanges(items: EventScheduleItem[]): Array<{ item: EventScheduleItem; startsAt: string; endsAt: string }>`; constants `MAX_EVENT_SCHEDULE_ITEMS`, `MAX_EVENT_SCHEDULE_NAME_LENGTH`, `MAX_EVENT_SCHEDULE_LOCATION_NAME_LENGTH`, `MAX_EVENT_SCHEDULE_LOCATION_ADDRESS_LENGTH`. Every later task in this plan imports from this file — get the names exactly right.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/invitations/event-schedule.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  parseInvitationEventSchedule,
  normalizeInvitationEventSchedule,
  computeInferredScheduleRanges,
  MAX_EVENT_SCHEDULE_ITEMS,
} from "./event-schedule";

test("trims fields, drops empty rows, and sorts by startsAt ascending", () => {
  assert.deepEqual(
    parseInvitationEventSchedule([
      { name: " Wedding Reception ", startsAt: "2026-10-03T19:30:00.000Z" },
      { name: "", startsAt: "" },
      { name: " Wedding Ceremony ", startsAt: "2026-10-03T17:00:00.000Z", locationName: " St. Mary's ", locationAddress: " 123 Chapel St " },
    ]),
    {
      ok: true,
      value: [
        { name: "Wedding Ceremony", startsAt: "2026-10-03T17:00:00.000Z", locationName: "St. Mary's", locationAddress: "123 Chapel St" },
        { name: "Wedding Reception", startsAt: "2026-10-03T19:30:00.000Z" },
      ],
    },
  );
});

test("blank optional location fields normalize to absent, not empty strings", () => {
  const result = parseInvitationEventSchedule([
    { name: "Cocktail Hour", startsAt: "2026-10-03T18:00:00.000Z", locationName: "  ", locationAddress: "" },
  ]);
  assert.equal(result.ok, true);
  assert.ok(result.ok);
  assert.deepEqual(result.value[0], { name: "Cocktail Hour", startsAt: "2026-10-03T18:00:00.000Z" });
  assert.equal("locationName" in result.value[0], false);
  assert.equal("locationAddress" in result.value[0], false);
});

test("a single set location field (without the other) is preserved on its own", () => {
  const result = parseInvitationEventSchedule([
    { name: "Reception", startsAt: "2026-10-03T19:00:00.000Z", locationName: "The Grand Ballroom" },
  ]);
  assert.equal(result.ok, true);
  assert.ok(result.ok);
  assert.deepEqual(result.value[0], { name: "Reception", startsAt: "2026-10-03T19:00:00.000Z", locationName: "The Grand Ballroom" });
});

test("rejects a non-array, an oversized array, a missing/invalid name, and a missing/invalid startsAt", () => {
  assert.equal(parseInvitationEventSchedule("not an array").ok, false);
  assert.equal(
    parseInvitationEventSchedule(
      Array.from({ length: MAX_EVENT_SCHEDULE_ITEMS + 1 }, (_, index) => ({ name: `Item ${index}`, startsAt: "2026-10-03T17:00:00.000Z" })),
    ).ok,
    false,
  );
  assert.equal(parseInvitationEventSchedule([{ name: "x".repeat(81), startsAt: "2026-10-03T17:00:00.000Z" }]).ok, false);
  assert.equal(parseInvitationEventSchedule([{ startsAt: "2026-10-03T17:00:00.000Z" }]).ok, false);
  assert.equal(parseInvitationEventSchedule([{ name: "Ceremony", startsAt: "not a date" }]).ok, false);
  assert.equal(parseInvitationEventSchedule([{ name: "Ceremony" }]).ok, false);
});

test("rejects an over-length location name or address", () => {
  assert.equal(
    parseInvitationEventSchedule([{ name: "Ceremony", startsAt: "2026-10-03T17:00:00.000Z", locationName: "x".repeat(121) }]).ok,
    false,
  );
  assert.equal(
    parseInvitationEventSchedule([{ name: "Ceremony", startsAt: "2026-10-03T17:00:00.000Z", locationAddress: "x".repeat(301) }]).ok,
    false,
  );
});

test("normalize falls back to an empty array for invalid input instead of throwing", () => {
  assert.deepEqual(normalizeInvitationEventSchedule("garbage"), []);
  assert.deepEqual(normalizeInvitationEventSchedule(null), []);
  assert.deepEqual(normalizeInvitationEventSchedule(undefined), []);
});

test("computeInferredScheduleRanges: each item's end is the next item's start", () => {
  const items = [
    { name: "Ceremony", startsAt: "2026-10-03T17:00:00.000Z" },
    { name: "Cocktail Hour", startsAt: "2026-10-03T18:30:00.000Z" },
  ];
  assert.deepEqual(computeInferredScheduleRanges(items), [
    { item: items[0], startsAt: "2026-10-03T17:00:00.000Z", endsAt: "2026-10-03T18:30:00.000Z" },
    { item: items[1], startsAt: "2026-10-03T18:30:00.000Z", endsAt: "2026-10-03T20:30:00.000Z" },
  ]);
});

test("computeInferredScheduleRanges: a single item gets a 2-hour inferred end", () => {
  const items = [{ name: "Reception", startsAt: "2026-10-03T19:00:00.000Z" }];
  assert.deepEqual(computeInferredScheduleRanges(items), [
    { item: items[0], startsAt: "2026-10-03T19:00:00.000Z", endsAt: "2026-10-03T21:00:00.000Z" },
  ]);
});

test("computeInferredScheduleRanges: an empty list returns an empty list", () => {
  assert.deepEqual(computeInferredScheduleRanges([]), []);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd src/lib/invitations && npx tsx --test event-schedule.test.ts`
Expected: FAIL — `event-schedule.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/invitations/event-schedule.ts
export const MAX_EVENT_SCHEDULE_ITEMS = 20;
export const MAX_EVENT_SCHEDULE_NAME_LENGTH = 80;
export const MAX_EVENT_SCHEDULE_LOCATION_NAME_LENGTH = 120;
export const MAX_EVENT_SCHEDULE_LOCATION_ADDRESS_LENGTH = 300;

export type EventScheduleItem = {
  name: string;
  startsAt: string;
  locationName?: string;
  locationAddress?: string;
};

export type EventScheduleParseResult =
  | { ok: true; value: EventScheduleItem[] }
  | { ok: false; error: string };

export function parseInvitationEventSchedule(value: unknown): EventScheduleParseResult {
  if (!Array.isArray(value) || value.length > MAX_EVENT_SCHEDULE_ITEMS) {
    return { ok: false, error: `Add no more than ${MAX_EVENT_SCHEDULE_ITEMS} schedule items.` };
  }

  const items: EventScheduleItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, error: "Complete or remove each schedule item." };
    }
    const record = raw as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const startsAtRaw = typeof record.startsAt === "string" ? record.startsAt.trim() : "";
    const locationName = typeof record.locationName === "string" ? record.locationName.trim() : "";
    const locationAddress = typeof record.locationAddress === "string" ? record.locationAddress.trim() : "";

    if (!name && !startsAtRaw) continue;
    if (!name) return { ok: false, error: "Each schedule item needs a name." };
    if (name.length > MAX_EVENT_SCHEDULE_NAME_LENGTH) {
      return { ok: false, error: `Keep each schedule item's name under ${MAX_EVENT_SCHEDULE_NAME_LENGTH} characters.` };
    }
    if (!startsAtRaw || Number.isNaN(Date.parse(startsAtRaw))) {
      return { ok: false, error: "Each schedule item needs a valid time." };
    }
    if (locationName.length > MAX_EVENT_SCHEDULE_LOCATION_NAME_LENGTH) {
      return { ok: false, error: `Keep each location name under ${MAX_EVENT_SCHEDULE_LOCATION_NAME_LENGTH} characters.` };
    }
    if (locationAddress.length > MAX_EVENT_SCHEDULE_LOCATION_ADDRESS_LENGTH) {
      return { ok: false, error: `Keep each address under ${MAX_EVENT_SCHEDULE_LOCATION_ADDRESS_LENGTH} characters.` };
    }

    const item: EventScheduleItem = { name, startsAt: new Date(startsAtRaw).toISOString() };
    if (locationName) item.locationName = locationName;
    if (locationAddress) item.locationAddress = locationAddress;
    items.push(item);
  }

  items.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  return { ok: true, value: items };
}

export function normalizeInvitationEventSchedule(value: unknown): EventScheduleItem[] {
  const parsed = parseInvitationEventSchedule(value);
  return parsed.ok ? parsed.value : [];
}

const DEFAULT_INFERRED_DURATION_MS = 2 * 60 * 60 * 1000;

export function computeInferredScheduleRanges(
  items: EventScheduleItem[],
): Array<{ item: EventScheduleItem; startsAt: string; endsAt: string }> {
  return items.map((item, index) => {
    const next = items[index + 1];
    const endsAt = next
      ? next.startsAt
      : new Date(Date.parse(item.startsAt) + DEFAULT_INFERRED_DURATION_MS).toISOString();
    return { item, startsAt: item.startsAt, endsAt };
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd src/lib/invitations && npx tsx --test event-schedule.test.ts`
Expected: PASS, all 10 tests.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/invitations/event-schedule.ts src/lib/invitations/event-schedule.test.ts
git commit -m "feat: add pure Event Schedule parsing/validation/range-inference module"
```

---

### Task 2: Database column and data-layer wiring

**Files:**
- Create: `supabase/migrations/063_invitation_event_schedule.sql` (verify 063 is still the next free number — check `ls supabase/migrations | tail -1` before naming the file; if a newer migration already exists, use the next number instead and adjust this task's filename accordingly)
- Modify: `src/lib/invitations/repository.ts:99` (the `MANAGEMENT_SELECT` array), `src/lib/invitations/repository.ts:111` (the `PUBLIC_SELECT` array)
- Modify: `src/lib/invitations/repository-core.ts:98`, `:161`, `:197`, `:382`, `:457`, `:499` (verify these line numbers against current file content before editing — they were correct at plan-writing time but a task earlier in this plan doesn't touch this file, so they should still match)
- Modify: `src/lib/invitations/types.ts:55`
- Modify: `src/lib/invitations/validation.ts:49`, `:238-241`
- Modify: `src/components/invitations/PublicInvitation.tsx` (the `Pick<RepositoryPublicInvitationEvent, ...>` list, currently ending `| "showPublicRsvpCount" | "commentWallEnabled"`)
- Test: extend `src/lib/invitations/repository.test.ts` (the existing `"management projection omits owner PIN and event passcode hashes"` test's fixture row and a new public-projection test), extend `src/lib/invitations/validation.test.ts`

**Interfaces:**
- Consumes: `EventScheduleItem`, `parseInvitationEventSchedule`, `normalizeInvitationEventSchedule` from Task 1's `src/lib/invitations/event-schedule.ts`.
- Produces: `invitation_events.event_schedule` column; `InvitationEvent.eventSchedule?: EventScheduleItem[]` and `PublicInvitationEvent.eventSchedule?: EventScheduleItem[]` (both the repository-core.ts type and the `Pick`-derived `PublicInvitation.tsx` type); `InvitationEventUpdate.eventSchedule?: EventScheduleItem[]`. Tasks 3, 4, and 5 all read `event.eventSchedule` off whichever event object they receive.

- [ ] **Step 1: Confirm the next migration number and write the migration**

Run: `ls supabase/migrations | tail -3` — confirm `063_...` is free (adjust the number below if not).

```sql
-- supabase/migrations/063_invitation_event_schedule.sql
ALTER TABLE public.invitation_events
  ADD COLUMN IF NOT EXISTS event_schedule jsonb NOT NULL DEFAULT '[]'::jsonb;
```

No new RLS statements — this column inherits `invitation_events`' existing row-level security, the same way `find_me_enabled` (migration 061) needed none when added to the same table.

- [ ] **Step 2: Write the failing tests**

In `src/lib/invitations/repository.test.ts`, find the existing test `"management projection omits owner PIN and event passcode hashes"`. Add `event_schedule: [{ name: "Ceremony", startsAt: "2026-10-03T17:00:00.000Z" }],` to its fixture row object (anywhere alongside the existing `additional_sections: [...]` line), then add this assertion inside that same test, after its existing assertions:

```ts
  assert.deepEqual(event.eventSchedule, [{ name: "Ceremony", startsAt: "2026-10-03T17:00:00.000Z" }]);
```

Then add a new test for the public projection — find whatever existing test exercises `getPublicInvitationBySlug` (search this file for `getPublicInvitationBySlug`) and copy its fixture-row shape, adding `event_schedule: [{ name: "Reception", startsAt: "2026-10-03T19:00:00.000Z", locationName: "The Grand Ballroom" }]` to the fixture and asserting `result.event.eventSchedule` deep-equals `[{ name: "Reception", startsAt: "2026-10-03T19:00:00.000Z", locationName: "The Grand Ballroom" }]`.

In `src/lib/invitations/validation.test.ts`, add (mirroring the existing `"event updates normalize flexible additional sections"` test immediately above it):

```ts
test("event updates normalize the event schedule and sort it by time", () => {
  assert.deepEqual(parseEventUpdate({
    eventSchedule: [
      { name: " Reception ", startsAt: "2026-10-03T19:00:00.000Z" },
      { name: " Ceremony ", startsAt: "2026-10-03T17:00:00.000Z" },
    ],
  }, "owner"), {
    ok: true,
    value: { eventSchedule: [
      { name: "Ceremony", startsAt: "2026-10-03T17:00:00.000Z" },
      { name: "Reception", startsAt: "2026-10-03T19:00:00.000Z" },
    ] },
  });
  assert.deepEqual(parseEventUpdate({ eventSchedule: [{ name: "Ceremony" }] }, "owner"), {
    ok: false,
    errors: { eventSchedule: "Each schedule item needs a valid time." },
  });
});
```

(Import `parseEventUpdate` the same way the existing test file already does — check its top-of-file imports rather than adding a duplicate import line.)

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd src/lib/invitations && npx tsx --test repository.test.ts validation.test.ts`
Expected: FAIL — `eventSchedule` isn't wired into any type or mapper yet.

- [ ] **Step 4: Wire the field through**

In `src/lib/invitations/repository.ts`, add `"event_schedule"` to both arrays:

```ts
const MANAGEMENT_SELECT = [
  "id", "owner_id", "slug", "public_subdomain", "event_type", "locale", "title", "honoree_names",
  "description", "starts_at", "ends_at", "timezone", "venue_name", "venue_url", "address",
  "map_url", "travel_info", "style_guide", "additional_sections", "event_schedule", "theme_key", "primary_color", "accent_color", "font_pair_key",
  ...
```

```ts
const PUBLIC_SELECT = [
  "id", "slug", "public_subdomain", "event_type", "locale", "title", "honoree_names", "description",
  "starts_at", "ends_at", "timezone", "venue_name", "venue_url", "address", "map_url", "travel_info", "style_guide", "additional_sections", "event_schedule",
  "theme_key", "primary_color", "accent_color", "font_pair_key",
  ...
```

In `src/lib/invitations/types.ts`, add to `InvitationEvent` (right after `additionalSections?: InvitationAdditionalSection[];`):

```ts
  eventSchedule?: EventScheduleItem[];
```

Add the import at the top of `types.ts` alongside the existing `InvitationAdditionalSection` import: `import type { EventScheduleItem } from "./event-schedule";`.

In `src/lib/invitations/repository-core.ts`:
- Add `event_schedule?: unknown;` right after each of the two `additional_sections?: unknown;` lines (the management row type and the public row type).
- Add `eventSchedule?: EventScheduleItem[];` right after the `additionalSections?: InvitationAdditionalSection[];` line on `PublicInvitationEvent`.
- Import `EventScheduleItem` and `normalizeInvitationEventSchedule` from `./event-schedule` at the top of the file, alongside the existing `additional-sections` import.
- In both `getInvitationEventForManagement` and the `getPublicInvitationBySlug` mapper, add this line immediately after `additionalSections: normalizeInvitationAdditionalSections(row.additional_sections),`:

```ts
    eventSchedule: normalizeInvitationEventSchedule(row.event_schedule),
```

- In the `EVENT_UPDATE_COLUMNS` map, add right after `additionalSections: "additional_sections",`:

```ts
  eventSchedule: "event_schedule",
```

In `src/lib/invitations/validation.ts`:
- Add `eventSchedule?: EventScheduleItem[];` to `InvitationEventUpdate` right after `additionalSections?: InvitationAdditionalSection[];`.
- Import `EventScheduleItem` and `parseInvitationEventSchedule` from `./event-schedule` at the top, alongside the existing `additional-sections` import.
- Add, right after the existing block:

```ts
  if ("additionalSections" in body) {
    const sections = parseInvitationAdditionalSections(body.additionalSections);
    if (sections.ok) value.additionalSections = sections.value;
    else errors.additionalSections = sections.error;
  }
```

this new block:

```ts
  if ("eventSchedule" in body) {
    const schedule = parseInvitationEventSchedule(body.eventSchedule);
    if (schedule.ok) value.eventSchedule = schedule.value;
    else errors.eventSchedule = schedule.error;
  }
```

In `src/components/invitations/PublicInvitation.tsx`, add `| "eventSchedule"` to the `Pick<RepositoryPublicInvitationEvent, ...>` union, right after `| "additionalSections"`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd src/lib/invitations && npx tsx --test repository.test.ts validation.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck and build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: succeeds (this task doesn't touch a `route.ts`, but the build also re-validates every type across the whole app, which is the real thing at risk here given how many files this task touches).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/063_invitation_event_schedule.sql src/lib/invitations/repository.ts src/lib/invitations/repository-core.ts src/lib/invitations/types.ts src/lib/invitations/validation.ts src/lib/invitations/repository.test.ts src/lib/invitations/validation.test.ts src/components/invitations/PublicInvitation.tsx
git commit -m "feat: add invitation_events.event_schedule column and wire it through the event data layer"
```

---

### Task 3: Host editor in EventEditor.tsx

**Files:**
- Modify: `src/components/invitations/EventEditor.tsx`
- Modify: `messages/en.json`, `messages/es.json`

**Interfaces:**
- Consumes: `EventScheduleItem`, `MAX_EVENT_SCHEDULE_ITEMS`, `MAX_EVENT_SCHEDULE_NAME_LENGTH`, `MAX_EVENT_SCHEDULE_LOCATION_NAME_LENGTH`, `MAX_EVENT_SCHEDULE_LOCATION_ADDRESS_LENGTH` from Task 1; `event.eventSchedule` from Task 2's `EditorEvent` (= `InvitationEventForManagement`, which now carries it via `InvitationEvent`); `zonedWallTimeToUtcIso` (already imported in this file from `@/lib/invitations/event-time`).
- Produces: nothing new consumed elsewhere — this task is host-editor-only. (Task 5's Moments-manager work reads the schedule via its own separate fetch, not through this component.)

This codebase has no existing test file for `EventEditor.tsx` (verify: `ls src/components/invitations/EventEditor.test.tsx` should report "No such file"). Introducing a full DOM-mount test harness for this large, many-props component is out of scope for this task — match the file's own current, pre-existing testing posture rather than inventing a new pattern for just this feature. Correctness here is covered by: Task 1's exhaustive tests of the parsing logic this UI calls, `npx tsc --noEmit`, and `npm run build`.

- [ ] **Step 1: Add the i18n keys**

In `messages/en.json`, find the existing `"additionalSections": { ... }` block under `invitations.editor` (search for `"additionalSections"` — it sits alongside `"title": "Additional sections"`). Add a sibling `"eventSchedule"` block immediately after it:

```json
      "eventSchedule": {
        "title": "Event schedule",
        "help": "List each part of the day with its own time, so guests see a real schedule instead of a paragraph.",
        "nameLabel": "Name",
        "namePlaceholder": "Wedding Ceremony",
        "timeLabel": "Time",
        "locationNameLabel": "Location name (optional)",
        "locationNamePlaceholder": "St. Mary's Catholic Church",
        "locationAddressLabel": "Address (optional)",
        "locationAddressPlaceholder": "123 Chapel St, Brooklyn, NY",
        "add": "Add schedule item",
        "remove": "Remove item"
      },
```

Then find `"errors": { ... "additionalSections": "..." ... }` in the same `invitations.editor` namespace and add a sibling line:

```json
        "eventSchedule": "Complete or remove each schedule item, and make sure every time is valid.",
```

Repeat both additions in `messages/es.json` at the same nesting path, with Spanish copy:

```json
      "eventSchedule": {
        "title": "Cronograma del evento",
        "help": "Enumera cada parte del día con su propia hora, para que los invitados vean un cronograma real en lugar de un párrafo.",
        "nameLabel": "Nombre",
        "namePlaceholder": "Ceremonia de boda",
        "timeLabel": "Hora",
        "locationNameLabel": "Nombre del lugar (opcional)",
        "locationNamePlaceholder": "Iglesia de Santa María",
        "locationAddressLabel": "Dirección (opcional)",
        "locationAddressPlaceholder": "Calle Capilla 123, Brooklyn, NY",
        "add": "Agregar elemento",
        "remove": "Quitar elemento"
      },
```

```json
        "eventSchedule": "Completa o elimina cada elemento del cronograma, y verifica que cada hora sea válida.",
```

- [ ] **Step 2: Wire the field into EventEditor.tsx**

Add the import at the top, alongside the existing `additional-sections` import:

```ts
import { type EventScheduleItem, MAX_EVENT_SCHEDULE_ITEMS, MAX_EVENT_SCHEDULE_NAME_LENGTH, MAX_EVENT_SCHEDULE_LOCATION_NAME_LENGTH, MAX_EVENT_SCHEDULE_LOCATION_ADDRESS_LENGTH } from "@/lib/invitations/event-schedule";
```

Add `"eventSchedule"` to `LOCALIZED_ERROR_KEYS` (the `Set` at line ~29-40), right after `"additionalSections",`.

Add state, right after the existing `additionalSections` state line:

```ts
  const [eventSchedule, setEventSchedule] = useState<EventScheduleItem[]>(event.eventSchedule ?? []);
```

Add `eventSchedule,` to the save `payload` object, right after `additionalSections,`.

Add the resync line, right after `setAdditionalSections(result.event.additionalSections ?? []);`:

```ts
      setEventSchedule(result.event.eventSchedule ?? []);
```

Add the new editor block in the JSX, immediately after the closing `</div>` of the venue/date grid (the block containing the `mapUrl` label, ending `...<FieldError name="venueUrl"...` through the `mapUrl` label — locate it by searching for `t("fields.mapUrl")`) and before the `<details data-style-guide-editor ...>` block:

```tsx
            <details data-event-schedule-editor open={eventSchedule.length > 0} className="group mt-8 border-t border-[#ddd4e1] pt-5">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-lg font-semibold text-[#2B2231] outline-none focus-visible:ring-2 focus-visible:ring-[#6D456F] [&::-webkit-details-marker]:hidden">
                {t("eventSchedule.title")}<span aria-hidden="true" className="text-2xl font-normal transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-1 text-sm leading-6 text-[#675d6a]">{t("eventSchedule.help")}</p>
              <div className="mt-5 space-y-5">
                {eventSchedule.map((item, index) => (
                  <div key={index} className="rounded-md border border-[#e1d9e4] bg-white p-4">
                    <label className={labelClass}>{t("eventSchedule.nameLabel")}<input maxLength={MAX_EVENT_SCHEDULE_NAME_LENGTH} value={item.name} placeholder={t("eventSchedule.namePlaceholder")} onChange={(event) => setEventSchedule((items) => items.map((current, currentIndex) => currentIndex === index ? { ...current, name: event.target.value } : current))} className={inputClass} /></label>
                    <label className={`${labelClass} mt-4`}>{t("eventSchedule.timeLabel")}<input type="datetime-local" value={toLocalInput(item.startsAt, currentEvent.timezone)} onChange={(event) => { if (!event.target.value) return; const startsAt = zonedWallTimeToUtcIso(event.target.value, currentEvent.timezone); setEventSchedule((items) => items.map((current, currentIndex) => currentIndex === index ? { ...current, startsAt } : current)); }} className={inputClass} /></label>
                    <label className={`${labelClass} mt-4`}>{t("eventSchedule.locationNameLabel")}<input maxLength={MAX_EVENT_SCHEDULE_LOCATION_NAME_LENGTH} value={item.locationName ?? ""} placeholder={t("eventSchedule.locationNamePlaceholder")} onChange={(event) => setEventSchedule((items) => items.map((current, currentIndex) => currentIndex === index ? { ...current, locationName: event.target.value } : current))} className={inputClass} /></label>
                    <label className={`${labelClass} mt-4`}>{t("eventSchedule.locationAddressLabel")}<input maxLength={MAX_EVENT_SCHEDULE_LOCATION_ADDRESS_LENGTH} value={item.locationAddress ?? ""} placeholder={t("eventSchedule.locationAddressPlaceholder")} onChange={(event) => setEventSchedule((items) => items.map((current, currentIndex) => currentIndex === index ? { ...current, locationAddress: event.target.value } : current))} className={inputClass} /></label>
                    <button type="button" onClick={() => { setEventSchedule((items) => items.filter((_, currentIndex) => currentIndex !== index)); markDirty(); }} className="mt-3 min-h-11 text-sm font-semibold text-[#7f2929] underline underline-offset-4">{t("eventSchedule.remove")}</button>
                  </div>
                ))}
              </div>
              <button type="button" disabled={eventSchedule.length >= MAX_EVENT_SCHEDULE_ITEMS} onClick={() => { setEventSchedule((items) => [...items, { name: "", startsAt: currentEvent.startsAt ?? new Date().toISOString() }]); markDirty(); }} className="mt-4 min-h-11 rounded-md border border-[#6D456F] bg-white px-4 py-2 text-sm font-semibold text-[#55405a] disabled:opacity-50">{t("eventSchedule.add")}</button>
              <FieldError name="eventSchedule" errors={errors} />
            </details>
```

A new item defaults its `startsAt` to the event's own `startsAt` (falling back to "now" if the event has none set yet) so the `datetime-local` input never opens blank — the host can change it immediately via the Time field.

- [ ] **Step 3: Typecheck and build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Manual verification**

Run the dev server (`npm run dev`), open an existing event's editor, expand "Event schedule", add an item with a name/time/location, save, reload the page, and confirm the item persisted with the correct time displayed in the `datetime-local` input (i.e. round-trips through the timezone conversion correctly).

- [ ] **Step 5: Commit**

```bash
git add src/components/invitations/EventEditor.tsx messages/en.json messages/es.json
git commit -m "feat: add Event Schedule editor to the Event Editor"
```

---

### Task 4: Guest-facing timeline card in PublicInvitation.tsx

**Files:**
- Modify: `src/components/invitations/PublicInvitation.tsx`
- Modify: `messages/en.json`, `messages/es.json`

**Interfaces:**
- Consumes: `event.eventSchedule` (from Task 2's `Pick<...>` addition), `computeInferredScheduleRanges` is NOT needed here (that's Moments-only) — this task only ever renders `event.eventSchedule` directly, already sorted by Task 1's `parseInvitationEventSchedule`.
- Produces: nothing consumed by a later task.

This codebase has no existing test file for `PublicInvitation.tsx` either (verify: `ls src/components/invitations/PublicInvitation.test.tsx` should report "No such file") — same reasoning as Task 3 applies: don't introduce a new DOM-test pattern for this one file in this one task. Correctness here is covered by `npx tsc --noEmit`, `npm run build`, and a manual check in the browser (Step 4 below).

- [ ] **Step 1: Add the i18n keys**

In `messages/en.json`, add a new key under `invitations.public` — confirmed via `PublicInvitation.tsx`'s own `useTranslations("invitations.public")` call; this is a different, guest-facing namespace from Task 3's host-facing `invitations.editor.eventSchedule`, so there's no collision:

```json
      "eventSchedule": {
        "title": "Event Schedule"
      },
```

Add the Spanish equivalent to `messages/es.json` at the same path:

```json
      "eventSchedule": {
        "title": "Cronograma del evento"
      },
```

- [ ] **Step 2: Add the guest-facing card**

Locate `sectionOrder` (search for `const sectionOrder = (key: typeof recipe.contentOrder[number]) =>`) and the Additional Sections rendering block (search for `{(event.additionalSections ?? []).map(`). Immediately before that block, add:

```tsx
        {(event.eventSchedule ?? []).length > 0 && (
          <section className={`${recreated ? "" : theme.details} ${rhythm} px-5 py-8 sm:px-9`} style={{ ...(recreated ? framedSurface : {}), order: sectionOrder("details") + 0.1 }} aria-labelledby="invitation-schedule-heading">
            <h2 id="invitation-schedule-heading" className={`${titleFont} text-3xl sm:text-4xl`}>{t("eventSchedule.title")}</h2>
            <div className="relative mt-6 pl-7">
              <div className="absolute bottom-1 left-[5px] top-1 w-px" style={{ backgroundColor: recipe.palette.accent, opacity: 0.35 }} />
              {(event.eventSchedule ?? []).map((item, index) => (
                <div key={`${item.name}:${index}`} className="relative pb-7 last:pb-0">
                  <div className="absolute -left-7 top-1.5 size-2.5 rounded-full" style={{ backgroundColor: recipe.palette.accent }} />
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
                    {new Intl.DateTimeFormat(event.locale, { hour: "numeric", minute: "2-digit", timeZone: event.timezone }).format(new Date(item.startsAt))}
                  </p>
                  <p className="mt-1 text-lg">{item.name}</p>
                  {(item.locationName || item.locationAddress) && (
                    <p className="mt-1 flex items-start gap-1.5 text-sm opacity-75">
                      <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                      <span>{[item.locationName, item.locationAddress].filter(Boolean).join(" — ")}</span>
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

```

`MapPin` is already imported at the top of this file (`import { Building2, CalendarDays, Clock3, MapPin, Navigation, Plane } from "lucide-react";`) — no new import needed. `recipe`, `theme`, `titleFont`, `rhythm`, `recreated`, `framedSurface`, and `t` are all already in scope in this component (the exact same values the Additional Sections block right after this one already uses).

- [ ] **Step 3: Typecheck and build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Manual verification**

Run the dev server, open a published event's public invitation page for an event that now has schedule items (set some via Task 3's editor first), and confirm: the timeline renders in the correct order, times display correctly for the event's timezone (not the browser's local timezone, if they differ), the location line appears only for items that have one, and an event with zero schedule items shows nothing extra (no empty card).

- [ ] **Step 5: Commit**

```bash
git add src/components/invitations/PublicInvitation.tsx messages/en.json messages/es.json
git commit -m "feat: render Event Schedule as a guest-facing timeline card"
```

---

### Task 5: Seed Moments from the Event Schedule

**Files:**
- Modify: `src/lib/invitations/memories/repository.ts` (new function, placed near `getEventMemoriesSettings`)
- Modify: `src/components/invitations/memories/MemoriesReviewPageContent.tsx`
- Modify: `src/components/invitations/memories/OwnerMomentsManager.tsx`
- Modify: `messages/en.json`, `messages/es.json`
- Test: `src/components/invitations/memories/OwnerMomentsManager.test.tsx`

**Interfaces:**
- Consumes: `EventScheduleItem`, `computeInferredScheduleRanges` from Task 1's `src/lib/invitations/event-schedule.ts`; the existing `POST /api/invitations/events/[eventId]/memories/moments` endpoint (unchanged — confirmed current body shape `{ name: string; startsAt: string; endsAt: string; sortOrder?: number }`, confirmed current response shape `{ moment: MemoryMoment }`).
- Produces: nothing consumed by a later task — this is the last task in the plan.

- [ ] **Step 1: Add the narrow schedule getter**

In `src/lib/invitations/memories/repository.ts`, add right after `getEventMemoriesSettings` (mirror its exact shape):

```ts
export async function getEventSchedule(eventId: string): Promise<EventScheduleItem[]> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("invitation_events")
    .select("event_schedule")
    .eq("id", eventId)
    .maybeSingle();
  if (error || !data) return [];
  return normalizeInvitationEventSchedule(data.event_schedule);
}
```

Add the import at the top of this file: `import { normalizeInvitationEventSchedule, type EventScheduleItem } from "@/lib/invitations/event-schedule";`.

- [ ] **Step 2: Wire it into the page**

In `src/components/invitations/memories/MemoriesReviewPageContent.tsx`, add `getEventSchedule` to the import from `@/lib/invitations/memories/repository`, add `getEventSchedule(eventId)` to the existing `Promise.all([...])` array (alongside `listMemoryMoments(eventId)`), destructure it into a new `eventSchedule` variable, and pass it to `OwnerMomentsManager` as a new prop:

```tsx
          <OwnerMomentsManager eventId={eventId} initialMoments={moments} initialEventSchedule={eventSchedule} />
```

- [ ] **Step 3: Add the i18n keys**

In `messages/en.json`, inside the existing `invitations.manage.memories.moments` object (alongside `"add": "Add moment"` etc.), add:

```json
    "fromSchedule": {
      "title": "Create Moments from your Event Schedule",
      "empty": "No schedule items yet — add some in the Event Editor first.",
      "add": "Add selected as Moments",
      "adding": "Adding…",
      "error": "Could not create those Moments. Try again."
    },
```

(Nest it as `moments.fromSchedule` — a sibling of the other `moments.*` keys, not a new top-level namespace.)

Add the Spanish equivalent to `messages/es.json` at the same path:

```json
    "fromSchedule": {
      "title": "Crear Momentos desde tu Cronograma del Evento",
      "empty": "Aún no hay elementos en el cronograma — agrega algunos primero en el Editor del Evento.",
      "add": "Agregar seleccionados como Momentos",
      "adding": "Agregando…",
      "error": "No se pudieron crear esos Momentos. Inténtalo de nuevo."
    },
```

- [ ] **Step 4: Write the failing test**

In `src/components/invitations/memories/OwnerMomentsManager.test.tsx`, find the harness's mount helper (`withMountedComponent`, per this file's own established convention) and its signature — it currently takes `initialMoments` as its first argument. Add a new test after the existing ones:

```ts
test("Create Moments from your Event Schedule posts one create-moment request per checked item, using each item's inferred range", async () => {
  const schedule = [
    { name: "Ceremony", startsAt: "2026-10-03T17:00:00.000Z" },
    { name: "Cocktail Hour", startsAt: "2026-10-03T18:30:00.000Z" },
  ];
  await withMountedComponent(
    [],
    async (url, init) => {
      if (init?.method === "POST") return jsonResponse({ moment: { id: "new-moment", name: "Ceremony", startsAt: "2026-10-03T17:00:00.000Z", endsAt: "2026-10-03T18:30:00.000Z", sortOrder: 0 } });
      return jsonResponse({});
    },
    async ({ dom, calls }) => {
      const ceremonyCheckbox = Array.from(dom.window.document.querySelectorAll('input[type="checkbox"]'))[0] as HTMLInputElement;
      click(dom, ceremonyCheckbox);
      await flush();

      click(dom, byText(dom, "button", "Add selected as Moments"));
      await flush();

      const postCalls = calls.filter((c) => c.method === "POST");
      assert.equal(postCalls.length, 1, "expected exactly one create-moment request for the one checked item");
      assert.equal((postCalls[0].body as { name: string }).name, "Ceremony");
      assert.equal((postCalls[0].body as { startsAt: string }).startsAt, "2026-10-03T17:00:00.000Z");
      assert.equal((postCalls[0].body as { endsAt: string }).endsAt, "2026-10-03T18:30:00.000Z");
    },
    schedule,
  );
});
```

If `withMountedComponent`'s signature doesn't already accept a trailing `initialEventSchedule` argument (it won't yet — this is the first test to need one), extend its signature to accept one more parameter and pass it through to the rendered `<OwnerMomentsManager initialEventSchedule={...} />`, defaulting to `[]` for every other existing test call (so none of them need updating). `click`, `byText`, `flush`, and `jsonResponse` are this file's own existing test helpers — reuse them, don't redefine them.

- [ ] **Step 5: Run the test to verify it fails**

Run: `cd src/components/invitations/memories && npx tsx --test OwnerMomentsManager.test.tsx`
Expected: FAIL — `OwnerMomentsManager` doesn't accept `initialEventSchedule` or render the new section yet.

- [ ] **Step 6: Implement the seeding UI**

In `src/components/invitations/memories/OwnerMomentsManager.tsx`:

Add the import: `import { computeInferredScheduleRanges, type EventScheduleItem } from "@/lib/invitations/event-schedule";`.

Change the component's props to accept the new prop:

```ts
export function OwnerMomentsManager({ eventId, initialMoments, initialEventSchedule }: { eventId: string; initialMoments: MemoryMoment[]; initialEventSchedule: EventScheduleItem[] }) {
```

Add state, alongside the existing `moments`/`name`/`startsAt` state:

```ts
  const [scheduleSelections, setScheduleSelections] = useState<Set<number>>(new Set());
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const inferredScheduleRanges = computeInferredScheduleRanges(initialEventSchedule);
```

Add the create handler, alongside `addMoment`:

```ts
  async function createSelectedMomentsFromSchedule() {
    const selected = inferredScheduleRanges.filter((_, index) => scheduleSelections.has(index));
    if (!selected.length) return;
    setScheduleBusy(true);
    setScheduleError(null);
    try {
      let nextSortOrder = moments.length;
      const created: MemoryMoment[] = [];
      for (const range of selected) {
        const response = await fetch(basePath, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: range.item.name,
            startsAt: range.startsAt,
            endsAt: range.endsAt,
            sortOrder: nextSortOrder,
          }),
        });
        if (!response.ok) throw new Error(`moments ${response.status}`);
        const { moment } = (await response.json()) as { moment: MemoryMoment };
        created.push(moment);
        nextSortOrder += 1;
      }
      setMoments((previous) => [...previous, ...created]);
      setScheduleSelections(new Set());
    } catch {
      setScheduleError(t("fromSchedule.error"));
    } finally {
      setScheduleBusy(false);
    }
  }
```

Add the section to the JSX, right after the closing `</ul>`/`{rowError && (...)}`  block that renders the existing moments list and before the "add a moment" form `<div className="mt-4 flex flex-col gap-3 ...">`:

```tsx
      {initialEventSchedule.length > 0 && (
        <div className="mt-6 rounded-md border border-[#e5dde8] p-4">
          <h3 className="text-sm font-semibold">{t("fromSchedule.title")}</h3>
          <ul className="mt-3 flex flex-col gap-2">
            {inferredScheduleRanges.map((range, index) => (
              <li key={index} className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={scheduleSelections.has(index)}
                  onChange={(event) => setScheduleSelections((previous) => {
                    const next = new Set(previous);
                    if (event.target.checked) next.add(index);
                    else next.delete(index);
                    return next;
                  })}
                  className="size-5 accent-[#6D456F]"
                />
                <span className="font-medium">{range.item.name}</span>
                <span className="text-[#675d6a]">
                  {new Date(range.startsAt).toLocaleString()} – {new Date(range.endsAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => void createSelectedMomentsFromSchedule()}
            disabled={scheduleBusy || scheduleSelections.size === 0}
            className="mt-3 min-h-11 rounded-md bg-[#6D456F] px-4 text-sm font-semibold text-white disabled:opacity-40"
          >
            {scheduleBusy ? t("fromSchedule.adding") : t("fromSchedule.add")}
          </button>
          {scheduleError && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {scheduleError}
            </p>
          )}
        </div>
      )}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd src/components/invitations/memories && npx tsx --test OwnerMomentsManager.test.tsx`
Expected: PASS, including every pre-existing test in this file (they now implicitly pass `initialEventSchedule={[]}` via the harness default from Step 4).

- [ ] **Step 8: Typecheck and build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 9: Run the full Memories test suite**

Run (from the repo root): `find src -path "*memories*" -name "*.test.*" -type f -print0 | xargs -0 npx tsx --test`
Expected: every test passes, none newly broken by the `OwnerMomentsManager` prop-signature change.

- [ ] **Step 10: Commit**

```bash
git add src/lib/invitations/memories/repository.ts src/components/invitations/memories/MemoriesReviewPageContent.tsx src/components/invitations/memories/OwnerMomentsManager.tsx src/components/invitations/memories/OwnerMomentsManager.test.tsx messages/en.json messages/es.json
git commit -m "feat: seed Moments from the Event Schedule with a one-time create action"
```
