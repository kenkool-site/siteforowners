# Home-Services Estimate Messaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a customer submit a bilingual free-estimate request with optional job photos and deliver the complete request directly to the contractor by configured SMS or WhatsApp without requiring a contractor dashboard.

**Architecture:** A tenant-resolving multipart API validates and persists the lead before attempting photos or messaging. Photos live in a private tenant-scoped Supabase bucket; outbound messages contain 14-day signed links. A Twilio adapter returns provider IDs and errors so delivery state is retained for founder-only diagnostics and resend.

**Tech Stack:** Next.js 14 route handlers, TypeScript strict mode, Supabase PostgreSQL/RLS/Storage, Twilio Node 6, React 18, next-intl, Node test runner through `tsx`.

## Prerequisite

Complete `docs/superpowers/plans/2026-07-11-home-services-template-foundation.md` first. This plan consumes:

- `HomeServicesTemplate`;
- `HomeServicesConfig`;
- `HomeServicesLocale`;
- `normalizeE164()` and public action URL helpers;
- `HomeServicesSiteEditor`; and
- the `#estimate` section boundary.

## Global Constraints

- Never trust a client-supplied `tenant_id`; resolve the tenant from the request Host.
- Save the lead before attempting provider delivery.
- Maximum five photos, 8 MB per photo, and 25 MB total.
- Allowed photo formats: JPEG, PNG, and WebP, verified by file signature.
- Storage bucket is private; paths start with `{tenant_id}/{request_id}/`.
- Signed photo links expire after 14 days.
- Baseline rate limit: five submissions per tenant and source IP per hour.
- Field limits: name 100, phone 32, service 120, location 240, description 2,000 characters.
- The customer job location is private and never appears in public pages or analytics.
- The contractor receives one direct SMS or WhatsApp notification and no SiteForOwners inbox.
- WhatsApp server delivery is enabled only when sender and approved Content SID are configured.
- If notification fails, retain the lead and mark delivery failed.
- If some photo uploads fail, retain the lead, send successful photos, and return a localized warning.
- Client-facing copy must exist in English and Spanish.
- CAPTCHA is out of scope until measured abuse requires it.

---

## File Structure

Create:

- `supabase/migrations/033_estimate_requests.sql` — estimate tables, indexes, RLS, and private bucket.
- `src/lib/validation/estimate-request.ts` — text-field and honeypot validation.
- `src/lib/validation/estimate-request.test.ts` — validator tests.
- `src/lib/validation/estimate-photos.ts` — count, size, and signature validation.
- `src/lib/validation/estimate-photos.test.ts` — photo validator tests.
- `src/lib/estimate-storage.ts` — upload and signed-link helpers.
- `src/lib/estimate-storage.test.ts` — tenant path and partial failure tests.
- `src/lib/estimate-notification.ts` — message formatting and Twilio channel adapter.
- `src/lib/estimate-notification.test.ts` — formatting, SMS, WhatsApp, and failure tests.
- `src/lib/estimate-rate-limit.ts` — exact limiter bucket.
- `src/lib/estimate-rate-limit.test.ts` — bucket test.
- `src/app/api/estimate/route.ts` — public multipart endpoint.
- `tests/estimate-api-contract.test.mjs` — Host resolution and no-client-tenant contract.
- `src/components/templates/home-services/HomeServicesEstimateForm.tsx` — localized form and confirmation.
- `src/app/api/admin/estimate-requests/list/route.ts` — founder-only diagnostics list.
- `src/app/api/admin/estimate-requests/resend/route.ts` — founder-only retry.
- `src/app/(admin)/clients/[tenantId]/edit/EstimateDeliveryDiagnostics.tsx` — minimal internal failed-delivery display.

Modify:

- `src/lib/home-services/types.ts` — notification channel/destination config.
- `src/lib/sms.ts` — expose a result-returning Twilio send seam without changing existing callers.
- `src/components/templates/home-services/HomeServicesTemplate.tsx` — replace direct-contact estimate card with form when configured.
- `src/app/(admin)/clients/[tenantId]/edit/HomeServicesSiteEditor.tsx` — configure delivery and show diagnostics.
- `messages/en.json` and `messages/es.json` — form, validation, partial-photo, and confirmation copy.

---

### Task 1: Add estimate tables and private storage

**Files:**
- Create: `supabase/migrations/033_estimate_requests.sql`

**Interfaces:**
- Produces: `estimate_requests`, `estimate_photos`, and `estimate-photos` bucket.
- Consumed by: storage, API, notifications, and founder diagnostics.

- [ ] **Step 1: Create the migration**

```sql
-- supabase/migrations/033_estimate_requests.sql
CREATE TABLE IF NOT EXISTS estimate_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  service_needed text NOT NULL,
  job_location text NOT NULL,
  description text NOT NULL,
  preferred_response text NOT NULL
    CHECK (preferred_response IN ('call', 'sms', 'whatsapp')),
  locale text NOT NULL CHECK (locale IN ('en', 'es')),
  source_path text,
  notification_channel text
    CHECK (notification_channel IS NULL OR notification_channel IN ('sms', 'whatsapp')),
  notification_destination text,
  notification_state text NOT NULL DEFAULT 'pending'
    CHECK (notification_state IN ('pending', 'sent', 'failed')),
  provider_message_id text,
  provider_error text,
  photo_upload_warning boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz
);

CREATE TABLE IF NOT EXISTS estimate_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  estimate_request_id uuid NOT NULL
    REFERENCES estimate_requests(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  content_type text NOT NULL
    CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 8388608),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, storage_path)
);

CREATE INDEX IF NOT EXISTS estimate_requests_tenant_created_idx
  ON estimate_requests (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS estimate_requests_failed_idx
  ON estimate_requests (tenant_id, created_at DESC)
  WHERE notification_state = 'failed';

CREATE INDEX IF NOT EXISTS estimate_photos_request_idx
  ON estimate_photos (tenant_id, estimate_request_id);

ALTER TABLE estimate_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_photos ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public)
VALUES ('estimate-photos', 'estimate-photos', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Service role manages estimate photos'
  ) THEN
    CREATE POLICY "Service role manages estimate photos"
      ON storage.objects
      FOR ALL
      TO service_role
      USING (bucket_id = 'estimate-photos')
      WITH CHECK (bucket_id = 'estimate-photos');
  END IF;
END $$;
```

No anon/authenticated policies are added. Public writes go through the server
route using `createAdminClient()`.

- [ ] **Step 2: Apply migration in the development Supabase environment**

Use the repository's configured Supabase workflow. If the CLI is linked:

```bash
npx supabase db reset
```

Expected: migration 033 applies without error and creates a private bucket.

If the project does not have a local Supabase environment, run the migration in
the designated development project and record the successful SQL output; do not
apply it to production during implementation.

- [ ] **Step 3: Verify schema invariants**

Run SQL:

```sql
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname IN ('estimate_requests', 'estimate_photos');

SELECT id, public
FROM storage.buckets
WHERE id = 'estimate-photos';
```

Expected: both tables have RLS enabled and the bucket has `public = false`.

- [ ] **Step 4: Commit Task 1**

```bash
git add supabase/migrations/033_estimate_requests.sql
git commit -m "feat: add estimate request storage"
```

---

### Task 2: Implement field, rate-limit, and photo validation

**Files:**
- Create: `src/lib/validation/estimate-request.ts`
- Create: `src/lib/validation/estimate-request.test.ts`
- Create: `src/lib/validation/estimate-photos.ts`
- Create: `src/lib/validation/estimate-photos.test.ts`
- Create: `src/lib/estimate-rate-limit.ts`
- Create: `src/lib/estimate-rate-limit.test.ts`

**Interfaces:**
- Produces: `parseEstimateFormFields()`, `validateEstimatePhotos()`, `estimateRateLimitBucket()`.
- Consumed by: `/api/estimate`.

- [ ] **Step 1: Write failing request-validator tests**

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import { parseEstimateFormFields } from "./estimate-request";

function validForm(): FormData {
  const form = new FormData();
  form.set("name", "Ana Rivera");
  form.set("phone", "(832) 555-0147");
  form.set("service", "Sprinkler Repair");
  form.set("location", "Richmond, TX");
  form.set("description", "One zone does not turn on.");
  form.set("preferred_response", "whatsapp");
  form.set("company_website", "");
  return form;
}

test("parses and normalizes a valid estimate", () => {
  const result = parseEstimateFormFields(validForm(), "en", "/");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.customer_phone, "+18325550147");
    assert.equal(result.value.preferred_response, "whatsapp");
  }
});

test("rejects honeypot submissions", () => {
  const form = validForm();
  form.set("company_website", "https://spam.invalid");
  const result = parseEstimateFormFields(form, "en", "/");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.isSpam, true);
});

test("returns field errors for over-limit values", () => {
  const form = validForm();
  form.set("description", "x".repeat(2001));
  const result = parseEstimateFormFields(form, "en", "/");
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.some((error) => error.field === "description"));
});
```

- [ ] **Step 2: Implement request validation**

```typescript
// src/lib/validation/estimate-request.ts
import { normalizeE164 } from "@/lib/home-services/urls";
import type { HomeServicesLocale } from "@/lib/home-services/types";

export const ESTIMATE_FIELD_LIMITS = {
  name: 100,
  phone: 32,
  service: 120,
  location: 240,
  description: 2000,
} as const;

export type PreferredResponse = "call" | "sms" | "whatsapp";

export interface ParsedEstimateRequest {
  customer_name: string;
  customer_phone: string;
  service_needed: string;
  job_location: string;
  description: string;
  preferred_response: PreferredResponse;
  locale: HomeServicesLocale;
  source_path: string;
}

export type EstimateValidationResult =
  | { ok: true; value: ParsedEstimateRequest }
  | {
      ok: false;
      isSpam: boolean;
      errors: { field: string; reason: "required" | "too_long" | "invalid" }[];
    };

export function parseEstimateFormFields(
  form: FormData,
  locale: HomeServicesLocale,
  sourcePath: string,
): EstimateValidationResult;
```

Implement the function in this order:

1. A non-empty `company_website` returns the spam result with no field errors.
2. Convert each expected field to a trimmed string without coercing objects.
3. Add `required` for empty values and `too_long` for exact limit violations.
4. Normalize phone with `normalizeE164`; add `invalid` when it fails.
5. Accept only `call`, `sms`, or `whatsapp`.
6. Return all errors together; otherwise return normalized database field names.

Do not truncate values silently.

- [ ] **Step 3: Write failing photo-validator tests**

Build small in-memory `File` objects with valid JPEG, PNG, and WebP signatures.
Test:

- six files rejected;
- one file over 8 MB rejected;
- total over 25 MB rejected;
- declared JPEG with PNG bytes rejected;
- executable/random bytes rejected;
- valid JPEG/PNG/WebP accepted with extension derived from detected type.

- [ ] **Step 4: Implement photo validation**

```typescript
// src/lib/validation/estimate-photos.ts
import {
  detectProfileImageType,
  profileImageTypeMatches,
  type ProfileImageType,
} from "@/lib/profile-image";

export const ESTIMATE_PHOTO_LIMITS = {
  maxFiles: 5,
  maxBytesPerFile: 8 * 1024 * 1024,
  maxTotalBytes: 25 * 1024 * 1024,
} as const;

export interface ValidatedEstimatePhoto {
  bytes: Uint8Array;
  contentType: ProfileImageType;
  extension: "jpg" | "png" | "webp";
  sizeBytes: number;
}

export async function validateEstimatePhotos(
  files: File[],
): Promise<
  | { ok: true; photos: ValidatedEstimatePhoto[] }
  | { ok: false; errors: { index: number; reason: string }[] }
>;
```

Implement count and total-size checks before reading every buffer. For each
file, enforce per-file size, detect bytes with `detectProfileImageType`, require
`profileImageTypeMatches(file.type, detected)`, and map detected types to
`jpg`, `png`, or `webp`. Return every failing index together; do not accept a
partly invalid selection.

- [ ] **Step 5: Implement and test the rate-limit bucket**

```typescript
// src/lib/estimate-rate-limit.ts
export const ESTIMATE_RATE_LIMIT = { windowSeconds: 3600, maxRequests: 5 } as const;

export function estimateRateLimitBucket(tenantId: string, ipHash: string): string {
  return `estimate:${tenantId}:${ipHash}`;
}
```

Assert exact output in `estimate-rate-limit.test.ts`.

- [ ] **Step 6: Run Task 2 tests**

```bash
npx tsx --test \
  src/lib/validation/estimate-request.test.ts \
  src/lib/validation/estimate-photos.test.ts \
  src/lib/estimate-rate-limit.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/lib/validation src/lib/estimate-rate-limit*
git commit -m "feat: validate estimate requests and photos"
```

---

### Task 3: Implement private photo storage and signed links

**Files:**
- Create: `src/lib/estimate-storage.ts`
- Create: `src/lib/estimate-storage.test.ts`

**Interfaces:**
- Consumes: `ValidatedEstimatePhoto`, Supabase admin client.
- Produces: `uploadEstimatePhotos()` and `createEstimatePhotoLinks()`.

- [ ] **Step 1: Write failing storage tests with an injected fake client**

Test exact paths:

```typescript
assert.equal(
  estimatePhotoPath("tenant-1", "request-1", "photo-1", "webp"),
  "tenant-1/request-1/photo-1.webp",
);
```

Test that:

- successful uploads return rows for DB insertion;
- one failed upload appears in `failedIndices` while successful uploads remain;
- signed links request `60 * 60 * 24 * 14` seconds;
- no original filename enters a storage path.

- [ ] **Step 2: Implement storage interfaces**

```typescript
export const ESTIMATE_PHOTO_BUCKET = "estimate-photos";
export const ESTIMATE_PHOTO_LINK_SECONDS = 60 * 60 * 24 * 14;

export function estimatePhotoPath(
  tenantId: string,
  requestId: string,
  photoId: string,
  extension: "jpg" | "png" | "webp",
): string {
  return `${tenantId}/${requestId}/${photoId}.${extension}`;
}

export async function uploadEstimatePhotos(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  requestId: string,
  photos: ValidatedEstimatePhoto[],
): Promise<{
  uploaded: {
    id: string;
    tenant_id: string;
    estimate_request_id: string;
    storage_path: string;
    content_type: string;
    size_bytes: number;
  }[];
  failedIndices: number[];
}>;

export async function createEstimatePhotoLinks(
  supabase: ReturnType<typeof createAdminClient>,
  paths: string[],
): Promise<string[]>;
```

Implement `uploadEstimatePhotos` by calling
`supabase.storage.from(ESTIMATE_PHOTO_BUCKET).upload()` once per photo with
`upsert: false` and the detected content type. Collect successful row payloads
and failed source indexes with `Promise.all`.

Implement `createEstimatePhotoLinks` by calling `createSignedUrl()` for each
path with `ESTIMATE_PHOTO_LINK_SECONDS`; return only successful URLs in input
order. Use `crypto.randomUUID()` for `photoId`.

- [ ] **Step 3: Run storage tests**

```bash
npx tsx --test src/lib/estimate-storage.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit Task 3**

```bash
git add src/lib/estimate-storage*
git commit -m "feat: store private estimate photos"
```

---

### Task 4: Add result-returning SMS and WhatsApp delivery

**Files:**
- Create: `src/lib/estimate-notification.ts`
- Create: `src/lib/estimate-notification.test.ts`
- Modify: `src/lib/sms.ts`
- Modify: `src/lib/home-services/types.ts`

**Interfaces:**
- Consumes: customer/job fields, signed links, tenant notification config.
- Produces: `SendEstimateResult` with provider message ID and state.

- [ ] **Step 1: Extend config with notification settings**

```typescript
export type EstimateDeliveryChannel = "sms" | "whatsapp";

export interface HomeServicesNotificationConfig {
  channel: EstimateDeliveryChannel;
  destination_e164: string;
  sms_fallback_e164?: string;
}

export interface HomeServicesConfig {
  notification?: HomeServicesNotificationConfig;
}
```

Add the `notification` property to the interface created in Plan 1 without
changing its existing properties. Update `parseHomeServicesConfig` to accept
only normalized E.164 destinations.
Invalid/missing config means the estimate form is disabled.

- [ ] **Step 2: Write notification tests**

Test:

- formatted message includes business, customer, service, location, preferred
  response, description, and each signed link;
- control characters are removed;
- output is at most 1,500 characters;
- SMS calls `messages.create({ body, to, from })` and returns SID;
- WhatsApp calls `messages.create({ from: "whatsapp:+14155238886", to:
  "whatsapp:+18325550147", contentSid, contentVariables })` in the injected
  test client;
- Twilio rejection returns `{ ok: false, error }` without throwing to the route;
- missing WhatsApp env config returns a failure without calling Twilio.

- [ ] **Step 3: Add an injectable Twilio seam**

```typescript
interface TwilioMessageClient {
  messages: {
    create(input: Record<string, string>): Promise<{ sid: string; status: string }>;
  };
}

export type SendEstimateResult =
  | { ok: true; messageSid: string; providerStatus: string; channel: EstimateDeliveryChannel }
  | { ok: false; error: string; channel: EstimateDeliveryChannel };
```

Keep existing `sms.ts` exports behavior-compatible. Add a new low-level
result-returning function rather than changing existing booking notification
return types.

- [ ] **Step 4: Implement SMS delivery**

Use `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM`. On success,
return `message.sid` and `message.status`. On `RestException`, store a sanitized
error containing Twilio code/status but no credentials.

- [ ] **Step 5: Implement approved-template WhatsApp delivery**

Use:

```typescript
await client.messages.create({
  from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
  to: `whatsapp:${destination}`,
  contentSid: process.env.TWILIO_WHATSAPP_CONTENT_SID!,
  contentVariables: JSON.stringify({ "1": messageBody }),
});
```

Required environment:

- `TWILIO_WHATSAPP_FROM` in E.164 form without the `whatsapp:` prefix;
- `TWILIO_WHATSAPP_CONTENT_SID` for an approved template whose variable `1`
  contains the estimate details.

Do not fall back automatically inside this function. The route performs the
configured SMS fallback and records the actual channel used.

- [ ] **Step 6: Run notification and existing SMS tests**

```bash
npx tsx --test src/lib/estimate-notification.test.ts src/lib/sms.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add src/lib/estimate-notification* src/lib/sms.ts src/lib/home-services/types.ts
git commit -m "feat: deliver estimate notifications"
```

---

### Task 5: Implement the tenant-safe estimate API

**Files:**
- Create: `src/app/api/estimate/route.ts`
- Create: `tests/estimate-api-contract.test.mjs`

**Interfaces:**
- Consumes: tenant resolution, validators, rate limiter, storage, notification adapter.
- Produces: `POST /api/estimate`.

- [ ] **Step 1: Write API source contract**

```javascript
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("estimate API resolves tenant by Host and never reads tenant_id from form", async () => {
  const source = await readFile("src/app/api/estimate/route.ts", "utf8");
  assert.match(source, /resolveTenantByHost/);
  assert.match(source, /getClientIp/);
  assert.match(source, /checkRateLimit/);
  assert.doesNotMatch(source, /formData\.get\(["']tenant_id["']\)/);
  assert.match(source, /notification_state:\s*["']pending["']/);
});
```

- [ ] **Step 2: Run and verify failure**

```bash
npx tsx --test tests/estimate-api-contract.test.mjs
```

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement the route flow**

The handler order is mandatory:

```typescript
export async function POST(request: NextRequest) {
  // 1. resolveTenantByHost(request.headers.get("host"))
  // 2. load the matching preview and parse home_services_config
  // 3. reject non-home_services or missing notification config
  // 4. derive locale and source path from a same-host Referer; default to EN "/"
  // 5. read multipart FormData and short-circuit honeypot with generic success
  // 6. hash IP and enforce 5/hour tenant+IP limit
  // 7. validate fields and photos
  // 8. insert estimate_requests with state pending and destination snapshot
  // 9. upload photos; insert successful estimate_photos rows
  // 10. create signed links
  // 11. send configured channel; try explicit SMS fallback once if configured
  // 12. update sent/failed state, provider SID/error, warning, notified_at
  // 13. return localized machine-readable result
}
```

Return shapes:

```typescript
{ ok: true, photoWarning: boolean }
{ ok: false, code: "invalid", errors: FieldError[] }        // 400
{ ok: false, code: "rate_limited" }                         // 429
{ ok: false, code: "estimate_unavailable" }                 // 503
```

When Twilio fails, return `{ ok: true, photoWarning }` after the lead and failed
state are stored. Do not tell the customer the provider failed.

- [ ] **Step 4: Add DB error handling**

- Request insert failure: return localized-safe 500; do not send.
- Photo row insert failure: mark `photo_upload_warning = true`; continue.
- Final delivery-state update failure: log `[api/estimate]` with request ID and
  return success because the lead is already stored.
- Never log customer description, phone, job address, or signed URLs.

- [ ] **Step 5: Run API contract and type tests**

```bash
npx tsx --test tests/estimate-api-contract.test.mjs
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit Task 5**

```bash
git add src/app/api/estimate/route.ts tests/estimate-api-contract.test.mjs
git commit -m "feat: accept tenant-safe estimate requests"
```

---

### Task 6: Build the bilingual estimate form and confirmation

**Files:**
- Create: `src/components/templates/home-services/HomeServicesEstimateForm.tsx`
- Modify: `src/components/templates/home-services/HomeServicesTemplate.tsx`
- Modify: `messages/en.json`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `/api/estimate`, notification-enabled config, selected locale.
- Produces: accessible multipart form, photo previews, partial-photo warning, direct actions.

- [ ] **Step 1: Add complete translation keys**

Add matching keys for:

- field labels and concise example text;
- preferred response options;
- add/remove photo;
- “maximum five,” “8 MB each,” accepted types;
- required/invalid/too-long errors;
- submitting;
- success;
- partial-photo warning;
- rate limited;
- temporarily unavailable;
- direct Call and Message actions.

Spanish values must be natural translations.

- [ ] **Step 2: Implement form state**

Use controlled text fields, a `File[]` state capped at five, object URL cleanup
for image previews, and `FormData` submission. Set:

```typescript
formData.set("company_website", honeypot);
files.forEach((file) => formData.append("photos", file));
```

Do not set `Content-Type`; the browser adds the multipart boundary.
The API derives `source_path` and locale from a same-host `Referer`. It ignores
client fields named `source_path`, `locale`, or `tenant_id`.

- [ ] **Step 3: Implement prefill**

On mount, read `service` from the URL query and select it only if it matches one
of `data.services`. Service cards should update the query and focus the estimate
heading without a full page reload.

- [ ] **Step 4: Implement success/error states**

On `{ ok: true }`, replace the form with:

- localized receipt confirmation;
- partial-photo warning when returned;
- direct Call and configured Message actions;
- no promised response time unless configured.

On validation failure, map API field errors to inline localized messages and
focus the first invalid field.

- [ ] **Step 5: Gate form publication**

In `HomeServicesTemplate`:

```tsx
const estimateEnabled = Boolean(config.notification?.destination_e164);
```

If disabled, render the existing direct-contact estimate card. Do not render a
form that cannot notify the contractor.

- [ ] **Step 6: Run type/lint/build**

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit Task 6**

```bash
git add src/components/templates/home-services messages
git commit -m "feat: add bilingual estimate request form"
```

---

### Task 7: Add founder-only delivery diagnostics and resend

**Files:**
- Create: `src/app/api/admin/estimate-requests/list/route.ts`
- Create: `src/app/api/admin/estimate-requests/resend/route.ts`
- Create: `src/app/(admin)/clients/[tenantId]/edit/EstimateDeliveryDiagnostics.tsx`
- Modify: `src/app/(admin)/clients/[tenantId]/edit/HomeServicesSiteEditor.tsx`

**Interfaces:**
- Consumes: estimate tables, storage signing, notification adapter, founder auth.
- Produces: internal failed-delivery visibility and one-click resend.

- [ ] **Step 1: Implement founder-authenticated list**

`GET ?tenantId=` must:

- require founder admin session using the existing founder-auth pattern;
- return the latest 20 requests;
- include count and metadata for photos, but not signed URLs;
- expose delivery state/error and request ID;
- never be linked from contractor admin.

- [ ] **Step 2: Implement resend**

`POST { tenantId, requestId }` must:

- require founder auth;
- query by both ID and tenant ID;
- load photo paths and regenerate 14-day links;
- send with the tenant's current configured channel/destination;
- update destination snapshot, channel, state, SID/error, and `notified_at`;
- return 404 for cross-tenant IDs.

- [ ] **Step 3: Add a minimal diagnostics panel**

Show only:

- recent request timestamp and service;
- Sent/Failed badge;
- sanitized failure summary;
- Resend button for failed rows.

Do not add pipeline stages, assignments, notes, or contractor CRM controls.

- [ ] **Step 4: Add notification settings to the founder editor**

Fields:

- channel: SMS or WhatsApp;
- E.164 destination;
- optional SMS fallback;
- visible configuration warning when required Twilio env is absent.

Save through the existing validated `home_services_config` merge.

- [ ] **Step 5: Run admin route contract tests**

Add source/handler tests proving founder auth and tenant-scoped request lookup,
then run:

```bash
npx tsx --test tests/estimate-admin-contract.test.mjs
npx tsc --noEmit
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit Task 7**

```bash
git add src/app/api/admin/estimate-requests "src/app/(admin)/clients/[tenantId]/edit"
git commit -m "feat: add estimate delivery diagnostics"
```

---

### Task 8: End-to-end verification

**Files:**
- Modify only files required by discovered failures.

**Interfaces:**
- Consumes: complete estimate pipeline.
- Produces: verified storage, delivery, failure behavior, and mobile UX.

- [ ] **Step 1: Run automated tests**

```bash
/bin/zsh -lc "npx tsx --test $(rg --files src -g '*.test.ts' | tr '\n' ' ') tests/*.test.mjs"
npx tsc --noEmit
npm run lint
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 2: Verify successful SMS**

Using a non-production tenant and approved test number:

- submit an English request with five valid images;
- confirm one DB request and five photo rows;
- confirm bucket objects are private;
- confirm SMS contains all details and signed links;
- confirm provider SID and `sent` state.

- [ ] **Step 3: Verify partial photo failure**

Force one storage upload to fail:

- request remains saved;
- successful photos remain linked;
- owner message sends;
- `photo_upload_warning = true`;
- customer sees localized warning and direct Message action.

- [ ] **Step 4: Verify provider failure**

Use an invalid test destination:

- request remains saved;
- state becomes `failed`;
- no private fields appear in server logs;
- founder diagnostics shows Resend;
- customer still sees receipt confirmation.

- [ ] **Step 5: Verify WhatsApp when credentials are available**

With an approved Content SID:

- confirm message is accepted and SID stored;
- confirm `from`/`to` use the `whatsapp:` prefix followed by normalized E.164;
- confirm SMS fallback works when WhatsApp is deliberately rejected.

If credentials/templates are unavailable, record WhatsApp manual verification as
blocked; do not claim it passed.

- [ ] **Step 6: Verify 375 px form usability**

Check English and Spanish:

- photo add/remove;
- keyboard-friendly field order;
- inline errors;
- sticky actions do not cover submit;
- success state Call/Message actions;
- no contractor dashboard links.

- [ ] **Step 7: Resolve verification findings in the owning task**

For each defect, add a failing regression test to the task that introduced the
behavior, implement the fix, rerun that task's checks, and use that task's
explicit commit command. Do not create an empty verification commit.

## Plan 2 Exit Criteria

- Valid requests survive photo or provider failures.
- No request trusts browser tenant identity.
- Private photos are tenant-scoped and shared only through 14-day links.
- Contractor receives request details by configured SMS/WhatsApp without login.
- Founder can diagnose and resend failed delivery.
- Form and confirmation are fully bilingual and mobile-usable.
- Plan 3 can link service and area pages into the existing estimate prefill.
