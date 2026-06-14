# Booking Service Picker Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain booking service list with a shared, searchable, image-led, continuously scrolling service picker.

**Architecture:** Add a pure filtering helper for testable name search and a shared `BookingServicePicker` client component that owns query state and visual rendering. Both `CustomerBookingFlow` and `MockBookingCalendar` delegate service selection to this component while preserving their current state transitions. `TemplateOrchestrator` passes its template-local `locale` through `TemplateBooking` and the active flow to the picker.

**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind CSS, Node test runner

---

### Task 1: Add the service filtering helper

**Files:**
- Create: `src/components/templates/booking-service-filter.ts`
- Create: `src/components/templates/booking-service-filter.test.ts`

- [x] **Step 1: Write the failing filter tests**

Create `src/components/templates/booking-service-filter.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { filterBookingServices } from "./booking-service-filter";

const services = [
  { name: "Medium Knotless Braids", price: "$240" },
  { name: "Stitch Braids", price: "$120+" },
  { name: "Cornrows", price: "$180+" },
];

test("filterBookingServices returns all services for an empty query", () => {
  assert.deepEqual(filterBookingServices(services, "   "), services);
});

test("filterBookingServices matches service names case-insensitively", () => {
  assert.deepEqual(filterBookingServices(services, "BRAIDS"), services.slice(0, 2));
});

test("filterBookingServices trims the query before matching", () => {
  assert.deepEqual(filterBookingServices(services, " stitch "), [services[1]]);
});

test("filterBookingServices returns an empty list when nothing matches", () => {
  assert.deepEqual(filterBookingServices(services, "locs"), []);
});
```

- [x] **Step 2: Run tests and verify RED**

Run:

```bash
npx tsx --test src/components/templates/booking-service-filter.test.ts
```

Expected: FAIL because `booking-service-filter.ts` does not exist.

- [x] **Step 3: Implement the pure helper**

Create `src/components/templates/booking-service-filter.ts`:

```ts
export function filterBookingServices<T extends { name: string }>(
  services: T[],
  query: string,
): T[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return services;

  return services.filter((service) =>
    service.name.toLowerCase().includes(normalizedQuery),
  );
}
```

- [x] **Step 4: Run tests and verify GREEN**

Run:

```bash
npx tsx --test src/components/templates/booking-service-filter.test.ts
```

Expected: 5 tests pass.

### Task 2: Build the shared image-led picker

**Files:**
- Create: `src/components/templates/BookingServicePicker.tsx`
- Modify: `tests/template-shared-polish.test.mjs`

- [x] **Step 1: Write the failing structural test**

Add a test to `tests/template-shared-polish.test.mjs` that reads
`BookingServicePicker.tsx`:

```js
test("booking service picker is searchable, image-led, and continuously scrollable", async () => {
  const picker = await readFile(
    "src/components/templates/BookingServicePicker.tsx",
    "utf8",
  );

  assert.match(picker, /filterBookingServices\(services, query\)/);
  assert.match(picker, /type="search"/);
  assert.match(picker, /sticky top-0/);
  assert.match(picker, /service\.image/);
  assert.match(picker, /object-cover object-top/);
  assert.match(picker, /filteredServices\.map/);
  assert.doesNotMatch(picker, /Load More|Next Page|slice\(0,/);
  assert.match(picker, /No services found/);
});
```

- [x] **Step 2: Run the structural test and verify RED**

Run:

```bash
node --test tests/template-shared-polish.test.mjs
```

Expected: FAIL because `BookingServicePicker.tsx` does not exist.

- [x] **Step 3: Implement `BookingServicePicker`**

Create a client component with this interface:

```tsx
interface BookingServicePickerProps {
  services: SimpleService[];
  colors: ThemeColors;
  onSelect: (service: SimpleService) => void;
  locale?: "en" | "es";
}
```

The component must:

```tsx
const [query, setQuery] = useState("");
const filteredServices = useMemo(
  () => filterBookingServices(services, query),
  [services, query],
);
```

Render:

- A `sticky top-0 z-10` search-controls wrapper using `colors.background`.
- A `type="search"` input with localized placeholder and aria-label text.
- A clear button when `query` is non-empty.
- A visible result count using `filteredServices.length`.
- One continuous `filteredServices.map(...)` list.
- Each row as a full-width button with a fixed thumbnail column, flexible name
  column, duration/price metadata, and right chevron.
- The main service image when available:

```tsx
<img
  src={service.image}
  alt={service.name}
  className="h-full w-full object-cover object-top"
/>
```

- A themed decorative placeholder when `service.image` is absent.
- Long names clamped to two lines.
- An empty state with “No services found” and a clear-search button.
- A typed English/Spanish label dictionary selected from the optional locale
  prop, which defaults to `"en"`.

- [x] **Step 4: Run the structural test and verify GREEN**

Run:

```bash
node --test tests/template-shared-polish.test.mjs
```

Expected: all shared-template tests pass.

### Task 3: Integrate both booking flows

**Files:**
- Modify: `src/components/templates/TemplateOrchestrator.tsx`
- Modify: `src/components/templates/TemplateBooking.tsx`
- Modify: `src/components/templates/CustomerBookingFlow.tsx`
- Modify: `src/components/templates/MockBookingCalendar.tsx`
- Modify: `tests/template-shared-polish.test.mjs`

- [x] **Step 1: Add failing integration assertions**

Extend the structural test:

```js
const customerFlow = await readFile(
  "src/components/templates/CustomerBookingFlow.tsx",
  "utf8",
);
const mockFlow = await readFile(
  "src/components/templates/MockBookingCalendar.tsx",
  "utf8",
);

assert.match(customerFlow, /<BookingServicePicker/);
assert.match(mockFlow, /<BookingServicePicker/);
assert.doesNotMatch(customerFlow, /services\.map\(\(svc, i\)/);
assert.doesNotMatch(mockFlow, /services\.map\(\(svc, i\)/);
```

The structural assertions also verify:

```tsx
<TemplateBooking locale={locale} />
<CustomerBookingFlow locale={locale} />
<MockBookingCalendar locale={locale} />
<BookingServicePicker locale={locale} />
```

Every receiving component declares `locale?: "en" | "es"` and defaults it to
`"en"`.

- [x] **Step 2: Run the structural test and verify RED**

Run:

```bash
node --test tests/template-shared-polish.test.mjs
```

Expected: FAIL because both flows still render their duplicated service lists.

- [x] **Step 3: Replace the live-flow list**

Import `BookingServicePicker` into `CustomerBookingFlow.tsx` and replace only the
service-step list with:

```tsx
<BookingServicePicker
  services={services}
  colors={colors}
  locale={locale}
  onSelect={(service) => {
    setSelectedService(service);
    setSelectedAddOns([]);
    setStep("details");
  }}
/>
```

Do not modify date, details, deposit, confirmation, reschedule, or API behavior.

- [x] **Step 4: Replace the mock-flow list**

Import `BookingServicePicker` into `MockBookingCalendar.tsx` and replace only the
service-step list with:

```tsx
<BookingServicePicker
  services={services}
  colors={colors}
  locale={locale}
  onSelect={(service) => {
    setSelectedService(service);
    setSelectedAddOns([]);
    setStep("details");
  }}
/>
```

- [x] **Step 5: Run the structural test and verify GREEN**

Run:

```bash
node --test tests/template-shared-polish.test.mjs
```

Expected: all shared-template tests pass.

### Task 4: Verify behavior and responsive layout

**Files:**
- Verify: `src/components/templates/BookingServicePicker.tsx`
- Verify: `src/components/templates/CustomerBookingFlow.tsx`
- Verify: `src/components/templates/MockBookingCalendar.tsx`

- [x] **Step 1: Run focused tests**

Run:

```bash
npx tsx --test src/components/templates/booking-service-filter.test.ts
node --test tests/template-shared-polish.test.mjs
```

Expected: all tests pass.

- [x] **Step 2: Run TypeScript**

Run:

```bash
npx tsc --noEmit
```

Expected: exit code 0.

- [x] **Step 3: Verify at 375px**

Open the local booking flow with at least ten services and confirm:

- Search stays visible while the service list scrolls.
- Typing filters immediately and updates the result count.
- Clearing restores all services.
- Each service uses its existing image or the themed fallback.
- Long names wrap to at most two lines.
- No-results state and clear-search action are visible.
- There is no Next, Load More, pagination, or item limit.
- Selecting a service opens the existing date-and-time step.

- [x] **Step 4: Verify the preview flow**

Open the preview/mock booking calendar and confirm the same picker design and
selection behavior are present.

- [x] **Step 5: Commit the focused change**

```bash
git add \
  src/components/templates/booking-service-filter.ts \
  src/components/templates/booking-service-filter.test.ts \
  src/components/templates/BookingServicePicker.tsx \
  src/components/templates/CustomerBookingFlow.tsx \
  src/components/templates/MockBookingCalendar.tsx \
  src/components/templates/TemplateBooking.tsx \
  src/components/templates/TemplateOrchestrator.tsx \
  tests/template-shared-polish.test.mjs \
  docs/superpowers/specs/2026-06-14-booking-service-picker-redesign.md \
  docs/superpowers/plans/2026-06-14-booking-service-picker-redesign.md
git commit -m "feat: redesign booking service picker"
```
