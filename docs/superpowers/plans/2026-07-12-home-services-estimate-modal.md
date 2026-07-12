# Home-Services Estimate Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace home-services estimate anchors with a bilingual two-stage modal that mocks submissions in marketing previews and persists plus independently delivers SMS/WhatsApp and email notifications on demo/live tenant sites.

**Architecture:** `HomeServicesTemplate` owns one modal controller and passes callback actions to every estimate CTA. The form receives an explicit `preview_mock` or `tenant` delivery mode. `/api/estimate` remains Host-resolved and tenant-safe, stores the lead first, then fans out text and email delivery with channel-specific diagnostics.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript strict, next-intl, Supabase PostgreSQL/Storage, Twilio, Resend, Node test runner through `tsx`.

## Global Constraints

- Marketing `/preview/[slug]` submissions never call the estimate API, persist data, upload photos, or notify anyone.
- Demo tenants use real persistence and notifications exactly like live tenants.
- Never accept `tenant_id`, owner phone, or owner email from the public form.
- Resolve tenant identity from Host through `resolveTenantByHost`.
- Required fields are name, phone, service, and city/ZIP.
- Description and up to five photos are optional.
- Preferred response defaults to SMS.
- All customer-facing text is bilingual through `messages/en.json` and `messages/es.json`.
- Every interaction works at 375 px with at least 44 px targets.
- Existing stylist template and booking behavior remain unchanged.
- A stored lead produces customer success even when one or both provider deliveries fail.
- TypeScript remains strict with no `any`.

---

## File Structure

Create:

- `supabase/migrations/035_estimate_delivery_channels.sql` — independent text/email delivery columns and constraints. Migration 034 remains reserved for home-service areas.
- `src/lib/estimate-email.ts` — email formatting, owner-email selection, and Resend delivery.
- `src/lib/estimate-email.test.ts` — pure email payload and destination tests.
- `src/lib/estimate-delivery.ts` — combines channel results into durable update fields.
- `src/lib/estimate-delivery.test.ts` — partial-delivery state tests.
- `src/components/templates/home-services/HomeServicesEstimateModal.tsx` — accessible modal shell and two-stage flow.
- `src/components/templates/home-services/estimate-modal-state.ts` — pure modal open/preselection/reset state reducer.
- `src/components/templates/home-services/estimate-modal-state.test.ts` — controller tests.

Modify:

- `src/lib/validation/estimate-request.ts` and test — optional description and SMS default.
- `src/components/templates/home-services/HomeServicesEstimateForm.tsx` — staged compact fields, mock mode, optional details.
- `src/components/templates/home-services/HomeServicesTemplate.tsx` — shared modal controller and compact CTA panel.
- `HomeServicesHero.tsx`, `HomeServicesNav.tsx`, `HomeServicesServices.tsx`, `HomeServicesMobileActionBar.tsx` — callbacks instead of fragment links.
- `src/components/templates/TemplateRouter.tsx`, marketing `PreviewClient.tsx`, and tenant `SiteClient.tsx` — explicit delivery mode.
- `src/app/api/estimate/route.ts` — owner email lookup, independent fan-out, diagnostics.
- `src/app/api/admin/estimate-requests/list/route.ts` and `resend/route.ts` — channel states and channel-specific retry.
- `EstimateDeliveryDiagnostics.tsx` — show text/email results and retry controls.
- `messages/en.json` and `messages/es.json` — modal, optional, mock-success, and progress copy.
- Contract tests under `tests/` — preview isolation and shared-modal wiring.

---

### Task 1: Make estimate details optional and default follow-up to SMS

**Files:**
- Modify: `src/lib/validation/estimate-request.ts`
- Modify: `src/lib/validation/estimate-request.test.ts`

**Interfaces:**
- Produces: `parseEstimateFormFields()` returning `description: ""` when absent and `preferred_response: "sms"` when absent.
- Consumed by: Task 5 API and Task 3 form.

- [ ] **Step 1: Write failing validator tests**

```typescript
test("accepts omitted optional details and defaults response to SMS", () => {
  const form = validForm();
  form.delete("description");
  form.delete("preferred_response");
  const result = parseEstimateFormFields(form, "en", "/");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.description, "");
    assert.equal(result.value.preferred_response, "sms");
  }
});

test("still enforces description length when supplied", () => {
  const form = validForm();
  form.set("description", "x".repeat(2001));
  const result = parseEstimateFormFields(form, "en", "/");
  assert.equal(result.ok, false);
});
```

- [ ] **Step 2: Run the tests and verify the first test fails**

Run: `npx tsx --test src/lib/validation/estimate-request.test.ts`  
Expected: FAIL because description and preferred response are currently required.

- [ ] **Step 3: Implement optional parsing**

Change the required-field list to `name`, `phone`, `service`, and `location` only. Set:

```typescript
const description = optionalString(form.get("description"));
const preferredResponseRaw = optionalString(form.get("preferred_response"));
const preferredResponse: PreferredResponse = preferredResponseRaw
  ? parsePreferredResponse(preferredResponseRaw)
  : "sms";
```

Keep `ESTIMATE_FIELD_LIMITS.description` validation when `description.length > 0`.

- [ ] **Step 4: Run validator tests**

Run: `npx tsx --test src/lib/validation/estimate-request.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation/estimate-request.ts src/lib/validation/estimate-request.test.ts
git commit -m "feat: simplify estimate request requirements"
```

---

### Task 2: Add independent text and email delivery state

**Files:**
- Create: `supabase/migrations/035_estimate_delivery_channels.sql`
- Create: `src/lib/estimate-delivery.ts`
- Create: `src/lib/estimate-delivery.test.ts`

**Interfaces:**
- Produces: `EstimateChannelResult`, `estimateDeliveryUpdate(text, email)`.
- Consumed by: Task 5 API and Task 6 diagnostics.

- [ ] **Step 1: Write failing state-mapping tests**

```typescript
test("maps independent text and email results", () => {
  assert.deepEqual(
    estimateDeliveryUpdate(
      { state: "sent", providerId: "SM1" },
      { state: "failed", error: "Resend unavailable", destination: "owner@example.com" },
    ),
    {
      text_notification_state: "sent",
      text_provider_message_id: "SM1",
      text_provider_error: null,
      email_notification_state: "failed",
      email_provider_message_id: null,
      email_provider_error: "Resend unavailable",
      email_notification_destination: "owner@example.com",
    },
  );
});
```

- [ ] **Step 2: Run and verify missing-module failure**

Run: `npx tsx --test src/lib/estimate-delivery.test.ts`  
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Create migration**

```sql
ALTER TABLE estimate_requests
  ADD COLUMN IF NOT EXISTS text_notification_state text NOT NULL DEFAULT 'pending'
    CHECK (text_notification_state IN ('not_configured', 'pending', 'sent', 'failed')),
  ADD COLUMN IF NOT EXISTS text_provider_message_id text,
  ADD COLUMN IF NOT EXISTS text_provider_error text,
  ADD COLUMN IF NOT EXISTS email_notification_state text NOT NULL DEFAULT 'not_configured'
    CHECK (email_notification_state IN ('not_configured', 'pending', 'sent', 'failed')),
  ADD COLUMN IF NOT EXISTS email_provider_message_id text,
  ADD COLUMN IF NOT EXISTS email_provider_error text,
  ADD COLUMN IF NOT EXISTS email_notification_destination text;
```

- [ ] **Step 4: Implement result mapping**

```typescript
export type EstimateChannelResult =
  | { state: "not_configured"; destination?: string }
  | { state: "sent"; providerId: string; destination?: string }
  | { state: "failed"; error: string; destination?: string };

export function estimateDeliveryUpdate(
  text: EstimateChannelResult,
  email: EstimateChannelResult,
): Record<string, string | null> {
  return {
    text_notification_state: text.state,
    text_provider_message_id: text.state === "sent" ? text.providerId : null,
    text_provider_error: text.state === "failed" ? text.error : null,
    email_notification_state: email.state,
    email_provider_message_id: email.state === "sent" ? email.providerId : null,
    email_provider_error: email.state === "failed" ? email.error : null,
    email_notification_destination: email.destination ?? null,
  };
}
```

- [ ] **Step 5: Run tests and verify migration syntax using the repository development Supabase workflow**

Run: `npx tsx --test src/lib/estimate-delivery.test.ts`  
Expected: PASS. Apply migration only to the designated development environment, not production.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/035_estimate_delivery_channels.sql src/lib/estimate-delivery.ts src/lib/estimate-delivery.test.ts
git commit -m "feat: track estimate delivery by channel"
```

---

### Task 3: Build owner email notification

**Files:**
- Create: `src/lib/estimate-email.ts`
- Create: `src/lib/estimate-email.test.ts`

**Interfaces:**
- Produces: `selectEstimateOwnerEmail(tenant)`, `formatEstimateEmail(input)`, `sendEstimateEmail(destination, input, options?)`.
- Consumed by: Task 5.

- [ ] **Step 1: Write failing pure tests**

```typescript
test("prefers tenant email then admin email", () => {
  assert.equal(selectEstimateOwnerEmail({ email: " owner@example.com ", admin_email: "admin@example.com" }), "owner@example.com");
  assert.equal(selectEstimateOwnerEmail({ email: null, admin_email: " admin@example.com " }), "admin@example.com");
  assert.equal(selectEstimateOwnerEmail({ email: null, admin_email: null }), null);
});

test("omits empty optional description", () => {
  const email = formatEstimateEmail({ ...input, description: "" });
  assert.doesNotMatch(email.text, /Details:/);
  assert.match(email.subject, /New estimate request/);
});
```

- [ ] **Step 2: Run and verify missing-module failure**

Run: `npx tsx --test src/lib/estimate-email.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement selection and formatting**

```typescript
export function selectEstimateOwnerEmail(tenant: {
  email?: string | null;
  admin_email?: string | null;
}): string | null {
  return tenant.email?.trim() || tenant.admin_email?.trim() || null;
}

export function formatEstimateEmail(input: EstimateMessageInput) {
  const details = input.description.trim()
    ? `\nDetails: ${sanitizeEstimateText(input.description)}`
    : "";
  return {
    subject: `New estimate request — ${sanitizeEstimateText(input.businessName)}`,
    text: `Customer: ${sanitizeEstimateText(input.customerName)}\nPhone: ${input.customerPhone}\nService: ${sanitizeEstimateText(input.serviceNeeded)}\nLocation: ${sanitizeEstimateText(input.jobLocation)}${details}`,
  };
}
```

Use the existing Resend configuration pattern from `src/lib/email.ts`. Return
`{ ok: true, providerId } | { ok: false, error }`; never throw provider details
through the public route.

- [ ] **Step 4: Add an injected-client delivery test and implementation**

Test a fake `{ emails: { send } }` client returning `{ data: { id: "em_1" }, error: null }`, then test an error result. Implement `sendEstimateEmail` with optional injected client for deterministic tests.

- [ ] **Step 5: Run tests**

Run: `npx tsx --test src/lib/estimate-email.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/estimate-email.ts src/lib/estimate-email.test.ts
git commit -m "feat: add estimate owner email notification"
```

---

### Task 4: Replace estimate links with one accessible modal

**Files:**
- Create: `src/components/templates/home-services/estimate-modal-state.ts`
- Create: `src/components/templates/home-services/estimate-modal-state.test.ts`
- Create: `src/components/templates/home-services/HomeServicesEstimateModal.tsx`
- Modify: `HomeServicesEstimateForm.tsx`, `HomeServicesTemplate.tsx`, `HomeServicesHero.tsx`, `HomeServicesNav.tsx`, `HomeServicesServices.tsx`, `HomeServicesMobileActionBar.tsx`
- Modify: `TemplateRouter.tsx`, marketing `PreviewClient.tsx`, tenant `SiteClient.tsx`
- Modify: `messages/en.json`, `messages/es.json`
- Modify: `tests/home-services-template-contract.test.mjs`

**Interfaces:**
- Produces: `EstimateDeliveryMode = "preview_mock" | "tenant"`, `onEstimate(serviceName?)`, `HomeServicesEstimateModal`.
- Consumed by: every home-services CTA.

- [ ] **Step 1: Write failing controller and contract tests**

```typescript
test("opens with a preselected service and resets after completion", () => {
  const opened = estimateModalReducer(initialEstimateModalState, { type: "open", service: "Tree Trimming" });
  assert.deepEqual(opened, { open: true, service: "Tree Trimming", completed: false });
  const completed = estimateModalReducer(opened, { type: "complete" });
  assert.equal(estimateModalReducer(completed, { type: "close" }).service, "");
});
```

Add source contracts asserting CTAs use `onEstimate`, no home-services component builds `#estimate`, and `PreviewClient` passes `deliveryMode="preview_mock"` while `SiteClient` passes `deliveryMode="tenant"`.

- [ ] **Step 2: Run and verify failures**

Run: `npx tsx --test src/components/templates/home-services/estimate-modal-state.test.ts tests/home-services-template-contract.test.mjs`  
Expected: FAIL.

- [ ] **Step 3: Implement reducer and explicit router props**

```typescript
export type EstimateDeliveryMode = "preview_mock" | "tenant";
export interface EstimateModalState { open: boolean; service: string; completed: boolean }
export const initialEstimateModalState: EstimateModalState = { open: false, service: "", completed: false };
```

Extend `TemplateRouterProps` and `HomeServicesTemplateProps` with
`estimateDeliveryMode`. Marketing preview passes `preview_mock`; tenant site
passes `tenant` regardless of `isDemo`.

- [ ] **Step 4: Implement the modal shell**

Use the existing shadcn Dialog primitives if installed; otherwise use a fixed
dialog with `role="dialog"`, `aria-modal="true"`, labeled title, focus trap,
Escape handler, body scroll lock, and trigger-focus restoration. Render stage
progress “1 of 2” / “2 of 2”, Back, Continue, Submit, and Close using message
catalog keys.

- [ ] **Step 5: Refactor form and CTAs**

Move the existing fields into stages. Initialize `preferredResponse: "sms"`.
Mark description and photos optional. In `preview_mock`, run client validation,
wait 500 ms, set the mock success state, and never call `fetch`. In `tenant`,
retain `POST /api/estimate`.

Replace every `estimateHref` prop with:

```typescript
onEstimate: (serviceName?: string) => void
```

Service cards call `onEstimate(service.name)`; other CTAs call `onEstimate()`.
The bottom estimate section becomes one card with an open-modal button.

- [ ] **Step 6: Add bilingual messages**

Add exact keys for modal title, stage labels, optional marker, city/ZIP label,
Back, Continue, sample success title/body, and close. Spanish success copy must
say the request was simulated and no contractor was contacted.

- [ ] **Step 7: Run tests and TypeScript**

Run:

```bash
npx tsx --test src/components/templates/home-services/estimate-modal-state.test.ts tests/home-services-template-contract.test.mjs
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/templates src/app/'(marketing)'/preview/'[slug]'/PreviewClient.tsx src/app/site/'[slug]'/SiteClient.tsx messages tests/home-services-template-contract.test.mjs
git commit -m "feat: open estimates in a bilingual modal"
```

---

### Task 5: Fan out tenant estimate delivery to text and email

**Files:**
- Modify: `src/app/api/estimate/route.ts`
- Modify: `src/lib/estimate-notification.ts` and test
- Modify: `tests/estimate-api-contract.test.mjs`

**Interfaces:**
- Consumes: `selectEstimateOwnerEmail`, `sendEstimateEmail`, `estimateDeliveryUpdate`.
- Produces: persisted leads with independent channel outcomes.

- [ ] **Step 1: Write failing API contracts**

Assert the tenant lookup selects `email, admin_email`, the route calls both
`sendEstimateNotification` and `sendEstimateEmail`, no form field provides an
owner destination, and insertion is allowed when either text or email exists.

- [ ] **Step 2: Run and verify failures**

Run: `npx tsx --test tests/estimate-api-contract.test.mjs`  
Expected: FAIL.

- [ ] **Step 3: Load owner destinations safely**

Extend the Host-resolved tenant query/result to include `email` and
`admin_email`. Compute:

```typescript
const ownerEmail = selectEstimateOwnerEmail(tenant);
const textNotification = config.notification;
if (!textNotification?.destination_e164 && !ownerEmail) {
  return NextResponse.json({ ok: false, code: "estimate_unavailable" }, { status: 503 });
}
```

Initialize channel states as `pending` when configured and `not_configured`
otherwise during insertion.

- [ ] **Step 4: Deliver both channels independently**

After photo links are available, build one `EstimateMessageInput`. Run configured
deliveries with `Promise.all`, converting every provider result to
`EstimateChannelResult`; do not allow one rejection to skip the other. Preserve
WhatsApp-to-SMS fallback. Update channel columns with
`estimateDeliveryUpdate(textResult, emailResult)` and continue populating legacy
text columns.

- [ ] **Step 5: Verify partial failure behavior**

Add tests for text success/email failure, text failure/email success, both
failure, and email-only configuration. Each expects the public response
`{ ok: true }` after persistence.

- [ ] **Step 6: Run focused tests and TypeScript**

```bash
npx tsx --test src/lib/estimate-notification.test.ts src/lib/estimate-email.test.ts src/lib/estimate-delivery.test.ts tests/estimate-api-contract.test.mjs
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/estimate/route.ts src/lib/estimate-notification.ts src/lib/estimate-notification.test.ts tests/estimate-api-contract.test.mjs
git commit -m "feat: deliver estimates by text and email"
```

---

### Task 6: Expose channel diagnostics and retries

**Files:**
- Modify: `src/app/api/admin/estimate-requests/list/route.ts`
- Modify: `src/app/api/admin/estimate-requests/resend/route.ts`
- Modify: `src/app/(admin)/clients/[tenantId]/edit/EstimateDeliveryDiagnostics.tsx`
- Modify: `tests/estimate-admin-contract.test.mjs`

**Interfaces:**
- Consumes: channel-state columns and notification senders.
- Produces: founder-visible text/email state and channel-specific retry.

- [ ] **Step 1: Write failing admin contracts**

Assert list output contains `text_notification_state` and
`email_notification_state`; resend accepts only `{ requestId, channel: "text" |
"email" }`; and the UI renders separate labels and retry buttons.

- [ ] **Step 2: Run and verify failures**

Run: `npx tsx --test tests/estimate-admin-contract.test.mjs`  
Expected: FAIL.

- [ ] **Step 3: Extend list response and diagnostics UI**

Select and return all channel state, destination, provider ID, and error fields.
Render “Text” and “Email” rows independently. Show Retry only for a configured
failed channel.

- [ ] **Step 4: Implement channel-specific resend**

Validate channel exactly. For `text`, regenerate photo links and use existing
Twilio fallback. For `email`, reload the tenant email safely and use Resend.
Update only that channel’s fields; preserve the other channel state.

- [ ] **Step 5: Run admin and focused regression tests**

```bash
npx tsx --test tests/estimate-admin-contract.test.mjs tests/estimate-api-contract.test.mjs
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/estimate-requests src/app/'(admin)'/clients/'[tenantId]'/edit/EstimateDeliveryDiagnostics.tsx tests/estimate-admin-contract.test.mjs
git commit -m "feat: diagnose estimate delivery channels"
```

---

### Task 7: End-to-end verification

**Files:**
- Verify only; modify production files only for defects exposed by verification.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: release evidence.

- [ ] **Step 1: Run all TypeScript and contract tests**

```bash
rg --files src tests -g '*.test.ts' -g '*.test.mjs' -0 | xargs -0 npx tsx --test
npx tsc --noEmit
```

Expected: all feature tests pass. Record unrelated pre-existing failures without
changing unrelated code.

- [ ] **Step 2: Run production build**

Run: `npm run build`  
Expected: exit 0.

- [ ] **Step 3: Verify marketing preview manually**

Open a home-services `/preview/[slug]`, verify every CTA opens the modal, a
service card preselects its service, English/Spanish switching stays in preview,
and submit shows sample success without an `/api/estimate` network request.

- [ ] **Step 4: Verify a development demo tenant manually**

On a development demo tenant host, submit the minimum required fields and verify:
one `estimate_requests` row, default `preferred_response = 'sms'`, configured
text delivery attempt, email attempt when available, and channel states in
founder diagnostics. Do not send test notifications to a real prospect.

- [ ] **Step 5: Record final repository state**

Run: `git status --short && git log -7 --oneline`  
Expected: no uncommitted feature changes and one focused commit for each completed task.
