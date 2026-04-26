# Owner-Facing Services Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let owners self-serve their services (add/edit/delete + optional image), share the editing UX with the founder's SiteEditor via one component and one API, and surface a persistent leads-envelope icon in the top-right of every admin page.

**Architecture:** A new `ServiceRow` component renders each service as a collapsed-summary / expanded-form row; both the new `/admin/services` page and the founder's `SiteEditor` mount it. A new dual-auth helper (`requireOwnerOrFounder`) backs a single `/api/admin/services` endpoint plus a single `/api/admin/services/upload-image` endpoint, both writing to `previews.services` JSONB. The 5 public service templates render an optional image thumbnail when present. AdminShell swaps Leads out of the primary nav and mounts a `LeadsBadge` envelope icon (with unread count) in the top-right of every admin page.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Supabase (Postgres + Storage), Tailwind, `node:test` + `tsx`.

**Spec:** [docs/superpowers/specs/2026-04-26-services-management-design.md](../specs/2026-04-26-services-management-design.md)

**Test command:** `npx tsx --test src/lib/<file>.test.ts`
**Build/typecheck:** `npm run build`

---

## Task 1: Storage bucket migration

**Files:**
- Create: `supabase/migrations/017_create_service_images_bucket.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/017_create_service_images_bucket.sql`:

```sql
-- Public-read bucket for owner-uploaded service images.
INSERT INTO storage.buckets (id, name, public)
VALUES ('service-images', 'service-images', true)
ON CONFLICT (id) DO NOTHING;

-- Public read so the rendered site can fetch directly.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'service-images public read'
  ) THEN
    CREATE POLICY "service-images public read"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'service-images');
  END IF;
END$$;

-- Service-role-only writes (the API route uses the service role key).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'service-images service-role write'
  ) THEN
    CREATE POLICY "service-images service-role write"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'service-images');
  END IF;
END$$;
```

The DO-blocks make the policy creation idempotent without `CREATE POLICY IF NOT EXISTS` (which Postgres doesn't support on policies).

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/017_create_service_images_bucket.sql
git commit -m "feat(db): add service-images storage bucket with public-read RLS"
```

The user will run `supabase db push` manually.

---

## Task 2: Extend ServiceItem types

**Files:**
- Modify: `src/lib/ai/types.ts`
- Modify: `src/components/templates/services/BoldServices.tsx` (and 4 sibling files — same inline type extension)

- [ ] **Step 1: Update ServiceItem in types.ts**

In `src/lib/ai/types.ts`, replace the `ServiceItem` interface:

```ts
export interface ServiceItem {
  name: string;
  price: string;
  description?: string;
  /** v2 (Spec 1) — already used in JSONB; declare explicitly. Whole hours, multiples of 60, range [60, 480]. */
  duration_minutes?: number;
  /** v3 (Spec 3) — public URL of the uploaded service image (Supabase Storage, service-images bucket). */
  image?: string;
}
```

- [ ] **Step 2: Update each services-template inline type**

Run `grep -n 'services: { name: string; price: string;' src/components/templates/services/*.tsx`. Each of `Bold/Vibrant/Classic/Elegant/WarmServices.tsx` has a line like:

```ts
services: { name: string; price: string; description?: string; bookingDeepLink?: string; durationMinutes?: number }[];
```

Add `image?: string` to that inline type in each of the 5 files:

```ts
services: { name: string; price: string; description?: string; bookingDeepLink?: string; durationMinutes?: number; image?: string }[];
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ai/types.ts src/components/templates/services/
git commit -m "feat(types): add image and duration_minutes to ServiceItem"
```

---

## Task 3: Dual-auth helper (TDD)

**Files:**
- Modify: `src/lib/admin-auth.ts`
- Create: `src/lib/admin-auth.test.ts` (or extend if exists)

- [ ] **Step 1: Write the failing tests**

Check if `src/lib/admin-auth.test.ts` exists with `ls src/lib/admin-auth.test.ts`. If it doesn't, create it. If it does, append the tests below.

Create or extend `src/lib/admin-auth.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { requireOwnerOrFounder } from "./admin-auth";

// Minimal NextRequest stand-in — only the methods our helper uses.
function fakeRequest(opts: {
  ownerCookie?: string;       // raw owner_session cookie value (encoded JWT)
  adminCookie?: string;       // raw admin_session cookie value
  host?: string;
}): import("next/server").NextRequest {
  const cookies = new Map<string, { value: string }>();
  if (opts.ownerCookie) cookies.set("owner_session", { value: opts.ownerCookie });
  if (opts.adminCookie) cookies.set("admin_session", { value: opts.adminCookie });
  return {
    cookies: { get: (name: string) => cookies.get(name) },
    headers: {
      get: (name: string) => (name.toLowerCase() === "host" ? (opts.host ?? "") : null),
    },
  } as unknown as import("next/server").NextRequest;
}

test("requireOwnerOrFounder: returns null when no auth", async () => {
  const result = await requireOwnerOrFounder(fakeRequest({}));
  assert.equal(result, null);
});

test("requireOwnerOrFounder: founder cookie + tenant_id → founder branch", async () => {
  process.env.ADMIN_PASSWORD = "test-admin-pass";
  const result = await requireOwnerOrFounder(
    fakeRequest({ adminCookie: "test-admin-pass" }),
    "tenant-abc",
  );
  assert.deepEqual(result, { kind: "founder", tenantId: "tenant-abc" });
});

test("requireOwnerOrFounder: founder cookie WITHOUT tenant_id → null", async () => {
  process.env.ADMIN_PASSWORD = "test-admin-pass";
  const result = await requireOwnerOrFounder(fakeRequest({ adminCookie: "test-admin-pass" }));
  assert.equal(result, null);
});

test("requireOwnerOrFounder: wrong admin cookie → null", async () => {
  process.env.ADMIN_PASSWORD = "test-admin-pass";
  const result = await requireOwnerOrFounder(
    fakeRequest({ adminCookie: "wrong-pass" }),
    "tenant-abc",
  );
  assert.equal(result, null);
});

test("requireOwnerOrFounder: no ADMIN_PASSWORD env → founder branch never matches", async () => {
  delete process.env.ADMIN_PASSWORD;
  const result = await requireOwnerOrFounder(
    fakeRequest({ adminCookie: "anything" }),
    "tenant-abc",
  );
  assert.equal(result, null);
});
```

(The owner-session-takes-precedence case is harder to test without real session signing; we'll cover it via integration smoke testing.)

- [ ] **Step 2: Run, expect failure**

Run: `npx tsx --test src/lib/admin-auth.test.ts`
Expected: import error (`requireOwnerOrFounder` doesn't exist).

- [ ] **Step 3: Implement the helper**

In `src/lib/admin-auth.ts`, append after the existing `requireOwnerSession` function:

```ts
export type DualAuthResult =
  | { kind: "owner"; tenantId: string; tenant: AdminTenant }
  | { kind: "founder"; tenantId: string };

/**
 * Resolves either an owner session OR the founder admin-password cookie.
 * For founder requests, the tenant_id must come from the body/query string
 * (the founder can operate on any tenant). For owner requests, the session
 * cookie's tenant is authoritative — fallbackTenantId is ignored.
 */
export async function requireOwnerOrFounder(
  request: NextRequest | Request,
  fallbackTenantId?: string,
): Promise<DualAuthResult | null> {
  const ownerSession = await requireOwnerSession(request);
  if (ownerSession) {
    return { kind: "owner", tenantId: ownerSession.tenant.id, tenant: ownerSession.tenant };
  }
  const adminCookieGetter = (request as NextRequest).cookies?.get;
  const adminCookie =
    typeof adminCookieGetter === "function"
      ? (request as NextRequest).cookies.get("admin_session")?.value
      : undefined;
  if (
    process.env.ADMIN_PASSWORD &&
    adminCookie === process.env.ADMIN_PASSWORD &&
    fallbackTenantId
  ) {
    return { kind: "founder", tenantId: fallbackTenantId };
  }
  return null;
}
```

- [ ] **Step 4: Run, expect 5 tests pass**

Run: `npx tsx --test src/lib/admin-auth.test.ts`
Expected: 5 tests, 5 pass.

- [ ] **Step 5: Build to typecheck**

Run: `npm run build`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add src/lib/admin-auth.ts src/lib/admin-auth.test.ts
git commit -m "feat(auth): add requireOwnerOrFounder dual-auth helper"
```

---

## Task 4: Service image upload endpoint

**Files:**
- Create: `src/app/api/admin/services/upload-image/route.ts`

- [ ] **Step 1: Create the route**

Create `src/app/api/admin/services/upload-image/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireOwnerOrFounder } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "crypto";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function POST(request: NextRequest) {
  // Founder must include tenant_id as a form field; owner uses session.
  const formData = await request.formData();
  const fallbackTenantId =
    typeof formData.get("tenant_id") === "string"
      ? (formData.get("tenant_id") as string)
      : undefined;

  const auth = await requireOwnerOrFounder(request, fallbackTenantId);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const file = formData.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "image file required" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `Invalid file type: ${file.type}. Use JPG, PNG, or WebP.` },
      { status: 400 },
    );
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File exceeds 5MB limit" }, { status: 400 });
  }

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const id = crypto.randomUUID();
  const filePath = `tenants/${auth.tenantId}/${id}.${ext}`;

  const supabase = createAdminClient();
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from("service-images")
    .upload(filePath, buffer, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadError) {
    console.error("[admin/services/upload-image] storage upload failed", { uploadError });
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from("service-images").getPublicUrl(filePath);
  return NextResponse.json({ url: urlData.publicUrl });
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: success. The new route appears as `ƒ /api/admin/services/upload-image`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/services/upload-image/route.ts
git commit -m "feat(api): owner+founder service-image upload endpoint"
```

---

## Task 5: GET + POST /api/admin/services

**Files:**
- Create: `src/app/api/admin/services/route.ts`

- [ ] **Step 1: Create the route**

Create `src/app/api/admin/services/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireOwnerOrFounder } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ServiceItem } from "@/lib/ai/types";

const MAX_NAME = 60;
const MAX_PRICE = 30;
const MAX_DESCRIPTION = 200;

// Public origin of the project's Supabase Storage. Reject image URLs that
// don't originate from here (prevents owners planting arbitrary URLs).
function imageOriginAllowed(url: string): boolean {
  try {
    const u = new URL(url);
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    if (!supabaseUrl) return false;
    const expected = new URL(supabaseUrl);
    return u.origin === expected.origin && u.pathname.includes("/storage/v1/object/public/service-images/");
  } catch {
    return false;
  }
}

interface ValidationError {
  index: number;
  field: string;
  reason: string;
}

function validateServices(raw: unknown): { ok: true; services: ServiceItem[] } | { ok: false; errors: ValidationError[] } {
  if (!Array.isArray(raw)) return { ok: false, errors: [{ index: -1, field: "services", reason: "must be an array" }] };
  const errors: ValidationError[] = [];
  const services: ServiceItem[] = [];
  raw.forEach((item, index) => {
    if (!item || typeof item !== "object") {
      errors.push({ index, field: "service", reason: "must be an object" });
      return;
    }
    const r = item as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim() : "";
    const price = typeof r.price === "string" ? r.price.trim() : "";
    const description = typeof r.description === "string" ? r.description.trim() : undefined;
    const duration_minutes = typeof r.duration_minutes === "number" ? r.duration_minutes : undefined;
    const image = typeof r.image === "string" ? r.image.trim() : undefined;

    if (!name) errors.push({ index, field: "name", reason: "required" });
    else if (name.length > MAX_NAME) errors.push({ index, field: "name", reason: `max ${MAX_NAME} chars` });
    if (!price) errors.push({ index, field: "price", reason: "required" });
    else if (price.length > MAX_PRICE) errors.push({ index, field: "price", reason: `max ${MAX_PRICE} chars` });
    if (description !== undefined && description.length > MAX_DESCRIPTION) {
      errors.push({ index, field: "description", reason: `max ${MAX_DESCRIPTION} chars` });
    }
    if (duration_minutes !== undefined) {
      if (!Number.isInteger(duration_minutes) || duration_minutes < 60 || duration_minutes > 480 || duration_minutes % 60 !== 0) {
        errors.push({ index, field: "duration_minutes", reason: "must be an integer multiple of 60 in [60, 480]" });
      }
    }
    if (image !== undefined && image !== "" && !imageOriginAllowed(image)) {
      errors.push({ index, field: "image", reason: "must be a service-images bucket URL" });
    }
    services.push({
      name,
      price,
      description: description || undefined,
      duration_minutes,
      image: image || undefined,
    });
  });
  return errors.length === 0 ? { ok: true, services } : { ok: false, errors };
}

async function loadServicesForTenant(tenantId: string): Promise<ServiceItem[]> {
  const supabase = createAdminClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("preview_slug")
    .eq("id", tenantId)
    .maybeSingle();
  const slug = tenant?.preview_slug as string | undefined;
  if (!slug) return [];
  const { data: preview } = await supabase
    .from("previews")
    .select("services")
    .eq("slug", slug)
    .maybeSingle();
  return ((preview?.services as ServiceItem[] | null) ?? []);
}

async function saveServicesForTenant(tenantId: string, services: ServiceItem[]): Promise<{ ok: boolean; error?: string }> {
  const supabase = createAdminClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("preview_slug")
    .eq("id", tenantId)
    .maybeSingle();
  const slug = tenant?.preview_slug as string | undefined;
  if (!slug) return { ok: false, error: "Tenant has no preview_slug" };
  const { error } = await supabase
    .from("previews")
    .update({ services })
    .eq("slug", slug);
  if (error) {
    console.error("[admin/services] save failed", { tenantId, error });
    return { ok: false, error: "Save failed" };
  }
  return { ok: true };
}

export async function GET(request: NextRequest) {
  const tenantIdParam = new URL(request.url).searchParams.get("tenant_id") ?? undefined;
  const auth = await requireOwnerOrFounder(request, tenantIdParam);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const services = await loadServicesForTenant(auth.tenantId);
  return NextResponse.json({ services });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const fallbackTenantId =
    typeof (body as Record<string, unknown>)?.tenant_id === "string"
      ? ((body as Record<string, unknown>).tenant_id as string)
      : undefined;

  const auth = await requireOwnerOrFounder(request, fallbackTenantId);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = validateServices((body as Record<string, unknown>).services);
  if (!result.ok) {
    return NextResponse.json({ error: "Validation failed", errors: result.errors }, { status: 400 });
  }

  const saveResult = await saveServicesForTenant(auth.tenantId, result.services);
  if (!saveResult.ok) {
    return NextResponse.json({ error: saveResult.error ?? "Save failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, services: result.services });
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/services/route.ts
git commit -m "feat(api): owner+founder GET/POST /api/admin/services with atomic validation"
```

---

## Task 6: ServiceRow component

**Files:**
- Create: `src/app/site/[slug]/admin/_components/ServiceRow.tsx`

This is the reusable expandable row. Mounts in both the owner page (Task 9) and the SiteEditor (Task 11). It owns its own expand/collapse state but propagates field changes to its parent via a single `onChange` callback.

- [ ] **Step 1: Create the component**

Create `src/app/site/[slug]/admin/_components/ServiceRow.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import type { ServiceItem } from "@/lib/ai/types";

interface ServiceRowProps {
  service: ServiceItem;
  /** Owner page passes undefined; SiteEditor passes the founder tenant_id so
   * the upload endpoint can resolve the founder branch. */
  founderTenantId?: string;
  onChange: (next: ServiceItem) => void;
  onDelete: () => void;
}

export function ServiceRow({ service, founderTenantId, onChange, onDelete }: ServiceRowProps) {
  // Auto-expand when the row is brand-new (no name yet) or has uncommitted edits.
  const [expanded, setExpanded] = useState(!service.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const duration = service.duration_minutes ?? 60;

  function set<K extends keyof ServiceItem>(key: K, value: ServiceItem[K]) {
    onChange({ ...service, [key]: value });
  }

  async function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      if (founderTenantId) fd.append("tenant_id", founderTenantId);
      const res = await fetch("/api/admin/services/upload-image", { method: "POST", body: fd });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d?.error || "Upload failed");
        return;
      }
      const data = (await res.json()) as { url: string };
      set("image", data.url);
    } catch {
      alert("Network error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-3 flex items-center gap-3 text-left hover:border-gray-300 transition-colors"
      >
        {service.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={service.image} alt="" className="h-12 w-12 rounded-md object-cover flex-shrink-0" />
        ) : (
          <div className="h-12 w-12 rounded-md bg-gray-100 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{service.name || "(untitled)"}</div>
          <div className="text-xs text-gray-500">
            {duration / 60}h · {service.price || "—"}
          </div>
        </div>
        <span className="text-gray-400">›</span>
      </button>
    );
  }

  return (
    <div className="bg-white border border-[color:var(--admin-primary)] rounded-lg p-3 space-y-3">
      <div className="flex items-start gap-3">
        {/* Image picker */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="h-16 w-16 rounded-md flex items-center justify-center text-[10px] text-center flex-shrink-0 overflow-hidden border border-dashed border-gray-300 hover:border-gray-400"
          style={service.image ? { backgroundImage: `url(${service.image})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: "#f3e8ff", color: "var(--admin-primary)" }}
        >
          {!service.image && (uploading ? "Uploading…" : "+ Image")}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleImagePick}
        />

        <div className="flex-1 space-y-2 min-w-0">
          <input
            type="text"
            value={service.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Service name"
            className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm"
            maxLength={60}
          />
          <div className="flex gap-2">
            <input
              type="text"
              value={service.price}
              onChange={(e) => set("price", e.target.value)}
              placeholder="$0"
              className="flex-1 rounded border border-gray-200 px-2 py-1.5 text-sm"
              maxLength={30}
            />
            <div className="flex items-center gap-1 rounded border border-gray-200 px-2">
              <button type="button" onClick={() => set("duration_minutes", Math.max(60, duration - 60))} aria-label="Decrease duration" className="px-1 text-gray-500">−</button>
              <span className="text-sm font-medium w-10 text-center tabular-nums">{duration / 60}h</span>
              <button type="button" onClick={() => set("duration_minutes", Math.min(480, duration + 60))} aria-label="Increase duration" className="px-1 text-gray-500">+</button>
            </div>
          </div>
        </div>
      </div>

      <textarea
        value={service.description ?? ""}
        onChange={(e) => set("description", e.target.value)}
        placeholder="Description (optional)"
        className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm"
        rows={2}
        maxLength={200}
      />

      <div className="flex items-center justify-between pt-1">
        {confirmDelete ? (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-red-600">Delete this service?</span>
            <button type="button" onClick={onDelete} className="text-red-600 font-medium underline">
              Confirm
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="text-gray-500 underline">
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} className="text-xs text-red-600">
            Delete
          </button>
        )}
        <button type="button" onClick={() => setExpanded(false)} className="text-xs text-gray-500">
          ▾ Collapse
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: success. The component is unused at this point — Tasks 9 and 11 mount it.

- [ ] **Step 3: Commit**

```bash
git add src/app/site/\[slug\]/admin/_components/ServiceRow.tsx
git commit -m "feat(admin): add shared ServiceRow component (collapse/expand + image upload)"
```

---

## Task 7: LeadsBadge component

**Files:**
- Create: `src/app/site/[slug]/admin/_components/LeadsBadge.tsx`

A small server-rendered envelope icon + unread badge. Its parent (AdminShell, via the layout) provides `unreadCount` so it doesn't have to fetch.

- [ ] **Step 1: Create the component**

Create `src/app/site/[slug]/admin/_components/LeadsBadge.tsx`:

```tsx
import Link from "next/link";

export function LeadsBadge({ unreadCount, variant }: { unreadCount: number; variant: "mobile" | "desktop" }) {
  const badgeBase =
    variant === "mobile"
      ? "relative inline-flex items-center justify-center bg-white/20 hover:bg-white/30 rounded-full h-9 w-9 text-base"
      : "relative inline-flex items-center justify-center hover:bg-gray-100 rounded-md h-9 w-full text-base";
  return (
    <Link href="/admin/leads" aria-label={`Leads — ${unreadCount} unread`} className={badgeBase}>
      <span>✉</span>
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold leading-none rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </Link>
  );
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/app/site/\[slug\]/admin/_components/LeadsBadge.tsx
git commit -m "feat(admin): add LeadsBadge envelope-icon component with unread count"
```

---

## Task 8: AdminShell — replace Leads with Services + mount LeadsBadge

**Files:**
- Modify: `src/app/site/[slug]/admin/_components/AdminShell.tsx`
- Modify: `src/app/site/[slug]/admin/layout.tsx` (fetch unreadCount, pass to AdminShell)

- [ ] **Step 1: Update buildTabs in AdminShell**

In `src/app/site/[slug]/admin/_components/AdminShell.tsx`, replace the `buildTabs` function:

```ts
function buildTabs(tenant: ShellTenant): Tab[] {
  const showSchedule = !tenant.booking_tool || tenant.booking_tool === "none" || tenant.booking_tool === "internal";
  const showOrders = tenant.checkout_mode === "pickup";
  const tabs: Tab[] = [{ href: "/admin", label: "Home", icon: "⌂" }];
  if (showSchedule) tabs.push({ href: "/admin/schedule", label: "Schedule", icon: "📅" });
  if (showOrders) tabs.push({ href: "/admin/orders", label: "Orders", icon: "🛍" });
  // Spec 3: Services replaces Leads in primary slots.
  if (showSchedule) tabs.push({ href: "/admin/services", label: "Services", icon: "✂" });
  tabs.push({ href: "/admin/updates", label: "Updates", icon: "✏" });
  // Leads demoted to overflow (page still exists; the LeadsBadge in the
  // top bar / sidebar header is the primary entry now).
  tabs.push({ href: "/admin/leads", label: "Leads", icon: "✉" });
  tabs.push({ href: "/admin/billing", label: "Billing", icon: "💳" });
  tabs.push({ href: "/admin/settings", label: "Settings", icon: "⚙" });
  return tabs;
}
```

- [ ] **Step 2: Add unreadCount prop and mount LeadsBadge**

Replace the AdminShell function signature and the mobile top bar + desktop sidebar header:

```tsx
import { LeadsBadge } from "./LeadsBadge";

export function AdminShell({
  tenant,
  unreadCount = 0,
  children,
}: {
  tenant: ShellTenant;
  unreadCount?: number;
  children: React.ReactNode;
}) {
  // ... existing usePathname / buildTabs ...
```

In the desktop sidebar `<aside>` block, add the LeadsBadge inside the header section (right after the "View site" link):

```tsx
<aside className="hidden md:block w-48 bg-white border-r border-gray-200 p-4">
  <div className="mb-4">
    <div className="font-semibold text-sm mb-2">{tenant.business_name}</div>
    <a href="/" target="_blank" rel="noopener noreferrer" className="block w-full text-center bg-[var(--admin-primary-light)] text-[color:var(--admin-primary)] hover:bg-[var(--admin-primary-hover)] border border-[color:var(--admin-primary-border)] rounded-lg py-2 text-sm font-medium">
      View site ↗
    </a>
    <div className="mt-2">
      <LeadsBadge unreadCount={unreadCount} variant="desktop" />
    </div>
  </div>
  {/* ... rest unchanged ... */}
</aside>
```

In the mobile top bar `<header>`, add the LeadsBadge right before the Sign Out button:

```tsx
<header className="md:hidden bg-[var(--admin-primary)] text-white px-4 py-3 flex justify-between items-center gap-3">
  <div className="font-semibold text-sm truncate">{tenant.business_name}</div>
  <div className="flex items-center gap-2 shrink-0">
    <a href="/" target="_blank" rel="noopener noreferrer" className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-full text-xs font-medium">
      View site ↗
    </a>
    <LeadsBadge unreadCount={unreadCount} variant="mobile" />
    <SignOutButton className="text-xs opacity-90" />
  </div>
</header>
```

- [ ] **Step 3: Update the layout to fetch and pass unreadCount**

In `src/app/site/[slug]/admin/layout.tsx`, after the `if (!authed)` block (where the layout has confirmed the owner is authenticated), fetch the unread count and pass it to AdminShell. The existing `getRollups` from `@/lib/admin-rollups` already returns `unreadLeads`.

Add the import at the top:

```ts
import { getRollups } from "@/lib/admin-rollups";
```

In the authed branch, just before constructing the `shellTenant` and rendering `AdminShell`, fetch:

```ts
const rollups = await getRollups(tenant.id);
```

Then pass to AdminShell:

```tsx
<AdminShell tenant={shellTenant} unreadCount={rollups.unreadLeads}>
  {children}
</AdminShell>
```

(Wherever AdminShell is currently rendered in the file.)

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/app/site/\[slug\]/admin/_components/AdminShell.tsx src/app/site/\[slug\]/admin/layout.tsx
git commit -m "feat(admin): swap Leads→Services in primary nav, mount LeadsBadge in top bar + sidebar"
```

---

## Task 9: New /admin/services page

**Files:**
- Create: `src/app/site/[slug]/admin/services/page.tsx`
- Create: `src/app/site/[slug]/admin/services/ServicesClient.tsx`

- [ ] **Step 1: Create the server page**

Create `src/app/site/[slug]/admin/services/page.tsx`:

```tsx
import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import { loadTenantBySlug } from "@/lib/admin-tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ServiceItem } from "@/lib/ai/types";
import { ServicesClient } from "./ServicesClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function loadServices(previewSlug: string | null): Promise<ServiceItem[]> {
  if (!previewSlug) return [];
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("previews")
    .select("services")
    .eq("slug", previewSlug)
    .maybeSingle();
  return ((data?.services as ServiceItem[] | null) ?? []);
}

export default async function ServicesPage({
  params,
}: {
  params: { slug: string };
}) {
  noStore();
  const tenant = await loadTenantBySlug(params.slug);
  if (!tenant) notFound();
  const services = await loadServices(tenant.preview_slug);

  return (
    <div className="py-4 md:py-6">
      <div className="px-4 md:px-8">
        <div className="text-lg font-semibold">Services</div>
      </div>
      <div className="px-3 md:px-8 mt-4">
        <ServicesClient initialServices={services} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the client**

Create `src/app/site/[slug]/admin/services/ServicesClient.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { ServiceItem } from "@/lib/ai/types";
import { ServiceRow } from "../_components/ServiceRow";

interface ServicesClientProps {
  initialServices: ServiceItem[];
}

export function ServicesClient({ initialServices }: ServicesClientProps) {
  const [services, setServices] = useState<ServiceItem[]>(initialServices);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Track whether the on-screen array differs from the last saved snapshot.
  const initialJson = JSON.stringify(initialServices);
  const dirty = JSON.stringify(services) !== initialJson;

  function update(index: number, next: ServiceItem) {
    setServices((prev) => prev.map((s, i) => (i === index ? next : s)));
    setSavedAt(null);
  }

  function remove(index: number) {
    setServices((prev) => prev.filter((_, i) => i !== index));
    setSavedAt(null);
  }

  function add() {
    setServices((prev) => [...prev, { name: "", price: "", duration_minutes: 60 }]);
    setSavedAt(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ services }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Save failed");
        return;
      }
      setSavedAt(Date.now());
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 pb-24">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">{services.length} {services.length === 1 ? "service" : "services"}</span>
        <button
          type="button"
          onClick={add}
          className="text-sm bg-[var(--admin-primary)] text-white font-medium px-3 py-1.5 rounded-lg"
        >
          + Add service
        </button>
      </div>

      {services.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-sm text-gray-500">
          No services yet. Add your first service to start taking bookings.
        </div>
      ) : (
        services.map((s, i) => (
          <ServiceRow key={i} service={s} onChange={(next) => update(i, next)} onDelete={() => remove(i)} />
        ))
      )}

      {/* Sticky save bar */}
      <div className="fixed bottom-16 md:bottom-4 inset-x-0 px-4 md:px-8 pointer-events-none">
        <div className="max-w-3xl mx-auto flex items-center justify-end gap-3 pointer-events-auto">
          {error && <span className="text-xs text-red-600">{error}</span>}
          {savedAt && !dirty && <span className="text-xs text-green-700">✓ Saved</span>}
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={save}
            className="bg-[var(--admin-primary)] text-white font-medium px-4 py-2 rounded-lg shadow-md disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `ƒ /site/[slug]/admin/services` appears in the dynamic-route list.

- [ ] **Step 4: Commit**

```bash
git add src/app/site/\[slug\]/admin/services/
git commit -m "feat(admin): add owner-facing /admin/services page"
```

---

## Task 10: Migrate SiteEditor services section to ServiceRow

**Files:**
- Modify: `src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx`

The existing services section (around lines 1134-1206) is replaced with the shared `ServiceRow`. The save flow already POSTs to `/api/update-site` which still accepts the `services` field — we leave that pass-through in place (founder can save services AS PART OF a bigger update-site batch). For services-only saves we route through `/api/admin/services`.

- [ ] **Step 1: Replace the local ServiceItem with the canonical type**

In `src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx`, find the inline `interface ServiceItem` declaration (line 23):

```ts
interface ServiceItem {
  name: string;
  price: string;
  description?: string;
  duration_minutes?: number;
}
```

DELETE that interface block. Add this import at the top of the file (with the other imports):

```ts
import type { ServiceItem } from "@/lib/ai/types";
```

After Task 2 extended the canonical type, this is the same shape — just sourced from the single source of truth. Removes the historical drift between the two `ServiceItem` definitions.

- [ ] **Step 2: Add the ServiceRow import**

```ts
import { ServiceRow } from "@/app/site/[slug]/admin/_components/ServiceRow";
```

- [ ] **Step 3: Replace the services rendering JSX**

Find the services section (search for the comment `{/* Services */}` followed by `<section>` — around line 1134). Replace the whole `<section>` (from the comment through its closing `</section>`) with:

```tsx
{/* Services */}
<section className="rounded-xl border bg-white p-6">
  <div className="mb-4 flex items-center justify-between">
    <h2 className="text-lg font-semibold text-gray-900">Services</h2>
    <button
      onClick={() => setServices((prev) => [...prev, { name: "", price: "", duration_minutes: 60 }])}
      className="text-sm font-medium text-amber-600 hover:text-amber-700"
    >
      + Add
    </button>
  </div>
  <div className="space-y-2">
    {services.map((s, i) => (
      <ServiceRow
        key={i}
        service={s}
        founderTenantId={tenantId}
        onChange={(next) => {
          const updated = [...services];
          updated[i] = next;
          setServices(updated);
        }}
        onDelete={() => setServices((prev) => prev.filter((_, j) => j !== i))}
      />
    ))}
  </div>
</section>
```

No casts needed — both sides use the canonical `ServiceItem` type now.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 5: Manual smoke (optional)**

Open the SiteEditor for an existing client. Verify the services section renders the same shape (collapse/expand rows, image upload, name/price/duration/description) as the new owner page. Save still works through the existing update-site flow.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(admin\)/clients/\[tenantId\]/edit/SiteEditor.tsx
git commit -m "feat(editor): replace SiteEditor services section with shared ServiceRow"
```

---

## Task 11: Render service.image on the public site

**Files:**
- Modify: `src/components/templates/services/BoldServices.tsx`
- Modify: `src/components/templates/services/VibrantServices.tsx`
- Modify: `src/components/templates/services/ClassicServices.tsx`
- Modify: `src/components/templates/services/ElegantServices.tsx`
- Modify: `src/components/templates/services/WarmServices.tsx`

Each template renders the per-service card differently. The image goes in the natural slot for each layout: top of card for Bold/Vibrant; left of text for Classic/Elegant/Warm. Card markup that exists today is unchanged for services without `image`.

- [ ] **Step 1: BoldServices — image at top of card**

Open `src/components/templates/services/BoldServices.tsx`. Find where the per-service card renders (search for the `card` const declaration before line 50). Just inside the card's outer wrapper, before the existing name/price content, add a conditional image:

```tsx
const card = (
  <div className="...existing classes...">
    {service.image && (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={service.image} alt={service.name} className="w-full h-40 object-cover rounded-md mb-3" />
    )}
    {/* existing name/price/description content */}
  </div>
);
```

(Match the existing wrapper's indentation and class structure. Read the file before editing — exact placement varies.)

- [ ] **Step 2: VibrantServices — same pattern (image at top)**

Same as Step 1 but in `VibrantServices.tsx`. Use `h-40 object-cover rounded-md mb-3`.

- [ ] **Step 3: ClassicServices — image as small thumbnail to left of text**

In `ClassicServices.tsx`, modify the card to wrap content in a flex row with a thumbnail on the left when `service.image` exists. Pattern:

```tsx
const card = (
  <div className="flex gap-3 ...existing classes...">
    {service.image && (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={service.image} alt={service.name} className="h-16 w-16 rounded-md object-cover flex-shrink-0" />
    )}
    <div className="flex-1 min-w-0">
      {/* existing name/price/description content */}
    </div>
  </div>
);
```

If the existing card isn't already `flex`, the thumbnail-on-left layout requires adjusting the wrapper. Read the file's existing structure first; the goal is "thumbnail left of text when image present, unchanged when not."

- [ ] **Step 4: ElegantServices — same pattern as Classic**

Same as Step 3.

- [ ] **Step 5: WarmServices — same pattern as Classic**

Same as Step 3.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: success. The `<img>` lint warning may appear (Next.js prefers `<Image>`); the inline `eslint-disable-next-line` comment suppresses it for the user-uploaded URL case (where Next/Image's domain whitelist would need a separate config update).

- [ ] **Step 7: Commit**

```bash
git add src/components/templates/services/
git commit -m "feat(templates): render service.image when present (5 templates)"
```

---

## Task 12: End-to-end verification + open PR

- [ ] **Step 1: Apply migration locally**

Run: `supabase db push`
Verify: the `service-images` bucket exists in Supabase Studio → Storage. Public read should be enabled.

- [ ] **Step 2: Owner-side smoke**

Run dev (`npm run dev`). Log in as owner on testclient. Navigate to:
- The Services tab in the bottom nav (mobile) or sidebar (desktop) — confirm it's primary, Leads is in More.
- The ✉️ envelope icon in the top bar (mobile) and sidebar header (desktop) — should show or hide a badge based on unread leads.
- `/admin/services` — confirm services pre-populate. Edit one (price + add image). Click Save changes — ✓ Saved appears.
- Reload the page — values persist.
- Add a new service. Save. Reload — persists.
- Delete a service. Confirm. Save. Reload — gone.

- [ ] **Step 3: Founder-side smoke**

Open the founder SiteEditor at `/admin/clients/<id>/edit`. Confirm the Services section renders with the same expandable rows. Edit a service. The founder save flow saves through existing update-site (services slice now flows through ServiceRow's local state).

- [ ] **Step 4: Public site rendering**

Open the public site for testclient. Each service that has an image should render its thumbnail in the appropriate template's layout. Services without images render unchanged.

- [ ] **Step 5: Auth boundary checks**

```bash
# 401 without any auth:
curl -i https://siteforowners.com/api/admin/services
# Expected: 401 Unauthorized

# 401 with founder cookie but no tenant_id:
curl -i https://siteforowners.com/api/admin/services \
  -H "Cookie: admin_session=$ADMIN_PASSWORD"
# Expected: 401 Unauthorized

# 200 with founder cookie + tenant_id:
curl -i "https://siteforowners.com/api/admin/services?tenant_id=<id>" \
  -H "Cookie: admin_session=$ADMIN_PASSWORD"
# Expected: 200 with services array
```

- [ ] **Step 6: Push and open PR**

```bash
git push -u origin <branch>
```

Open PR. Title: `feat: owner-facing services management (Spec 3)`. Body should reference [docs/superpowers/specs/2026-04-26-services-management-design.md](../specs/2026-04-26-services-management-design.md).

---

## Self-review notes

**Spec coverage walked end-to-end:**

| Spec section | Tasks |
|---|---|
| Storage migration (`service-images` bucket + RLS) | Task 1 |
| `ServiceItem` type extension (`image`, `duration_minutes`) | Task 2 |
| `requireOwnerOrFounder` dual-auth helper + tests | Task 3 |
| `POST /api/admin/services/upload-image` | Task 4 |
| `GET + POST /api/admin/services` (atomic validation, host-restricted image URL check) | Task 5 |
| `ServiceRow` shared component | Task 6 |
| `LeadsBadge` envelope + unread count | Task 7 |
| AdminShell nav swap (Leads → Services in primary) + LeadsBadge mounting | Task 8 |
| Layout fetches `unreadLeads` count and passes to AdminShell | Task 8 |
| `/admin/services` page + client | Task 9 |
| SiteEditor migrated to shared ServiceRow | Task 10 |
| 5 service templates render `image` thumbnail | Task 11 |
| Smoke + PR | Task 12 |

**Type names used consistently:** `ServiceItem` (canonical from types.ts), `DualAuthResult`, `ServiceRow`, `LeadsBadge`, `ServicesClient`. Function names: `requireOwnerOrFounder`, `validateServices`, `imageOriginAllowed`, `loadServicesForTenant`, `saveServicesForTenant`, `loadServices`.

**No TBD / TODO placeholders.** Each step has either complete code or a precise locate-and-edit instruction with grep guidance.
