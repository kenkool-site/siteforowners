# Owner Admin — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the authentication, routing, and shell foundation for the owner admin dashboard at `{tenant-domain}/admin`. After this plan, an owner can enter a founder-issued PIN, land on a signed-in shell with nav, and sign out. Home page exists as an empty placeholder with the greeting — feature pages come in later plans.

**Architecture:** PIN auth (bcrypt-style hashing via Node's `scrypt`), session state in an HMAC-signed HTTP-only cookie (30-day sliding expiry), tenant identity derived from request hostname. Middleware extends the existing tenant-domain rewrite so `letstrylocs.com/admin` → `/site/letstrylocs/admin` while relaxing the published/subscription gate. Admin pages live under `src/app/site/[slug]/admin/` with their own layout that performs the auth check.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Supabase (service-role client only), Tailwind CSS. Tests use Node's built-in `node:test` runner via `tsx` (no new dev dependency required). Password hashing and session signing use `node:crypto` — no `bcryptjs` dependency needed.

**Reference spec:** `docs/superpowers/specs/2026-04-24-owner-admin-design.md`

---

## Environment Variables (new)

Add these to `.env.local` before starting Task 2. The plan assumes they exist from Task 2 onward.

```
SESSION_COOKIE_SECRET=<64 random hex chars — generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
IP_HASH_PEPPER=<32 random hex chars — same command, 16 bytes>
```

Also add these lines to `.env.example` (if that file exists — otherwise document in README):
```
SESSION_COOKIE_SECRET=
IP_HASH_PEPPER=
```

---

## File Structure

### Create
- `supabase/migrations/011_owner_admin_foundation.sql` — PIN columns on `tenants`; `admin_login_attempts` table
- `src/lib/admin-auth.ts` — PIN hash/verify, session sign/verify, `requireOwnerSession` helper, `resolveTenantByHost` helper
- `src/lib/admin-auth.test.ts` — unit tests for hashing + session signing
- `src/lib/admin-rate-limit.ts` — `checkAndRecordAttempt` helper
- `src/lib/admin-rate-limit.test.ts` — unit tests
- `src/app/api/admin/login/route.ts` — POST PIN login
- `src/app/api/admin/logout/route.ts` — POST clear cookie
- `src/app/api/admin/pin/set/route.ts` — founder-only: generate/reset a tenant's PIN
- `src/app/site/[slug]/admin/layout.tsx` — auth check + shell
- `src/app/site/[slug]/admin/page.tsx` — empty Home placeholder
- `src/app/site/[slug]/admin/_components/PinEntry.tsx` — client component
- `src/app/site/[slug]/admin/_components/AdminShell.tsx` — server component, bottom-nav + sidebar
- `src/app/site/[slug]/admin/_components/SignOutButton.tsx` — client component

### Modify
- `src/middleware.ts` — carve out `/admin` path behavior: still rewrite, but don't require `site_published` or active subscription
- `src/app/(admin)/clients/ClientActions.tsx` — add "Set/Reset PIN" button that calls `/api/admin/pin/set`

### Responsibility per file

- `admin-auth.ts` is the only file that touches PIN hashes and signed cookies. API routes and the layout read/write via its helpers; they never construct cookies directly.
- `admin-rate-limit.ts` is the only place `admin_login_attempts` is written to.
- `layout.tsx` is the single gate for every page under `/admin/*`. Children render only if `requireOwnerSession` returns a session.

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/011_owner_admin_foundation.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/011_owner_admin_foundation.sql`:

```sql
-- Owner admin foundation: PIN auth + brute-force tracking.
-- Part 1 of 4 migrations. Later migrations add site_visits, contact_leads,
-- update_requests, admin_pin_resets.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS admin_pin_hash text,
  ADD COLUMN IF NOT EXISTS admin_pin_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_email text;

CREATE TABLE IF NOT EXISTS admin_login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  ip_hash text,
  succeeded boolean NOT NULL,
  attempted_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_recent
  ON admin_login_attempts (tenant_id, attempted_at DESC);

-- Service-role only. Deny-all for anon/authenticated.
ALTER TABLE admin_login_attempts ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Apply migration locally**

Run the migration against the local Supabase (command depends on the repo's workflow — check `scripts/` or `CLAUDE.md`. Typical: `supabase db push` or apply via the Supabase dashboard SQL editor).

Expected: three new columns on `tenants`, one new table `admin_login_attempts`. Verify with:
```sql
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'tenants' AND column_name LIKE 'admin%';
-- Expect: admin_pin_hash, admin_pin_updated_at, admin_email

SELECT to_regclass('admin_login_attempts');
-- Expect: admin_login_attempts
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/011_owner_admin_foundation.sql
git commit -m "feat(owner-admin): migration 011 — PIN columns + login_attempts"
```

---

## Task 2: PIN hashing helpers (TDD)

**Files:**
- Create: `src/lib/admin-auth.ts`
- Test: `src/lib/admin-auth.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/admin-auth.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPin, verifyPin } from "./admin-auth";

test("hashPin: returns salt:hash format", async () => {
  const hashed = await hashPin("123456");
  const parts = hashed.split(":");
  assert.equal(parts.length, 2);
  assert.equal(parts[0].length, 32); // 16 bytes hex
  assert.equal(parts[1].length, 128); // 64 bytes hex
});

test("hashPin: produces different output for same input (random salt)", async () => {
  const a = await hashPin("123456");
  const b = await hashPin("123456");
  assert.notEqual(a, b);
});

test("verifyPin: accepts correct PIN", async () => {
  const hashed = await hashPin("123456");
  assert.equal(await verifyPin("123456", hashed), true);
});

test("verifyPin: rejects wrong PIN", async () => {
  const hashed = await hashPin("123456");
  assert.equal(await verifyPin("654321", hashed), false);
});

test("verifyPin: rejects when hash is malformed", async () => {
  assert.equal(await verifyPin("123456", "not-a-real-hash"), false);
  assert.equal(await verifyPin("123456", ""), false);
});

test("verifyPin: constant-time (does not throw) on mismatched lengths", async () => {
  const hashed = await hashPin("123456");
  // Should return false, not throw
  assert.equal(await verifyPin("", hashed), false);
  assert.equal(await verifyPin("1234567", hashed), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/admin-auth.test.ts`
Expected: FAIL with "Cannot find module './admin-auth'"

- [ ] **Step 3: Implement the hashing helpers**

Create `src/lib/admin-auth.ts`:

```ts
import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const SALT_BYTES = 16;
const KEY_BYTES = 64;

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = (await scryptAsync(pin, salt, KEY_BYTES)) as Buffer;
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  try {
    const [saltHex, hashHex] = stored.split(":");
    if (!saltHex || !hashHex) return false;
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    if (salt.length !== SALT_BYTES || expected.length !== KEY_BYTES) return false;
    const actual = (await scryptAsync(pin, salt, KEY_BYTES)) as Buffer;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/admin-auth.test.ts`
Expected: All 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin-auth.ts src/lib/admin-auth.test.ts
git commit -m "feat(owner-admin): PIN hashing with scrypt"
```

---

## Task 3: Session cookie signing (TDD)

**Files:**
- Modify: `src/lib/admin-auth.ts`
- Modify: `src/lib/admin-auth.test.ts`

- [ ] **Step 1: Write failing tests for session signing**

Append to `src/lib/admin-auth.test.ts`:

```ts
import { signSession, verifySession } from "./admin-auth";

// Set a stable secret for tests
process.env.SESSION_COOKIE_SECRET = "a".repeat(64);

test("signSession: round-trips tenant_id and exp", () => {
  const signed = signSession({ tenant_id: "abc-123", exp: 1234567890 });
  const result = verifySession(signed);
  assert.equal(result?.tenant_id, "abc-123");
  assert.equal(result?.exp, 1234567890);
});

test("verifySession: returns null for tampered payload", () => {
  const signed = signSession({ tenant_id: "abc-123", exp: 9999999999 });
  // Flip one character in the payload section
  const [payload, sig] = signed.split(".");
  const tampered = payload.slice(0, -1) + (payload.slice(-1) === "A" ? "B" : "A") + "." + sig;
  assert.equal(verifySession(tampered), null);
});

test("verifySession: returns null for bad signature", () => {
  const signed = signSession({ tenant_id: "abc-123", exp: 9999999999 });
  const [payload] = signed.split(".");
  assert.equal(verifySession(payload + ".0000"), null);
});

test("verifySession: returns null for expired session", () => {
  const past = Math.floor(Date.now() / 1000) - 10;
  const signed = signSession({ tenant_id: "abc-123", exp: past });
  assert.equal(verifySession(signed), null);
});

test("verifySession: returns null for malformed input", () => {
  assert.equal(verifySession(""), null);
  assert.equal(verifySession("no-dot"), null);
  assert.equal(verifySession("a.b.c"), null);
});
```

- [ ] **Step 2: Run tests — should fail**

Run: `npx tsx --test src/lib/admin-auth.test.ts`
Expected: 5 new failing tests (`signSession`/`verifySession` undefined).

- [ ] **Step 3: Implement session signing**

Append to `src/lib/admin-auth.ts`:

```ts
import { createHmac } from "node:crypto";

export type SessionPayload = { tenant_id: string; exp: number };

function getSecret(): string {
  const s = process.env.SESSION_COOKIE_SECRET;
  if (!s || s.length < 32) {
    throw new Error("SESSION_COOKIE_SECRET must be set and at least 32 chars");
  }
  return s;
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export function signSession(payload: SessionPayload): string {
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", getSecret()).update(body).digest("hex");
  return `${body}.${sig}`;
}

export function verifySession(signed: string): SessionPayload | null {
  try {
    if (!signed || !signed.includes(".")) return null;
    const parts = signed.split(".");
    if (parts.length !== 2) return null;
    const [body, sig] = parts;
    const expected = createHmac("sha256", getSecret()).update(body).digest("hex");
    if (sig.length !== expected.length) return null;
    // Constant-time compare
    let diff = 0;
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    if (diff !== 0) return null;
    const payload = JSON.parse(b64urlDecode(body).toString("utf8")) as SessionPayload;
    if (!payload.tenant_id || typeof payload.exp !== "number") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests — should pass**

Run: `npx tsx --test src/lib/admin-auth.test.ts`
Expected: All 11 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin-auth.ts src/lib/admin-auth.test.ts
git commit -m "feat(owner-admin): HMAC-signed session cookies"
```

---

## Task 4: Host → tenant resolver + requireOwnerSession helper

**Files:**
- Modify: `src/lib/admin-auth.ts`

This task adds two glue helpers. No new test file — the logic depends on Supabase and Next.js request objects which are impractical to unit-test in this repo's style. Correctness is verified in Task 5 (manual login test).

- [ ] **Step 1: Add the resolveTenantByHost helper**

Append to `src/lib/admin-auth.ts`:

```ts
import { createAdminClient } from "@/lib/supabase/admin";

export type AdminTenant = {
  id: string;
  business_name: string;
  owner_name: string;
  preview_slug: string | null;
  email: string | null;
  admin_email: string | null;
  admin_pin_hash: string | null;
  subscription_status: string;
  site_published: boolean;
};

/**
 * Resolve the tenant from a request hostname.
 * Looks up custom_domain first (authoritative for mapped domains),
 * then falls back to subdomain for *.siteforowners.com tenants.
 */
export async function resolveTenantByHost(hostname: string): Promise<AdminTenant | null> {
  const normalized = hostname.split(":")[0].replace(/^www\./, "");
  const supabase = createAdminClient();

  let { data } = await supabase
    .from("tenants")
    .select(
      "id, business_name, owner_name, preview_slug, email, admin_email, admin_pin_hash, subscription_status, site_published"
    )
    .eq("custom_domain", normalized)
    .maybeSingle();

  if (!data) {
    const subdomain = normalized.split(".")[0];
    if (!subdomain) return null;
    const res = await supabase
      .from("tenants")
      .select(
        "id, business_name, owner_name, preview_slug, email, admin_email, admin_pin_hash, subscription_status, site_published"
      )
      .eq("subdomain", subdomain)
      .maybeSingle();
    data = res.data;
  }

  return (data as AdminTenant) ?? null;
}
```

- [ ] **Step 2: Add the requireOwnerSession helper**

Append to `src/lib/admin-auth.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "owner_session";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

export function setSessionCookie(res: NextResponse, tenant_id: string): void {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const signed = signSession({ tenant_id, exp });
  res.cookies.set(SESSION_COOKIE, signed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}

/**
 * Validates the session cookie on a request and returns tenant_id + the tenant row.
 * Returns null if missing or invalid. The tenant check ensures the cookie's
 * tenant_id still matches the request hostname — mitigates stolen-cookie replay
 * against a different tenant domain.
 */
export async function requireOwnerSession(
  request: NextRequest | Request
): Promise<{ tenant: AdminTenant } | null> {
  const cookieHeader =
    typeof (request as NextRequest).cookies?.get === "function"
      ? (request as NextRequest).cookies.get(SESSION_COOKIE)?.value
      : parseCookieHeader(request.headers.get("cookie") || "")[SESSION_COOKIE];

  if (!cookieHeader) return null;
  const payload = verifySession(cookieHeader);
  if (!payload) return null;

  const hostname = request.headers.get("host") || "";
  const tenant = await resolveTenantByHost(hostname);
  if (!tenant) return null;
  if (tenant.id !== payload.tenant_id) return null;

  return { tenant };
}

function parseCookieHeader(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (!k) continue;
    out[k] = decodeURIComponent(rest.join("="));
  }
  return out;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no new errors in `src/lib/admin-auth.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/admin-auth.ts
git commit -m "feat(owner-admin): resolveTenantByHost + requireOwnerSession helpers"
```

---

## Task 5: Rate limit helper (TDD)

**Files:**
- Create: `src/lib/admin-rate-limit.ts`
- Create: `src/lib/admin-rate-limit.test.ts`

The rate limiter's public surface is `checkAndRecordAttempt`. The unit tests exercise the pure decision logic via a helper (`decide`); the DB-side is exercised in manual Task 7.

- [ ] **Step 1: Write the failing test**

Create `src/lib/admin-rate-limit.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, RateLimitState } from "./admin-rate-limit";

const base = Math.floor(Date.now() / 1000);

function state(overrides: Partial<RateLimitState> = {}): RateLimitState {
  return {
    failsLast15Min: 0,
    failsLastHour: 0,
    lockedUntil: null,
    ...overrides,
  };
}

test("decide: permits when no prior failures", () => {
  const d = decide(state(), base);
  assert.equal(d.allow, true);
});

test("decide: blocks when inside 15-min cooldown (>= 5 fails)", () => {
  const d = decide(state({ failsLast15Min: 5 }), base);
  assert.equal(d.allow, false);
  assert.equal(d.reason, "cooldown_15min");
});

test("decide: permits at 4 fails in 15 min", () => {
  const d = decide(state({ failsLast15Min: 4 }), base);
  assert.equal(d.allow, true);
});

test("decide: blocks when 10+ fails in 1 hour (account lockout)", () => {
  const d = decide(state({ failsLastHour: 10 }), base);
  assert.equal(d.allow, false);
  assert.equal(d.reason, "lockout_1hour");
});

test("decide: blocks when lockedUntil is in future", () => {
  const d = decide(state({ lockedUntil: base + 600 }), base);
  assert.equal(d.allow, false);
  assert.equal(d.reason, "lockout_1hour");
});

test("decide: permits when lockedUntil is in past", () => {
  const d = decide(state({ lockedUntil: base - 10 }), base);
  assert.equal(d.allow, true);
});
```

- [ ] **Step 2: Run — should fail**

Run: `npx tsx --test src/lib/admin-rate-limit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/admin-rate-limit.ts`:

```ts
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export type RateLimitState = {
  failsLast15Min: number;
  failsLastHour: number;
  lockedUntil: number | null; // unix seconds
};

export type RateLimitDecision =
  | { allow: true }
  | { allow: false; reason: "cooldown_15min" | "lockout_1hour" };

export function decide(state: RateLimitState, nowSec: number): RateLimitDecision {
  if (state.lockedUntil !== null && state.lockedUntil > nowSec) {
    return { allow: false, reason: "lockout_1hour" };
  }
  if (state.failsLastHour >= 10) return { allow: false, reason: "lockout_1hour" };
  if (state.failsLast15Min >= 5) return { allow: false, reason: "cooldown_15min" };
  return { allow: true };
}

export function hashIp(ip: string): string {
  const pepper = process.env.IP_HASH_PEPPER || "";
  return createHash("sha256").update(ip + pepper).digest("hex");
}

export async function getRateLimitState(tenantId: string, ipHash: string): Promise<RateLimitState> {
  const supabase = createAdminClient();
  const now = Date.now();
  const hourAgo = new Date(now - 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("admin_login_attempts")
    .select("succeeded, attempted_at")
    .eq("tenant_id", tenantId)
    .eq("ip_hash", ipHash)
    .gte("attempted_at", hourAgo);

  const nowSec = Math.floor(now / 1000);
  let failsLast15Min = 0;
  let failsLastHour = 0;
  for (const row of data ?? []) {
    if (row.succeeded) continue;
    const ts = Math.floor(new Date(row.attempted_at as string).getTime() / 1000);
    failsLastHour++;
    if (nowSec - ts <= 15 * 60) failsLast15Min++;
  }
  return { failsLast15Min, failsLastHour, lockedUntil: null };
}

export async function recordAttempt(
  tenantId: string | null,
  ipHash: string,
  succeeded: boolean
): Promise<void> {
  const supabase = createAdminClient();
  await supabase.from("admin_login_attempts").insert({
    tenant_id: tenantId,
    ip_hash: ipHash,
    succeeded,
  });
}

export async function checkAndRecordAttempt(
  tenantId: string,
  ipHash: string,
  succeeded: boolean
): Promise<RateLimitDecision> {
  const state = await getRateLimitState(tenantId, ipHash);
  const decision = decide(state, Math.floor(Date.now() / 1000));
  await recordAttempt(tenantId, ipHash, succeeded);
  return decision;
}
```

- [ ] **Step 4: Run — should pass**

Run: `npx tsx --test src/lib/admin-rate-limit.test.ts`
Expected: All 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin-rate-limit.ts src/lib/admin-rate-limit.test.ts
git commit -m "feat(owner-admin): login rate limit logic"
```

---

## Task 6: Login API route

**Files:**
- Create: `src/app/api/admin/login/route.ts`

- [ ] **Step 1: Implement the route**

Create `src/app/api/admin/login/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { resolveTenantByHost, verifyPin, setSessionCookie } from "@/lib/admin-auth";
import {
  checkAndRecordAttempt,
  hashIp,
  getRateLimitState,
  decide,
} from "@/lib/admin-rate-limit";

export async function POST(request: NextRequest) {
  let pin: string | undefined;
  try {
    const body = await request.json();
    pin = typeof body?.pin === "string" ? body.pin : undefined;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!pin || !/^\d{4,8}$/.test(pin)) {
    return NextResponse.json({ error: "Invalid PIN format" }, { status: 400 });
  }

  const hostname = request.headers.get("host") || "";
  const tenant = await resolveTenantByHost(hostname);
  if (!tenant || !tenant.admin_pin_hash) {
    // Don't reveal whether tenant exists or PIN is set
    return NextResponse.json({ error: "Incorrect PIN" }, { status: 401 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const ipHash = hashIp(ip);

  // Pre-check (don't record yet — we haven't attempted)
  const preState = await getRateLimitState(tenant.id, ipHash);
  const pre = decide(preState, Math.floor(Date.now() / 1000));
  if (!pre.allow) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429 }
    );
  }

  const ok = await verifyPin(pin, tenant.admin_pin_hash);
  await checkAndRecordAttempt(tenant.id, ipHash, ok);
  if (!ok) return NextResponse.json({ error: "Incorrect PIN" }, { status: 401 });

  const res = NextResponse.json({ ok: true });
  setSessionCookie(res, tenant.id);
  return res;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/admin/login/route.ts
git commit -m "feat(owner-admin): POST /api/admin/login"
```

---

## Task 7: Logout API route

**Files:**
- Create: `src/app/api/admin/logout/route.ts`

- [ ] **Step 1: Implement the route**

Create `src/app/api/admin/logout/route.ts`:

```ts
import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/admin-auth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/admin/logout/route.ts
git commit -m "feat(owner-admin): POST /api/admin/logout"
```

---

## Task 8: Founder PIN set/reset API + button

**Files:**
- Create: `src/app/api/admin/pin/set/route.ts`
- Modify: `src/app/(admin)/clients/ClientActions.tsx`

The founder-only route is protected by the existing `admin_session` cookie (set by `ADMIN_PASSWORD` login). This matches how other founder APIs behave in this repo.

- [ ] **Step 1: Implement the set/reset route**

Create `src/app/api/admin/pin/set/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashPin } from "@/lib/admin-auth";
import { randomInt } from "node:crypto";

function generatePin(): string {
  // 6-digit PIN, leading zeros allowed
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function requireFounder(request: NextRequest): boolean {
  const cookie = request.cookies.get("admin_session")?.value;
  return !!cookie && cookie === process.env.ADMIN_PASSWORD;
}

export async function POST(request: NextRequest) {
  if (!requireFounder(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let tenantId: string | undefined;
  try {
    const body = await request.json();
    tenantId = typeof body?.tenantId === "string" ? body.tenantId : undefined;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!tenantId) return NextResponse.json({ error: "tenantId required" }, { status: 400 });

  const pin = generatePin();
  const hash = await hashPin(pin);

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("tenants")
    .update({
      admin_pin_hash: hash,
      admin_pin_updated_at: new Date().toISOString(),
    })
    .eq("id", tenantId);

  if (error) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  // Return the plaintext PIN once so founder can copy it
  return NextResponse.json({ pin });
}
```

- [ ] **Step 2: Read the existing ClientActions component**

Run: `cat src/app/\(admin\)/clients/ClientActions.tsx`
Note the pattern used for existing action buttons — match that style.

- [ ] **Step 3: Add the Set/Reset PIN button**

In `src/app/(admin)/clients/ClientActions.tsx`, add a new button alongside existing actions. The exact JSX depends on the file's current structure; the handler must:

```ts
async function handleSetPin(tenantId: string) {
  if (!confirm("Generate new PIN? The current one will stop working.")) return;
  const res = await fetch("/api/admin/pin/set", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId }),
  });
  if (!res.ok) {
    alert("Failed to set PIN");
    return;
  }
  const { pin } = await res.json();
  // Show the PIN clearly so founder can copy/share it via WhatsApp
  alert(`New PIN: ${pin}\n\nShare with owner. You won't see it again.`);
}
```

And the button:

```tsx
<button
  onClick={() => handleSetPin(tenantId)}
  className="text-sm text-pink-700 hover:underline"
>
  Set/Reset PIN
</button>
```

- [ ] **Step 4: Manual smoke test**

- Run the dev server: `npm run dev`
- Log into `/login` with `ADMIN_PASSWORD`
- Navigate to `/clients`
- Click **Set/Reset PIN** on a test tenant → confirm alert shows a 6-digit PIN
- Verify DB: `SELECT admin_pin_hash IS NOT NULL, admin_pin_updated_at FROM tenants WHERE id = '<tenantId>'` → both non-null
- Repeat click → a different PIN is generated

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/pin/set/route.ts src/app/\(admin\)/clients/ClientActions.tsx
git commit -m "feat(owner-admin): founder Set/Reset PIN action"
```

---

## Task 9: Middleware update — carve out /admin

**Files:**
- Modify: `src/middleware.ts`

Current middleware rewrites tenant-domain requests to `/site/[slug]/*` only when the tenant is published AND has an active subscription. The `/admin` path must still rewrite, but owners need to reach Billing even when their subscription has lapsed — so we relax the gate for `/admin/*`.

- [ ] **Step 1: Read the current middleware**

Run: `cat src/middleware.ts`

Note the block between the tenant lookup and the `rewrite` call (currently around lines 91–102).

- [ ] **Step 2: Update the gating logic**

In `src/middleware.ts`, replace the existing block:

```ts
  const activeStatuses = ["active", "trialing"];
  if (
    !tenant ||
    !tenant.site_published ||
    !tenant.preview_slug ||
    !activeStatuses.includes(tenant.subscription_status)
  ) {
    return NextResponse.rewrite(new URL("/not-found", request.url));
  }

  const url = new URL(`/site/${tenant.preview_slug}${pathname === "/" ? "" : pathname}`, request.url);
  return NextResponse.rewrite(url);
```

with:

```ts
  const isAdminPath = pathname === "/admin" || pathname.startsWith("/admin/");
  const activeStatuses = ["active", "trialing"];

  // Owner admin needs to work even when the site is unpublished or the
  // subscription has lapsed — so owners can reach Billing and fix it.
  // Public site still requires both gates.
  const publicGated =
    !tenant ||
    !tenant.site_published ||
    !tenant.preview_slug ||
    !activeStatuses.includes(tenant.subscription_status);

  if (isAdminPath) {
    if (!tenant || !tenant.preview_slug) {
      return NextResponse.rewrite(new URL("/not-found", request.url));
    }
  } else if (publicGated) {
    return NextResponse.rewrite(new URL("/not-found", request.url));
  }

  const url = new URL(
    `/site/${tenant.preview_slug}${pathname === "/" ? "" : pathname}`,
    request.url
  );
  // Expose original pathname via request headers so server components (e.g. the
  // admin layout) can highlight the current nav tab. Setting it on the response
  // does NOT propagate — it has to be on the forwarded request.
  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set("x-pathname", pathname);
  return NextResponse.rewrite(url, { request: { headers: forwardedHeaders } });
```

Also update the tenant `.select(...)` calls to include `preview_slug` (they already do).

- [ ] **Step 3: Manual smoke test**

- Still on dev server. With a test tenant whose subscription is `pending`, visit `<tenant-domain-or-localhost-sub>/admin` → should reach a 404 (no `/admin` route yet) OR flag that middleware rewrote to `/site/<slug>/admin` (we can verify from Next.js terminal logs).
- Visit the same tenant's `/` → should still rewrite to `/site/<slug>` (public rendering behavior unchanged for active tenants).

- [ ] **Step 4: Commit**

```bash
git add src/middleware.ts
git commit -m "feat(owner-admin): middleware carve-out for /admin path"
```

---

## Task 10: PIN entry UI component

**Files:**
- Create: `src/app/site/[slug]/admin/_components/PinEntry.tsx`

- [ ] **Step 1: Create the PIN entry component**

Create `src/app/site/[slug]/admin/_components/PinEntry.tsx`:

```tsx
"use client";

import { useState } from "react";

export function PinEntry({ businessName }: { businessName: string }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(next: string) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: next }),
      });
      if (res.ok) {
        window.location.reload();
        return;
      }
      if (res.status === 429) setError("Too many attempts. Try again in 15 minutes.");
      else setError("Incorrect PIN");
      setPin("");
    } catch {
      setError("Network error");
      setPin("");
    } finally {
      setSubmitting(false);
    }
  }

  function addDigit(d: string) {
    if (submitting || pin.length >= 6) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 6) submit(next);
  }

  function backspace() {
    if (submitting) return;
    setPin((p) => p.slice(0, -1));
    setError(null);
  }

  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-xs">
        <div className="text-center mb-6">
          <div className="text-pink-600 font-semibold text-lg">{businessName}</div>
          <div className="text-gray-500 text-sm mt-1">Enter your 6-digit PIN</div>
        </div>

        <div className="flex justify-center gap-2 mb-4" aria-label="PIN dots">
          {Array.from({ length: 6 }).map((_, i) => (
            <span
              key={i}
              className={
                "w-3 h-3 rounded-full " +
                (i < pin.length ? "bg-pink-600" : "border-2 border-gray-300")
              }
            />
          ))}
        </div>

        {error && (
          <div className="text-center text-red-600 text-sm mb-3" role="alert">
            {error}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          {digits.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => addDigit(d)}
              className="bg-white border border-gray-200 rounded-lg py-4 text-xl font-medium active:bg-gray-100"
              disabled={submitting}
            >
              {d}
            </button>
          ))}
          <span />
          <button
            type="button"
            onClick={() => addDigit("0")}
            className="bg-white border border-gray-200 rounded-lg py-4 text-xl font-medium active:bg-gray-100"
            disabled={submitting}
          >
            0
          </button>
          <button
            type="button"
            onClick={backspace}
            className="bg-white border border-gray-200 rounded-lg py-4 text-xl font-medium text-gray-500 active:bg-gray-100"
            disabled={submitting || pin.length === 0}
            aria-label="Backspace"
          >
            ⌫
          </button>
        </div>

        <div className="text-center mt-6">
          <button type="button" className="text-sm text-pink-600 opacity-50 cursor-not-allowed" disabled>
            Forgot PIN?
          </button>
          <div className="text-[10px] text-gray-400 mt-1">(coming soon)</div>
        </div>
      </div>
    </div>
  );
}
```

Note: "Forgot PIN?" is shown but disabled. The full reset flow arrives in Plan 4.

- [ ] **Step 2: Commit**

```bash
git add src/app/site/\[slug\]/admin/_components/PinEntry.tsx
git commit -m "feat(owner-admin): PIN entry UI"
```

---

## Task 11: Sign-out button + AdminShell

**Files:**
- Create: `src/app/site/[slug]/admin/_components/SignOutButton.tsx`
- Create: `src/app/site/[slug]/admin/_components/AdminShell.tsx`

- [ ] **Step 1: Create the sign-out button (client component)**

Create `src/app/site/[slug]/admin/_components/SignOutButton.tsx`:

```tsx
"use client";

export function SignOutButton({ className = "" }: { className?: string }) {
  async function signOut() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin";
  }
  return (
    <button type="button" onClick={signOut} className={className}>
      Sign out
    </button>
  );
}
```

- [ ] **Step 2: Create the AdminShell (server component)**

Create `src/app/site/[slug]/admin/_components/AdminShell.tsx`:

```tsx
import Link from "next/link";
import { SignOutButton } from "./SignOutButton";

type Tab = { href: string; label: string; icon: string };

export type ShellTenant = {
  business_name: string;
  booking_tool?: string | null;
  checkout_mode?: string | null;
};

function buildTabs(tenant: ShellTenant): Tab[] {
  const showSchedule = !tenant.booking_tool || tenant.booking_tool === "none" || tenant.booking_tool === "internal";
  const showOrders = tenant.checkout_mode === "pickup";
  const tabs: Tab[] = [{ href: "/admin", label: "Home", icon: "⌂" }];
  if (showSchedule) tabs.push({ href: "/admin/schedule", label: "Schedule", icon: "📅" });
  if (showOrders) tabs.push({ href: "/admin/orders", label: "Orders", icon: "🛍" });
  tabs.push({ href: "/admin/leads", label: "Leads", icon: "✉" });
  tabs.push({ href: "/admin/updates", label: "Updates", icon: "✏" });
  tabs.push({ href: "/admin/billing", label: "Billing", icon: "💳" });
  tabs.push({ href: "/admin/settings", label: "Settings", icon: "⚙" });
  return tabs;
}

export function AdminShell({
  tenant,
  currentPath,
  children,
}: {
  tenant: ShellTenant;
  currentPath: string;
  children: React.ReactNode;
}) {
  const tabs = buildTabs(tenant);
  const primary = tabs.slice(0, 4);
  const overflow = tabs.slice(4);

  return (
    <div className="min-h-screen bg-gray-50 md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:block w-48 bg-white border-r border-gray-200 p-4">
        <div className="font-semibold text-sm mb-4">{tenant.business_name}</div>
        <nav className="flex flex-col gap-1">
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={
                "text-sm px-3 py-2 rounded " +
                (currentPath === t.href
                  ? "bg-pink-50 text-pink-700 font-medium"
                  : "text-gray-700 hover:bg-gray-100")
              }
            >
              <span className="mr-2">{t.icon}</span>
              {t.label}
            </Link>
          ))}
        </nav>
        <div className="mt-8 pt-4 border-t border-gray-200">
          <SignOutButton className="text-sm text-gray-500 hover:text-gray-900" />
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col md:min-h-screen">
        {/* Mobile top bar */}
        <header className="md:hidden bg-pink-600 text-white px-4 py-3 flex justify-between items-center">
          <div className="font-semibold text-sm">{tenant.business_name}</div>
          <SignOutButton className="text-xs opacity-90" />
        </header>

        <main className="flex-1 pb-20 md:pb-0">{children}</main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 py-2 flex justify-around text-xs">
          {primary.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={
                "flex flex-col items-center " +
                (currentPath === t.href ? "text-pink-600" : "text-gray-500")
              }
            >
              <span className="text-base">{t.icon}</span>
              <span className="mt-0.5">{t.label}</span>
            </Link>
          ))}
          {overflow.length > 0 && (
            <details className="flex flex-col items-center text-gray-500 relative">
              <summary className="list-none cursor-pointer text-center">
                <span className="text-base">⋯</span>
                <span className="block mt-0.5">More</span>
              </summary>
              <div className="absolute bottom-full right-2 mb-2 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-40">
                {overflow.map((t) => (
                  <Link
                    key={t.href}
                    href={t.href}
                    className={
                      "block px-4 py-2 text-sm " +
                      (currentPath === t.href ? "text-pink-600 bg-pink-50" : "text-gray-700")
                    }
                  >
                    <span className="mr-2">{t.icon}</span>
                    {t.label}
                  </Link>
                ))}
              </div>
            </details>
          )}
        </nav>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/site/\[slug\]/admin/_components/SignOutButton.tsx src/app/site/\[slug\]/admin/_components/AdminShell.tsx
git commit -m "feat(owner-admin): AdminShell + SignOutButton"
```

---

## Task 12: Admin layout + Home placeholder

**Files:**
- Create: `src/app/site/[slug]/admin/layout.tsx`
- Create: `src/app/site/[slug]/admin/page.tsx`

- [ ] **Step 1: Create the auth-gating layout**

Create `src/app/site/[slug]/admin/layout.tsx`:

```tsx
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySession, AdminTenant } from "@/lib/admin-auth";
import { PinEntry } from "./_components/PinEntry";
import { AdminShell, ShellTenant } from "./_components/AdminShell";

export const dynamic = "force-dynamic";

type TenantRow = AdminTenant & { booking_tool: string | null; checkout_mode: string | null };

async function loadTenantBySlug(slug: string): Promise<TenantRow | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("tenants")
    .select(
      "id, business_name, owner_name, preview_slug, email, admin_email, admin_pin_hash, subscription_status, site_published, booking_tool, checkout_mode"
    )
    .eq("preview_slug", slug)
    .maybeSingle();
  return (data as TenantRow) ?? null;
}

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { slug: string };
}) {
  const tenant = await loadTenantBySlug(params.slug);
  if (!tenant) notFound();

  const sessionCookie = cookies().get("owner_session")?.value;
  const session = sessionCookie ? verifySession(sessionCookie) : null;
  const authed = !!session && session.tenant_id === tenant.id;

  if (!authed) {
    return <PinEntry businessName={tenant.business_name} />;
  }

  // Middleware sets x-pathname with the original request path (e.g. "/admin/schedule").
  // We use it to highlight the current nav tab.
  const pathname = headers().get("x-pathname") || "/admin";

  const shellTenant: ShellTenant = {
    business_name: tenant.business_name,
    booking_tool: tenant.booking_tool,
    checkout_mode: tenant.checkout_mode,
  };

  return (
    <AdminShell tenant={shellTenant} currentPath={pathname}>
      {children}
    </AdminShell>
  );
}
```

- [ ] **Step 2: Create the Home placeholder page**

Create `src/app/site/[slug]/admin/page.tsx`:

```tsx
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function getOwnerName(slug: string): Promise<string> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("tenants")
    .select("owner_name")
    .eq("preview_slug", slug)
    .maybeSingle();
  return (data?.owner_name as string) ?? "there";
}

function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default async function AdminHome({ params }: { params: { slug: string } }) {
  const ownerName = await getOwnerName(params.slug);
  return (
    <div className="px-4 py-5 md:px-8 md:py-6">
      <div className="text-lg font-semibold">
        {greeting()}, {ownerName.split(" ")[0]}
      </div>
      <div className="text-sm text-gray-500 mt-1">Here's what's happening today</div>
      <div className="mt-6 text-sm text-gray-400">
        Your dashboard is getting set up. Stats and activity will appear here soon.
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Manual end-to-end smoke test**

- Start dev server: `npm run dev`
- Pick a test tenant (one with `preview_slug` set, subdomain configured for local dev, or add a row matching your localhost setup).
- In the founder panel (`/clients`), click **Set/Reset PIN** for that tenant — note the PIN.
- Visit the tenant site at its admin path (e.g. `http://<tenant-slug>.localhost:3000/admin` or however local subdomains resolve in this repo).
- Verify the PIN entry screen renders with the business name.
- Enter a wrong PIN → error shows, dots reset.
- Enter the correct PIN → page reloads, shell appears with sidebar (desktop) / bottom nav (mobile), greeting shows the owner's first name.
- Click **Sign out** → redirected back to PIN entry.
- With an unpublished tenant or lapsed subscription, confirm `/admin` still reaches the PIN screen (regression check for the middleware relaxation).

- [ ] **Step 4: Commit**

```bash
git add src/app/site/\[slug\]/admin/layout.tsx src/app/site/\[slug\]/admin/page.tsx
git commit -m "feat(owner-admin): admin layout with auth gate + home placeholder"
```

---

## Post-plan verification

After all tasks are complete, run these checks:

- [ ] **All tests pass:**
  ```bash
  npx tsx --test src/lib/admin-auth.test.ts
  npx tsx --test src/lib/admin-rate-limit.test.ts
  ```
- [ ] **TypeScript compiles:**
  ```bash
  npx tsc --noEmit
  ```
- [ ] **Lint passes:**
  ```bash
  npm run lint
  ```
- [ ] **Manual flow works end-to-end** (the Task 12 smoke test covers this).

---

## What is NOT in this plan (comes later)

- `/admin/schedule`, `/admin/orders`, `/admin/leads`, `/admin/updates`, `/admin/billing`, `/admin/settings` pages (Plans 3 and 4)
- Home rollup cards, Visitors strip, Recent activity (Plan 2)
- Forgot-PIN email reset flow (Plan 4)
- `site_visits`, `contact_leads`, `update_requests`, `admin_pin_resets` tables (Plans 2, 3, 4)
- Change-PIN form inside Settings (Plan 4)

---

## Self-review notes

- **Spec coverage:** This plan implements §Authentication (PIN, session, rate limit), §Routing & Middleware, and the shell described under §Navigation. Home page exists as a placeholder only — rollups come in Plan 2. Other feature pages, forgot-PIN, and founder-side updates beyond "set PIN" are explicitly deferred.
- **Placeholder scan:** None. Each step has concrete code or commands.
- **Type consistency:** `AdminTenant` defined in Task 4 and reused by `ShellTenant` in Task 11. `RateLimitState` and `RateLimitDecision` defined in Task 5 and used there. Session payload type `SessionPayload` defined in Task 3 and used in Task 4.
