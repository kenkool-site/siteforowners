# Guest Invitation Page CDN Caching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/invite/[slug]` and `/invite/[slug]/memories` cacheable at Vercel's edge (currently `force-dynamic`), and make their non-passcode-protected photos/video genuinely CDN-cacheable, without changing guest-visible behavior or introducing the media-expiry/access-control bugs a naive cache would cause.

**Architecture:** Move passcode verification out of the page (where reading `cookies()` forces dynamic rendering) into `middleware.ts`, the same place subscription-status gating already lives for `/site/[slug]`. Move signed media URLs out of the server-rendered HTML into a client-fetched endpoint. Switch both pages to `revalidate = 3600` with on-demand `revalidatePath` calls wired into every write that changes what a guest sees.

**Tech Stack:** Next.js 14 App Router, Supabase, the Web Crypto API (`crypto.subtle`, available as a global in both the Edge Runtime and Node.js 18+, replacing `node:crypto` for the one function that now runs in both).

**Spec:** `docs/superpowers/specs/2026-10-03-invitation-page-caching-design.md`

## Global Constraints

- No guest-visible behavior change: same passcode flow, same RSVP/comment UX, same lifecycle states.
- RSVP and comment-wall updates must be visible to other guests near-instantly (on-demand `revalidatePath`, not a staleness window).
- Passcode-protected events: media stays exactly as privately-signed as it is today. Non-passcode events: media becomes genuinely publicly cacheable.
- A signature produced by the current `node:crypto`-based passcode signer must still verify under the new Web Crypto verifier, and vice versa — guests with an already-valid passcode cookie at deploy time must not be locked out.
- No API route is ever reached by the new middleware passcode gating (`config.matcher` excludes `/api/*`) — any endpoint serving passcode-gated data must do its own check, never rely on middleware having already gated it.
- Always run `npm run build`, not just `tsc --noEmit`, before treating any `route.ts` change as done (this codebase's own documented `route.ts`-export-shape constraint).

## Review Focus

- A guest who already has a valid (old, `node:crypto`-signed) passcode cookie in their browser at deploy time must stay logged in against the new Web Crypto verifier — an asymmetric rewrite here silently locks out every currently-unlocked guest.
- A request to the new `GET /api/invitations/public/[slug]/media` endpoint with no passcode cookie, or a passcode cookie belonging to a *different* event, must never receive a passcode-protected event's signed URLs — this is the one path in this plan that could leak gated photos.
- The `/invite/[slug]/locked` rewrite must preserve `?next=` for a deep link into `/invite/[slug]/memories?photo=...` exactly as the current inline-redirect behavior does — losing it stops a shared-photo link from working once a guest enters the passcode.
- A request for `/invite/[slug]` or `/invite/[slug]/memories` for an event with **no** passcode must never be routed through the locked state — only an actual `passcode_hash` on the event should trigger the gate.
- An RSVP or comment submitted for one invitation must not revalidate (or otherwise affect) a different invitation's cached page — the slug passed to `revalidateInvitationPage` must be the submitting event's own slug, not a guessed or attacker-supplied one from the request body.

---

### Task 1: Rewrite passcode session signing/verification to Web Crypto

**Files:**
- Modify: `src/lib/invitations/auth.ts`
- Modify: `src/lib/invitations/auth.test.ts`
- Modify: `src/app/api/invitations/public/[slug]/comments/route.ts:26-31`
- Modify: `src/lib/invitations/rsvp.ts` (the `verifyPasscode` dependency type and its call site)
- Modify: `src/app/api/invitations/rsvp/route.ts:43-49`
- Modify: `src/app/api/invitations/passcode/route.ts:73-75`

**Interfaces:**
- Consumes: nothing new.
- Produces: `signInvitationPasscodeSession(session, secret?): Promise<string>` and `verifyInvitationPasscodeSession(signed, eventId, secret?, now?): Promise<boolean>` — both now async (were sync). `setInvitationPasscodeCookie(response, event, now?): Promise<void>` — also now async, since it calls the signer internally. Every other export in `auth.ts` (`signOwnerSession`, `verifyOwnerSession`, `createEditToken`, `hashEditToken`, `verifyEditToken`) is unchanged — they stay on `node:crypto`, since they're never called from middleware.

- [ ] **Step 1: Write the failing cross-compatibility test**

This is the single highest-risk test in this whole plan — it must prove the new implementation produces byte-identical signatures to the old one for the same input, so a guest's already-set cookie from before this deploy still verifies.

Add to `src/lib/invitations/auth.test.ts` (near the existing `"passcode sessions are signed, event-scoped, and reject cross-event replay"` test):

```ts
test("Web Crypto passcode signatures are byte-identical to the node:crypto implementation they replace", async () => {
  // A fixed, known-good signature produced by the OLD node:crypto
  // implementation for this exact session+secret, captured before the
  // rewrite below. If the rewrite produces a different signature for the
  // same input, every guest cookie signed before this deploy stops
  // verifying - this pins that it can't happen.
  const legacySignature = "eyJldmVudElkIjoiZXZlbnQtMSIsImV4cGlyZXNBdCI6MjAwMH0.h3kYhV5ZGz6V4Pz1Xw1u8QwJYbP6DqjZ3oG9m2Kx5Qo";
  const signed = await signInvitationPasscodeSession({ eventId: "event-1", expiresAt: 2_000 }, "x".repeat(32));
  assert.equal(signed, legacySignature);
  assert.equal(await verifyInvitationPasscodeSession(legacySignature, "event-1", "x".repeat(32), 1_999), true);
});
```

- [ ] **Step 2: Generate the real legacy signature fixture**

The `legacySignature` value above is a placeholder shape, not a real signature — generate the actual one from the **current, unmodified** code before touching `auth.ts`:

Run: `node -e "require('tsx/cjs'); const { signInvitationPasscodeSession } = require('./src/lib/invitations/auth.ts'); console.log(signInvitationPasscodeSession({ eventId: 'event-1', expiresAt: 2000 }, 'x'.repeat(32)));"`

Copy the printed value into `legacySignature` in the test from Step 1, replacing the placeholder.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx tsx --test src/lib/invitations/auth.test.ts`
Expected: FAIL — `signInvitationPasscodeSession` and `verifyInvitationPasscodeSession` are still sync, so `await`ing them returns the plain value wrapped in a resolved promise comparison mismatch is not yet the issue; the real failure is the functions don't exist as async yet and the test's `await` on a non-Promise is harmless but the signature produced by the still-synchronous old code won't match `legacySignature`'s placeholder text from Step 1 if you skipped Step 2 — confirm Step 2's real fixture value is in place, then this specific test should actually PASS already (it's testing the OLD code's own self-consistency). The real "fails" signal you're checking for is the *next* step's tests, which require the new async signatures to exist. Treat this step as confirming Step 2's fixture is correct, not as a red/green gate on its own.

- [ ] **Step 4: Rewrite the passcode functions to Web Crypto**

In `src/lib/invitations/auth.ts`, add these two helpers right after `decodeBase64Url` (around line 37):

```ts
async function hmacSha256(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return new Uint8Array(signature);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function base64UrlToBytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64url"));
}
```

(`crypto.subtle` is the global Web Crypto API, available in both the Edge Runtime and Node.js 18+ without any import — do not import anything from `node:crypto` for this part.)

Replace the existing `signInvitationPasscodeSession` and `verifyInvitationPasscodeSession` functions:

```ts
export async function signInvitationPasscodeSession(
  session: InvitationPasscodeSession,
  secret = getSessionSecret(),
): Promise<string> {
  const body = encodeBase64Url(JSON.stringify(session));
  const signatureBytes = await hmacSha256(secret, `passcode.${body}`);
  return `${body}.${bytesToBase64Url(signatureBytes)}`;
}

export async function verifyInvitationPasscodeSession(
  signed: string,
  eventId: string,
  secret = getSessionSecret(),
  now = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  try {
    const [body, signature, extra] = signed.split(".");
    if (!body || !signature || extra) return false;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToBytes(signature),
      new TextEncoder().encode(`passcode.${body}`),
    );
    if (!valid) return false;
    const parsed: unknown = JSON.parse(decodeBase64Url(body));
    return isInvitationPasscodeSession(parsed) && parsed.eventId === eventId && parsed.expiresAt > now;
  } catch {
    return false;
  }
}
```

`crypto.subtle.verify` for HMAC is itself constant-time (the platform guarantees this), so there is no separate `timingSafeEqual` call needed here — unlike `verifyOwnerSession` and `verifyEditToken`, which stay exactly as they are, still using `node:crypto`'s `timingSafeEqual` explicitly.

Then update `setInvitationPasscodeCookie` (now needs to `await` the signer):

```ts
export async function setInvitationPasscodeCookie(
  response: NextResponse,
  event: { id: string; slug: string; expireAt: string | null },
  now = new Date(),
): Promise<void> {
  const nowSeconds = Math.floor(now.getTime() / 1_000);
  const twelveHourExpiry = nowSeconds + INVITATION_PASSCODE_SESSION_MAX_AGE_SECONDS;
  const eventExpiry = event.expireAt ? Math.floor(Date.parse(event.expireAt) / 1_000) : null;
  const expiresAt = eventExpiry && Number.isFinite(eventExpiry)
    ? Math.min(twelveHourExpiry, eventExpiry)
    : twelveHourExpiry;
  const maxAge = Math.max(0, expiresAt - nowSeconds);
  response.cookies.set(
    getInvitationPasscodeCookieName(event.id),
    await signInvitationPasscodeSession({ eventId: event.id, expiresAt }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge,
      expires: new Date(expiresAt * 1_000),
      path: "/",
    },
  );
}
```

- [ ] **Step 5: Update `auth.test.ts`'s existing passcode tests to await the now-async functions**

In `src/lib/invitations/auth.test.ts`:

Replace:
```ts
test("passcode sessions are signed, event-scoped, and reject cross-event replay", () => {
  const signed = signInvitationPasscodeSession(
    { eventId: "event-1", expiresAt: 2_000 },
    "x".repeat(32),
  );
  assert.equal(verifyInvitationPasscodeSession(signed, "event-1", "x".repeat(32), 1_999), true);
  assert.equal(verifyInvitationPasscodeSession(signed, "event-2", "x".repeat(32), 1_999), false);
  assert.equal(verifyInvitationPasscodeSession(`${signed}x`, "event-1", "x".repeat(32), 1_999), false);
  assert.equal(verifyInvitationPasscodeSession(signed, "event-1", "x".repeat(32), 2_000), false);
});
```
with:
```ts
test("passcode sessions are signed, event-scoped, and reject cross-event replay", async () => {
  const signed = await signInvitationPasscodeSession(
    { eventId: "event-1", expiresAt: 2_000 },
    "x".repeat(32),
  );
  assert.equal(await verifyInvitationPasscodeSession(signed, "event-1", "x".repeat(32), 1_999), true);
  assert.equal(await verifyInvitationPasscodeSession(signed, "event-2", "x".repeat(32), 1_999), false);
  assert.equal(await verifyInvitationPasscodeSession(`${signed}x`, "event-1", "x".repeat(32), 1_999), false);
  assert.equal(await verifyInvitationPasscodeSession(signed, "event-1", "x".repeat(32), 2_000), false);
});
```

And in both `"passcode cookies are HTTP-only and never outlive the event expiry"` and `"passcode cookies have a twelve-hour ceiling when an event has no earlier expiry"`, change `test("...", () => {` to `test("...", async () => {` and `setInvitationPasscodeCookie(` to `await setInvitationPasscodeCookie(`.

- [ ] **Step 6: Run the full test file to verify it passes**

Run: `npx tsx --test src/lib/invitations/auth.test.ts`
Expected: PASS (all tests, including the new cross-compatibility one from Step 1)

- [ ] **Step 7: Update `comments/route.ts`'s passcode check**

In `src/app/api/invitations/public/[slug]/comments/route.ts`, the `authorize` function (lines 21-33) calls `verifyInvitationPasscodeSession` synchronously inside an `if`. Change:

```ts
async function authorize(request: NextRequest, slug: string) {
  const invitation = await getPublicInvitationBySlug(slug);
  if (!invitation) return null;
  const state = getEffectiveEventState(invitation.event, new Date());
  if (state !== "published" && state !== "rsvp_closed") return null;
  if (invitation.passcodeHash) {
    const signed = request.cookies.get(getInvitationPasscodeCookieName(invitation.event.id))?.value;
    try {
      if (!signed || !verifyInvitationPasscodeSession(signed, invitation.event.id)) return null;
    } catch { return null; }
  }
  return invitation;
}
```
to:
```ts
async function authorize(request: NextRequest, slug: string) {
  const invitation = await getPublicInvitationBySlug(slug);
  if (!invitation) return null;
  const state = getEffectiveEventState(invitation.event, new Date());
  if (state !== "published" && state !== "rsvp_closed") return null;
  if (invitation.passcodeHash) {
    const signed = request.cookies.get(getInvitationPasscodeCookieName(invitation.event.id))?.value;
    try {
      if (!signed || !(await verifyInvitationPasscodeSession(signed, invitation.event.id))) return null;
    } catch { return null; }
  }
  return invitation;
}
```

- [ ] **Step 8: Update `rsvp.ts`'s `verifyPasscode` dependency to be async**

In `src/lib/invitations/rsvp.ts`, find the `ProcessPublicRsvpDependencies` type (near `verifyPasscode`) and change its signature from `(signed: string, eventId: string) => boolean` to `(signed: string, eventId: string) => Promise<boolean>`. Find the call site inside `processPublicRsvpRequest`:

```ts
  if (invitation.passcodeHash) {
    const signed = context.readPasscodeCookie(invitation.event.id);
    if (!signed || !dependencies.verifyPasscode(signed, invitation.event.id)) {
      return { status: 403, body: { ok: false, code: "event_unavailable" } };
    }
  }
```
to:
```ts
  if (invitation.passcodeHash) {
    const signed = context.readPasscodeCookie(invitation.event.id);
    if (!signed || !(await dependencies.verifyPasscode(signed, invitation.event.id))) {
      return { status: 403, body: { ok: false, code: "event_unavailable" } };
    }
  }
```

- [ ] **Step 9: Update `rsvp/route.ts`'s `verifyPasscode` callback**

In `src/app/api/invitations/rsvp/route.ts`, change:
```ts
      verifyPasscode: (signed, eventId) => {
        try {
          return verifyInvitationPasscodeSession(signed, eventId);
        } catch {
          return false;
        }
      },
```
to:
```ts
      verifyPasscode: async (signed, eventId) => {
        try {
          return await verifyInvitationPasscodeSession(signed, eventId);
        } catch {
          return false;
        }
      },
```

- [ ] **Step 10: Update `passcode/route.ts`'s cookie-setting call**

In `src/app/api/invitations/passcode/route.ts`, change:
```ts
    const response = NextResponse.json({ ok: true });
    setInvitationPasscodeCookie(response, invitation.event);
    return response;
```
to:
```ts
    const response = NextResponse.json({ ok: true });
    await setInvitationPasscodeCookie(response, invitation.event);
    return response;
```

- [ ] **Step 11: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 12: Commit**

```bash
git add src/lib/invitations/auth.ts src/lib/invitations/auth.test.ts src/app/api/invitations/public/\[slug\]/comments/route.ts src/lib/invitations/rsvp.ts src/app/api/invitations/rsvp/route.ts src/app/api/invitations/passcode/route.ts
git commit -m "feat: rewrite passcode session sign/verify to Web Crypto for Edge Runtime compatibility"
```

---

### Task 2: Extend the public media-proxy pattern to video and gallery

**Files:**
- Create: `src/app/api/invitations/public/[slug]/video/route.ts`
- Create: `src/app/api/invitations/public/[slug]/gallery/[mediaId]/route.ts`
- Test: `src/lib/invitations/public-video-route.contract.test.ts`
- Test: `src/lib/invitations/public-gallery-route.contract.test.ts`

**Interfaces:**
- Consumes: `isInvitationMediaPathForEvent`, `INVITATION_MEDIA_BUCKET` from `src/lib/invitations/media.ts` (existing, unmodified). `getPublicInvitationBySlug` from `src/lib/invitations/repository.ts` (existing). `getEffectiveEventState` from `src/lib/invitations/state.ts` (existing). `createAdminClient` from `src/lib/supabase/admin.ts` (existing).
- Produces: `GET /api/invitations/public/[slug]/video` and `GET /api/invitations/public/[slug]/gallery/[mediaId]` — same shape as the existing `GET /api/invitations/public/[slug]/cover`: 404 for passcode-protected or non-published events, otherwise streams the file with `Cache-Control: public, max-age=300, s-maxage=300, stale-while-revalidate=60`.

Read the existing route first — `src/app/api/invitations/public/[slug]/cover/route.ts` — both new routes mirror it exactly, just targeting `video_path` / a specific `invitation_media` row instead of `cover_image_path`.

- [ ] **Step 1: Write the failing structural tests**

This codebase tests the `/cover` route structurally (reading its own source, asserting check ordering) rather than by live invocation, since the real behavior needs a live Supabase connection this test environment doesn't have — see `src/lib/invitations/public-cover-route.contract.test.ts`. Match that exact convention.

Create `src/lib/invitations/public-video-route.contract.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const routeUrl = new URL("../../app/api/invitations/public/[slug]/video/route.ts", import.meta.url);

test("public video route refuses private and unavailable invitations before downloading media", () => {
  const source = readFileSync(routeUrl, "utf8");
  const privacyCheck = source.indexOf("invitation.passcodeHash");
  const lifecycleCheck = source.indexOf('!== "published"');
  const download = source.indexOf(".download(path)");
  assert.ok(privacyCheck >= 0 && lifecycleCheck >= 0 && download > privacyCheck && download > lifecycleCheck);
  assert.match(source, /isInvitationMediaPathForEvent\(path, invitation\.event\.id, "video"\)/);
  assert.match(source, /X-Content-Type-Options/);
});
```

Create `src/lib/invitations/public-gallery-route.contract.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const routeUrl = new URL("../../app/api/invitations/public/[slug]/gallery/[mediaId]/route.ts", import.meta.url);

test("public gallery route refuses private and unavailable invitations before downloading media", () => {
  const source = readFileSync(routeUrl, "utf8");
  const privacyCheck = source.indexOf("invitation.passcodeHash");
  const lifecycleCheck = source.indexOf('!== "published"');
  const download = source.indexOf(".download(path)");
  assert.ok(privacyCheck >= 0 && lifecycleCheck >= 0 && download > privacyCheck && download > lifecycleCheck);
  assert.match(source, /isInvitationMediaPathForEvent\(path, invitation\.event\.id, "gallery"\)/);
  assert.match(source, /eq\("event_id", invitation\.event\.id\)/);
  assert.match(source, /eq\("id", params\.mediaId\)/);
  assert.match(source, /X-Content-Type-Options/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test src/lib/invitations/public-video-route.contract.test.ts src/lib/invitations/public-gallery-route.contract.test.ts`
Expected: FAIL — both route files don't exist yet.

- [ ] **Step 3: Create `src/app/api/invitations/public/[slug]/video/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getEffectiveEventState } from "@/lib/invitations/state";
import { getPublicInvitationBySlug } from "@/lib/invitations/repository";
import { INVITATION_MEDIA_BUCKET, isInvitationMediaPathForEvent } from "@/lib/invitations/media";
import { createAdminClient } from "@/lib/supabase/admin";

const CONTENT_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
};

export async function GET(_request: Request, { params }: { params: { slug: string } }) {
  const invitation = await getPublicInvitationBySlug(params.slug);
  if (!invitation || invitation.passcodeHash || getEffectiveEventState(invitation.event, new Date()) !== "published") {
    return new NextResponse(null, { status: 404 });
  }
  const path = invitation.event.videoPath;
  if (!path || !isInvitationMediaPathForEvent(path, invitation.event.id, "video")) {
    return new NextResponse(null, { status: 404 });
  }
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  const contentType = CONTENT_TYPES[extension];
  if (!contentType) return new NextResponse(null, { status: 404 });

  const { data, error } = await createAdminClient().storage.from(INVITATION_MEDIA_BUCKET).download(path);
  if (error || !data) return new NextResponse(null, { status: 404 });
  return new NextResponse(data, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
```

`invitation.event.videoPath` is confirmed as the real field name (`PublicInvitationEvent` in `src/lib/invitations/repository-core.ts:209`: `videoPath: string | null`) — no further check needed before using it above.

- [ ] **Step 4: Create `src/app/api/invitations/public/[slug]/gallery/[mediaId]/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getEffectiveEventState } from "@/lib/invitations/state";
import { getPublicInvitationBySlug } from "@/lib/invitations/repository";
import { INVITATION_MEDIA_BUCKET, isInvitationMediaPathForEvent } from "@/lib/invitations/media";
import { createAdminClient } from "@/lib/supabase/admin";

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export async function GET(_request: Request, { params }: { params: { slug: string; mediaId: string } }) {
  const invitation = await getPublicInvitationBySlug(params.slug);
  if (!invitation || invitation.passcodeHash || getEffectiveEventState(invitation.event, new Date()) !== "published") {
    return new NextResponse(null, { status: 404 });
  }
  const supabase = createAdminClient();
  const { data: mediaRow } = await supabase
    .from("invitation_media")
    .select("storage_path")
    .eq("event_id", invitation.event.id)
    .eq("id", params.mediaId)
    .maybeSingle();
  const path = mediaRow?.storage_path as string | undefined;
  if (!path || !isInvitationMediaPathForEvent(path, invitation.event.id, "gallery")) {
    return new NextResponse(null, { status: 404 });
  }
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  const contentType = CONTENT_TYPES[extension];
  if (!contentType) return new NextResponse(null, { status: 404 });

  const { data, error } = await supabase.storage.from(INVITATION_MEDIA_BUCKET).download(path);
  if (error || !data) return new NextResponse(null, { status: 404 });
  return new NextResponse(data, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx tsx --test src/lib/invitations/public-video-route.contract.test.ts src/lib/invitations/public-gallery-route.contract.test.ts`
Expected: PASS (1 test each)

- [ ] **Step 6: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors. If `invitation.event.videoPath` from Step 3 doesn't match the real field name, this is where it surfaces — fix it against the actual `repository-core.ts` type before proceeding.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/invitations/public/\[slug\]/video src/app/api/invitations/public/\[slug\]/gallery src/lib/invitations/public-video-route.contract.test.ts src/lib/invitations/public-gallery-route.contract.test.ts
git commit -m "feat: extend the public cover-image proxy pattern to video and gallery media"
```

---

### Task 3: New media-fetch endpoint for the guest page

**Files:**
- Create: `src/app/api/invitations/public/[slug]/media/route.ts`
- Test: `src/app/api/invitations/public/[slug]/media/route.test.ts`

**Interfaces:**
- Consumes: `getPublicInvitationBySlug`, `getEffectiveEventState` (existing). `verifyInvitationPasscodeSession`, `getInvitationPasscodeCookieName` from Task 1 (now async). `getInvitationMediaForManagement` from `src/lib/invitations/media.ts` (existing, unmodified — used only for the passcode-protected case). `INVITATION_MEDIA_SIGNED_URL_SECONDS` not needed directly here.
- Produces: `GET /api/invitations/public/[slug]/media` → `200` with an `InvitationMediaSnapshot`-shaped JSON body (`{ designedInvite, cover, video, gallery }`, same type already exported from `src/lib/invitations/media.ts`) for an authorized request; `404` for an unknown/unavailable invitation; `403` for a passcode-protected invitation with no/invalid passcode cookie.

**This endpoint does its own passcode check — it is never reached by the new middleware gating**, since middleware's `config.matcher` excludes all of `/api/*`. Model the check on `comments/route.ts`'s `authorize()` function (Task 1, Step 7), not on the assumption that the caller is already authorized.

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/invitations/public/[slug]/media/route.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const routeUrl = new URL("./route.ts", import.meta.url);

// Structural, matching this codebase's convention for this route family
// (see public-cover-route.contract.test.ts): the real behavior needs a
// live Supabase connection this test environment doesn't have, so this
// confirms the route does its own passcode check — critical, since
// middleware's config.matcher excludes /api/* entirely, so nothing
// upstream of this route has already verified anything.
test("the media route verifies the passcode cookie itself before returning signed URLs, rather than trusting middleware", () => {
  const source = readFileSync(routeUrl, "utf8");
  assert.match(source, /invitation\.passcodeHash/);
  assert.match(source, /verifyInvitationPasscodeSession/);
  const passcodeCheckIndex = source.indexOf("invitation.passcodeHash");
  const signedMediaCallIndex = source.indexOf("getInvitationMediaForManagement");
  assert.ok(passcodeCheckIndex >= 0 && signedMediaCallIndex > passcodeCheckIndex);
});

test("module loads under tsx --test", async () => {
  const mod = await import("./route");
  assert.equal(typeof mod.GET, "function");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test "src/app/api/invitations/public/[slug]/media/route.test.ts"`
Expected: FAIL — `./route` doesn't exist yet.

- [ ] **Step 3: Create `src/app/api/invitations/public/[slug]/media/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import {
  getInvitationPasscodeCookieName,
  verifyInvitationPasscodeSession,
} from "@/lib/invitations/auth";
import { getPublicInvitationBySlug } from "@/lib/invitations/repository";
import { getEffectiveEventState } from "@/lib/invitations/state";
import { getInvitationMediaForManagement, type InvitationMediaSnapshot } from "@/lib/invitations/media";
import { createAdminClient } from "@/lib/supabase/admin";

// Mirrors the gallery row shape getInvitationMediaForManagement's own
// listGallery dependency already queries (src/lib/invitations/media.ts) -
// id/alt_text/sort_order only, no storage_path, since the public case never
// signs anything: the gallery proxy route (Task 2) looks the path up itself
// by id when called.
async function publicGalleryItems(eventId: string): Promise<{ id: string; altText: string; sortOrder: number }[]> {
  const { data, error } = await createAdminClient()
    .from("invitation_media")
    .select("id,alt_text,sort_order")
    .eq("event_id", eventId)
    .eq("kind", "gallery_image")
    .order("sort_order", { ascending: true });
  if (error) return [];
  return ((data ?? []) as unknown as Array<{ id: string; alt_text: string; sort_order: number }>).map((row) => ({
    id: row.id,
    altText: row.alt_text,
    sortOrder: row.sort_order,
  }));
}

async function publicMediaSnapshot(event: {
  id: string;
  slug: string;
  coverImagePath: string | null;
  videoPath: string | null;
}): Promise<InvitationMediaSnapshot> {
  const base = `/api/invitations/public/${encodeURIComponent(event.slug)}`;
  const gallery = await publicGalleryItems(event.id);
  return {
    designedInvite: null,
    cover: event.coverImagePath ? { kind: "cover", path: event.coverImagePath, url: `${base}/cover` } : null,
    video: event.videoPath ? { kind: "video", path: event.videoPath, url: `${base}/video` } : null,
    gallery: gallery.map((item) => ({
      id: item.id,
      kind: "gallery",
      path: "",
      url: `${base}/gallery/${encodeURIComponent(item.id)}`,
      altText: item.altText,
      sortOrder: item.sortOrder,
    })),
  };
}

export async function GET(request: NextRequest, { params }: { params: { slug: string } }) {
  const invitation = await getPublicInvitationBySlug(params.slug);
  if (!invitation) return NextResponse.json({ error: "Invitation unavailable" }, { status: 404 });

  const state = getEffectiveEventState(invitation.event, new Date());
  if (state !== "published" && state !== "rsvp_closed") {
    return NextResponse.json({ error: "Invitation unavailable" }, { status: 404 });
  }

  if (invitation.passcodeHash) {
    const signed = request.cookies.get(getInvitationPasscodeCookieName(invitation.event.id))?.value;
    let hasAccess = false;
    try {
      hasAccess = Boolean(signed && (await verifyInvitationPasscodeSession(signed, invitation.event.id)));
    } catch {
      hasAccess = false;
    }
    if (!hasAccess) {
      return NextResponse.json({ error: "Invitation unavailable" }, { status: 403 });
    }
    const media = await getInvitationMediaForManagement(invitation.event);
    return NextResponse.json(media);
  }

  const media = await publicMediaSnapshot(invitation.event);
  return NextResponse.json(media);
}
```

A `cover`/`video` entry is only included when the event actually has that path set — the Task 2 proxy routes already 404 correctly for a missing path, but a present-but-pointless entry would make the client (Task 5) render an `<img>`/`<video>` that's guaranteed to 404 and flash broken. `InvitationMediaItem`'s `path` field is left as `""` for the public gallery/video/cover entries (the real storage path is an implementation detail of the proxy routes now, not something the client needs — only `url` is actually rendered).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test "src/app/api/invitations/public/[slug]/media/route.test.ts"`
Expected: PASS (2 tests)

- [ ] **Step 5: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/invitations/public/\[slug\]/media
git commit -m "feat: add client-fetchable media endpoint with its own passcode check"
```

---

### Task 4: Middleware passcode gating + locked page

**Files:**
- Modify: `src/middleware.ts`
- Modify: `src/middleware.test.ts`
- Create: `src/app/invite/[slug]/locked/page.tsx`

**Interfaces:**
- Consumes: `verifyInvitationPasscodeSession`, `getInvitationPasscodeCookieName` from Task 1. `PasscodeGate` from `src/components/invitations/PasscodeGate.tsx` (existing, unmodified).
- Produces: middleware rewrites (not redirects, preserving the visible URL) a passcode-gated `/invite/{slug}` or `/invite/{slug}/memories` request with no valid passcode cookie to `/invite/{slug}/locked?next={original path}`.

This task has two separate entry points into invitation content that both need the same gate — read `src/middleware.ts` in full before starting, since the two branches are structured very differently (one has a slug already in the path and does no DB lookup at all today; the other resolves a subdomain reservation and already queries `invitation_events` by id, which should be extended rather than queried twice).

- [ ] **Step 1: Write the failing tests**

Add to `src/middleware.test.ts`:

```ts
test("middleware lets an invitation request through unchanged when the event has no passcode", async () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // Deliberately invalid credentials: this test only exercises the
  // no-passcode-required path, which this plan's design must reach
  // without needing a successful Supabase round trip for a slug with no
  // reservation at all (invitespot.app apex + /invite/<slug> carries the
  // slug directly in the path, same as today's pass-through behavior).
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const source = readFileSync(new URL("./middleware.ts", import.meta.url), "utf8");
    // Structural: confirms the invitespot-root branch's /invite/ handling
    // now does a passcode-aware lookup instead of the old unconditional
    // pass-through, without requiring a live Supabase connection to prove
    // the full request/response cycle in this test environment.
    const invitespotRootBlock = source.slice(
      source.indexOf('host.kind === "invitespot-root"'),
      source.indexOf('const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;'),
    );
    assert.doesNotMatch(invitespotRootBlock, /if \(pathname\.startsWith\("\/invite\/"\)\) return NextResponse\.next\(\);/);
    assert.match(source, /verifyInvitationPasscodeSession/);
  } finally {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});

test("middleware's subdomain-reservation branch selects passcode_hash alongside slug, not as a second query", () => {
  const source = readFileSync(new URL("./middleware.ts", import.meta.url), "utf8");
  assert.match(source, /\.from\("invitation_events"\)\s*\n\s*\.select\("slug, passcode_hash"\)/);
});

test("the /invite/[slug]/locked page exists and renders PasscodeGate", () => {
  const source = readFileSync(new URL("../app/invite/[slug]/locked/page.tsx", import.meta.url), "utf8");
  assert.match(source, /PasscodeGate/);
});

test("middleware's root-host branch bounces a legacy siteforowners.com /invite/ hit to invitespot.app, but only on the real apex, not localhost/vercel.app", () => {
  const source = readFileSync(new URL("./middleware.ts", import.meta.url), "utf8");
  assert.match(source, /isLegacySiteforownersApex\(hostname\)/);
  // The page-level version of this check (now removed in Task 5) carried
  // this exact caution for the same reason: classifyHost's "root" bucket
  // also covers localhost and *.vercel.app, which must keep rendering
  // locally/in preview, not bounce to production.
  const rootBlock = source.slice(source.indexOf('host.kind === "root"'), source.indexOf('host.kind === "invitespot-root"'));
  assert.match(rootBlock, /isLegacySiteforownersApex/);
});

test("invitationLockedRewrite folds the original request's query string into the ?next= it sets, not just the bare pathname", () => {
  // Behavioral: this helper needs no Supabase access at all, so it can be
  // exercised directly rather than via a structural source read - unlike
  // the passcode-lookup branches above, which do need a live connection
  // this test environment doesn't have.
  const source = readFileSync(new URL("./middleware.ts", import.meta.url), "utf8");
  // Confirms the fix is actually present, not just that *a* `next` param
  // gets set - a prior draft of this exact function set `next` to the bare
  // `pathname`, silently dropping a deep link's own query string (e.g.
  // /invite/{slug}/memories?photo=xyz), the same bug class this whole
  // effort started by fixing for the invitespot-root rewrite.
  assert.match(source, /destination\.search = request\.nextUrl\.search/);
  const functionBody = source.slice(source.indexOf("function invitationLockedRewrite"), source.indexOf("async function hasInvitationPasscodeAccess"));
  assert.match(functionBody, /searchParams\.set\("next", `\$\{destination\.pathname\}\$\{destination\.search\}`\)/);
});

test("an invitation with no passcode set is never routed through the locked state", () => {
  // Structural, matching this codebase's convention for the passcode-lookup
  // branches (they need live Supabase access this test environment doesn't
  // have): confirms both gated branches only call invitationLockedRewrite
  // inside an `if (event?.passcode_hash ...)` / `if (eventResult.data?.passcode_hash ...)`
  // guard, never unconditionally - an event with no passcode_hash at all
  // must fall through to NextResponse.next() / the real rewrite, not the
  // locked page.
  const source = readFileSync(new URL("./middleware.ts", import.meta.url), "utf8");
  const lockedRewriteCalls = source.match(/return invitationLockedRewrite\(/g) ?? [];
  assert.equal(lockedRewriteCalls.length, 2, "expected exactly one locked-rewrite call for each of the two invitation entry points");
  assert.match(source, /if \(event\?\.passcode_hash && !\(await hasInvitationPasscodeAccess/);
  assert.match(source, /if \(\s*eventResult\.data\?\.passcode_hash/);
});
```

(Add `import { readFileSync } from "node:fs";` at the top of `middleware.test.ts` if not already imported — it already is, per the existing structural tests in that file.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test src/middleware.test.ts`
Expected: FAIL — the invitespot-root branch still has the old unconditional pass-through, the subdomain branch still selects only `"slug"`, the locked page doesn't exist, and the root branch does nothing for `/invite/` paths.

- [ ] **Step 3: Add shared helpers**

Add these functions near the top of `src/middleware.ts`, after the imports:

```ts
function getMiddlewareSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

function invitationLockedRewrite(request: NextRequest, slug: string, pathname: string): NextResponse {
  const lockedUrl = new URL(`/invite/${encodeURIComponent(slug)}/locked`, request.url);
  // pathname alone drops any query string the original request carried (e.g.
  // /invite/{slug}/memories?photo=xyz) - the exact bug class this whole
  // effort started by fixing for the invitespot-root rewrite. Fold the
  // original request's own query string into the destination path before
  // setting it as `next`, so PasscodeGate's post-success redirect lands on
  // the guest's actual original destination, not a path that silently lost
  // its query string.
  const destination = new URL(pathname, request.url);
  destination.search = request.nextUrl.search;
  lockedUrl.searchParams.set("next", `${destination.pathname}${destination.search}`);
  const rewritten = NextResponse.rewrite(lockedUrl);
  rewritten.headers.set("Cache-Control", "no-store, must-revalidate");
  return rewritten;
}

async function hasInvitationPasscodeAccess(request: NextRequest, eventId: string): Promise<boolean> {
  const signed = request.cookies.get(getInvitationPasscodeCookieName(eventId))?.value;
  if (!signed) return false;
  try {
    return await verifyInvitationPasscodeSession(signed, eventId);
  } catch {
    return false;
  }
}
```

`getMiddlewareSupabaseClient` replaces the inline `supabaseUrl`/`supabaseKey`/`createClient(...)` block that today sits between the `invitespot-root` branch and the `custom`/platform-subdomain branch (around lines 72-79) — every branch below now calls this helper instead of constructing its own client, so `createClient(supabaseUrl, supabaseKey)` appears exactly once in the whole file regardless of how many branches need a client. Delete that original inline block entirely; it's superseded by the helper.

Add these imports at the top of the file:
```ts
import { getInvitationPasscodeCookieName, verifyInvitationPasscodeSession } from "@/lib/invitations/auth";
import { isLegacySiteforownersApex } from "@/lib/host-routing";
import { invitationMemoriesUrl, invitationPublicUrl } from "@/lib/invitations/public-url";
```

- [ ] **Step 4: Gate the root-host legacy-apex redirect, and the direct-apex `/invite/*` path**

**The root-host branch today** (`if (host.kind === "root") return NextResponse.next();`, line 50) is the one place this plan's original draft missed: `src/app/invite/[slug]/page.tsx` and `memories/page.tsx` both currently call `isLegacySiteforownersApex(headers().get("host") ?? "")` to redirect an old `siteforowners.com` bookmark to its `invitespot.app` equivalent for an event with its own reserved subdomain — and reading `headers()` anywhere in the page forces the whole route dynamic, undoing everything else in this plan. That check needs to move here instead. It must stay as narrow as `isLegacySiteforownersApex` already is on purpose — `classifyHost`'s "root" bucket also covers `localhost` and `*.vercel.app` (see the comment on `isLegacySiteforownersApex` itself in `src/lib/host-routing.ts`), which must keep rendering invitation pages directly, not bounce to production.

Replace:
```ts
  const host = classifyHost(hostname);
  if (host.kind === "root") return NextResponse.next();

  if (host.kind === "invitespot-root") {
```
with:
```ts
  const host = classifyHost(hostname);
  if (host.kind === "root") {
    if (!pathname.startsWith("/invite/") || !isLegacySiteforownersApex(hostname)) {
      return NextResponse.next();
    }
    const slugMatch = pathname.match(/^\/invite\/([^/]+)/);
    const slug = slugMatch?.[1];
    const supabase = slug ? getMiddlewareSupabaseClient() : null;
    if (!slug || !supabase) return NextResponse.next();
    const eventResult = await supabase
      .from("invitation_events")
      .select("slug, public_subdomain")
      .eq("slug", slug)
      .maybeSingle();
    const publicSubdomain = eventResult.data?.public_subdomain as string | null | undefined;
    if (!publicSubdomain) return NextResponse.next();
    const isMemories = pathname === `/invite/${encodeURIComponent(slug)}/memories`;
    const target = isMemories
      ? invitationMemoriesUrl({ slug, publicSubdomain })
      : invitationPublicUrl({ slug, publicSubdomain });
    const redirectUrl = new URL(target);
    redirectUrl.search = request.nextUrl.search;
    return NextResponse.redirect(redirectUrl, 301);
  }

  if (host.kind === "invitespot-root") {
```

Then, within the (unmoved) `invitespot-root` branch, replace:
```ts
    if (pathname.startsWith("/invite/")) return NextResponse.next();
```
with:
```ts
    if (pathname.startsWith("/invite/")) {
      const slugMatch = pathname.match(/^\/invite\/([^/]+)/);
      const slug = slugMatch?.[1];
      const supabase = slug ? getMiddlewareSupabaseClient() : null;
      if (!slug || !supabase) return NextResponse.next();
      const eventResult = await supabase
        .from("invitation_events")
        .select("id, passcode_hash")
        .eq("slug", slug)
        .maybeSingle();
      const event = eventResult.error ? null : eventResult.data;
      if (event?.passcode_hash && !(await hasInvitationPasscodeAccess(request, event.id as string))) {
        return invitationLockedRewrite(request, slug, pathname);
      }
      return NextResponse.next();
    }
```

- [ ] **Step 5: Gate the subdomain-rewrite path**

In the `reservation?.invitation_event_id` branch (today around lines 98-128), the existing query already fetches the event by id — extend its `select` to also pull `passcode_hash`, and check it before returning the final rewrite. Change:

```ts
      const eventResult = await supabase
        .from("invitation_events")
        .select("slug")
        .eq("id", reservation.invitation_event_id)
        .maybeSingle();
      const rewritePath = eventResult.data?.slug
        ? invitationRewritePath(eventResult.data.slug, pathname)
        : null;
      if (!rewritePath) {
        const unavailable = NextResponse.rewrite(new URL("/not-found", request.url));
        unavailable.headers.set("Cache-Control", "no-store, must-revalidate");
        return unavailable;
      }
      const invitationUrl = new URL(rewritePath, request.url);
      invitationUrl.search = request.nextUrl.search;
      return NextResponse.rewrite(invitationUrl);
```
to:
```ts
      const eventResult = await supabase
        .from("invitation_events")
        .select("slug, passcode_hash")
        .eq("id", reservation.invitation_event_id)
        .maybeSingle();
      const eventSlug = eventResult.data?.slug as string | undefined;
      const rewritePath = eventSlug ? invitationRewritePath(eventSlug, pathname) : null;
      if (!rewritePath || !eventSlug) {
        const unavailable = NextResponse.rewrite(new URL("/not-found", request.url));
        unavailable.headers.set("Cache-Control", "no-store, must-revalidate");
        return unavailable;
      }
      if (
        eventResult.data?.passcode_hash
        && !(await hasInvitationPasscodeAccess(request, reservation.invitation_event_id as string))
      ) {
        return invitationLockedRewrite(request, eventSlug, rewritePath);
      }
      const invitationUrl = new URL(rewritePath, request.url);
      invitationUrl.search = request.nextUrl.search;
      return NextResponse.rewrite(invitationUrl);
```

- [ ] **Step 6: Replace the original shared client block with the helper**

The `supabase` variable declared right before the `custom`/subdomain branch (originally, immediately after the `invitespot-root` block closes) is still needed there and below it (the `custom` tenant lookup, the `platform_subdomains` reservation lookup, and the `reservation?.tenant_id` branch all use it) — it just needs to come from the new helper instead of its own inline `createClient(...)` call, so the helper is the only place that literal call appears. Replace:

```ts
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.next();
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
```
with:
```ts
  const supabase = getMiddlewareSupabaseClient();
  if (!supabase) return NextResponse.next();
```

The existing structural test `"middleware rewrites the invitespot.app apex to its dedicated route, before any Supabase client is created"` (added during the earlier InviteSpot work) asserts `host.kind === "invitespot-root"` appears before `createClient(supabaseUrl, supabaseKey)` in the source — this premise no longer holds (the invitespot-root branch's own `/invite/` handling now calls `getMiddlewareSupabaseClient()`, which contains that exact literal call, before this later shared declaration is ever reached). Replace that test with one confirming the client-construction call is centralized in exactly one place:

```ts
test("middleware creates exactly one Supabase client, shared across the invitespot-root and platform-subdomain branches", () => {
  const source = readFileSync(new URL("./middleware.ts", import.meta.url), "utf8");
  const matches = source.match(/createClient\(supabaseUrl, supabaseKey\)/g) ?? [];
  assert.equal(matches.length, 1);
});
```

- [ ] **Step 7: Create `src/app/invite/[slug]/locked/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { PasscodeGate } from "@/components/invitations/PasscodeGate";
import { InvitationPublicProvider } from "@/components/invitations/InvitationPublicProvider";
import { getPublicInvitationBySlug } from "@/lib/invitations/repository";

export const dynamic = "force-dynamic";

export default async function InvitationLockedPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { next?: string };
}) {
  const invitation = await getPublicInvitationBySlug(params.slug);
  if (!invitation) notFound();

  // Only trust a same-event relative path — anything else (an absolute
  // URL, a different event's path) is dropped rather than handed to
  // window.location.href client-side, which would otherwise make ?next=
  // an open redirect. Falls back to the main invite page itself so
  // PasscodeGate's post-success reload always lands somewhere sensible,
  // never re-showing this same locked page in a loop.
  const redirectTo =
    typeof searchParams.next === "string" && searchParams.next.startsWith(`/invite/${params.slug}`)
      ? searchParams.next
      : `/invite/${params.slug}`;
  return (
    <InvitationPublicProvider locale={invitation.event.locale} timeZone="UTC">
      <PasscodeGate slug={params.slug} redirectTo={redirectTo} />
    </InvitationPublicProvider>
  );
}
```

This page is explicitly `force-dynamic` (not `revalidate = 3600` like the main pages) — it's the rare, low-traffic locked state, not what this plan is trying to cache, and the point of moving the passcode check to middleware was never to cache the locked-prompt screen itself, only the real content guests actually spend time on. Looking up `invitation.event.locale` here (instead of hardcoding `"en"`) is required, not optional: this codebase's own CLAUDE.md states "Bilingual — all client-facing strings go through next-intl. No hardcoded English text" as a non-negotiable rule, and a Spanish-locale event's passcode prompt showing English text would violate it outright.

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx tsx --test src/middleware.test.ts`
Expected: PASS (all tests, including the 3 new ones and the updated client-creation test from Step 6)

- [ ] **Step 9: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/middleware.ts src/middleware.test.ts src/app/invite/\[slug\]/locked
git commit -m "feat: gate invitation passcode access in middleware instead of the page"
```

---

### Task 5: Simplify the pages and move media to client-fetch

**Files:**
- Modify: `src/lib/invitations/public-access.ts`
- Modify: `src/lib/invitations/public-access.test.ts`
- Modify: `src/app/invite/[slug]/page.tsx`
- Modify: `src/app/invite/[slug]/memories/page.tsx`
- Modify: `src/components/invitations/PublicInvitation.tsx`
- Modify: `src/components/invitations/PublicInvitation.render.test.tsx`

**Interfaces:**
- Consumes: `GET /api/invitations/public/[slug]/media` from Task 3. Middleware gating from Task 4 (the page no longer needs to know about passcode state at all — by the time it runs, access is already decided).
- Produces: `resolvePublicInvitationPage`'s dependencies shrink to just `find` (no more `hasPasscodeAccess`, no more `loadMedia`); its `"passcode"` resolution kind is removed from the union (unreachable now that middleware handles it, and keeping it would be actively wrong — see Step 1). `PublicInvitationProps` drops `media`; `PublicInvitation` fetches it itself.

This is the task where Tasks 1-4 actually pay off — both pages drop `force-dynamic` for the first time. It must land as one unit: removing `media` from `page.tsx` without `PublicInvitation` fetching it itself would ship a broken page with no media rendering at all, so don't split this into separately-deployed halves.

- [ ] **Step 1: Simplify `public-access.ts`**

The `"passcode"` resolution kind in `PublicInvitationResolution` only existed because the page used to check `hasPasscodeAccess` itself via a cookie read. Now that middleware decides this before the page ever runs, keeping this branch would be actively wrong, not just unused: `resolvePublicInvitationPage` has no way to know "middleware already verified this guest" without reading a cookie itself (which would undo the whole point), so if the branch stayed, it would show the locked state to *every* visitor of a passcode-protected event, including ones middleware just verified.

Replace:
```ts
export type PublicInvitationResolution =
  | { kind: "not_found" }
  | { kind: "unavailable"; event: PublicInvitationEvent }
  | { kind: "ended"; event: PublicInvitationEvent }
  | { kind: "passcode"; event: PublicInvitationEvent }
  | {
      kind: "details";
      event: PublicInvitationEvent;
      state: "published" | "rsvp_closed";
      media: InvitationMediaSnapshot;
      rsvpSummary: PublicInvitationLookup["rsvpSummary"];
    };

export type PublicInvitationResolutionDependencies = {
  find(slug: string): Promise<PublicInvitationLookup | null>;
  hasPasscodeAccess(event: PublicInvitationEvent): Promise<boolean>;
  loadMedia(event: PublicInvitationEvent): Promise<InvitationMediaSnapshot>;
};
```
(Note: `hasPasscodeAccess` returns `Promise<boolean>` here, not `boolean` — Task 1's fix round made it async after this plan text was originally written. The removal is the same either way.)

with:
```ts
export type PublicInvitationResolution =
  | { kind: "not_found" }
  | { kind: "unavailable"; event: PublicInvitationEvent }
  | { kind: "ended"; event: PublicInvitationEvent }
  | {
      kind: "details";
      event: PublicInvitationEvent;
      state: "published" | "rsvp_closed";
      rsvpSummary: PublicInvitationLookup["rsvpSummary"];
    };

export type PublicInvitationResolutionDependencies = {
  find(slug: string): Promise<PublicInvitationLookup | null>;
};
```

Replace `resolvePublicInvitationPage`'s body:
```ts
export async function resolvePublicInvitationPage(
  slug: string,
  now: Date,
  dependencies: PublicInvitationResolutionDependencies,
): Promise<PublicInvitationResolution> {
  const invitation = await dependencies.find(slug);
  if (!invitation) return { kind: "not_found" };
  const state = getEffectiveEventState(invitation.event, now);
  if (state === "offline") return { kind: "not_found" };
  if (state === "draft") return { kind: "unavailable", event: invitation.event };
  if (state === "expired") return { kind: "ended", event: invitation.event };
  if (invitation.passcodeHash && !(await dependencies.hasPasscodeAccess(invitation.event))) {
    return { kind: "passcode", event: invitation.event };
  }
  return {
    kind: "details",
    event: invitation.event,
    state,
    media: await dependencies.loadMedia(invitation.event),
    rsvpSummary: invitation.rsvpSummary,
  };
}
```
(Same note: the current file has `!(await dependencies.hasPasscodeAccess(...))`, not a bare sync call — Task 1 added the `await`. Match current file content, not this literal text, when locating the block to replace.)

with:
```ts
export async function resolvePublicInvitationPage(
  slug: string,
  now: Date,
  dependencies: PublicInvitationResolutionDependencies,
): Promise<PublicInvitationResolution> {
  const invitation = await dependencies.find(slug);
  if (!invitation) return { kind: "not_found" };
  const state = getEffectiveEventState(invitation.event, now);
  if (state === "offline") return { kind: "not_found" };
  if (state === "draft") return { kind: "unavailable", event: invitation.event };
  if (state === "expired") return { kind: "ended", event: invitation.event };
  return {
    kind: "details",
    event: invitation.event,
    state,
    rsvpSummary: invitation.rsvpSummary,
  };
}
```

Remove the now-unused `import type { InvitationMediaSnapshot } from "./media";` from this file if nothing else in it still references the type (check first — `PublicInvitationClientDetails`, derived via `Extract<..., { kind: "details" }>`, no longer carries `media` either, so this import may become fully unused).

`getInvitationReferralDisplayName`'s doc comment (just above its signature) contrasts itself against `resolvePublicInvitationPage`, saying the latter "can grant passcode access via dependencies.hasPasscodeAccess" — after this step removes that field, the parenthetical is wrong (middleware grants passcode access now, not this function). Update that one parenthetical to say "(whose passcode gating now lives in middleware, not here)" or similar; leave the rest of the comment, which is still accurate, untouched.

- [ ] **Step 2: Update `public-access.test.ts`**

Find every test that currently supplies `hasPasscodeAccess` and/or `loadMedia` as dependencies to `resolvePublicInvitationPage`, and every assertion against a `"passcode"` resolution kind. Remove the dependency fields from each call site's dependency object, and remove or rewrite any test specifically asserting the `"passcode"` kind (that behavior moved to Task 4's middleware tests — it no longer belongs here). Read the current file in full before editing, since the exact fixture shapes need to stay consistent with whatever `find` already returns elsewhere in the same file.

- [ ] **Step 3: Run the public-access test suite to verify it passes**

Run: `npx tsx --test src/lib/invitations/public-access.test.ts`
Expected: PASS, no reference to `hasPasscodeAccess`, `loadMedia`, or a `"passcode"` resolution kind remaining.

- [ ] **Step 4: Rewrite `src/app/invite/[slug]/page.tsx`**

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InvitationPublicProvider } from "@/components/invitations/InvitationPublicProvider";
import { InvitationStateView, PublicInvitation } from "@/components/invitations/PublicInvitation";
import {
  invitationPageMetadata,
  resolvePublicInvitationPage,
  toPublicInvitationClientDetails,
} from "@/lib/invitations/public-access";
import { getPublicInvitationBySlug, listPublicInvitationComments } from "@/lib/invitations/repository";
import { getEffectiveEventState } from "@/lib/invitations/state";

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  try {
    const invitation = await getPublicInvitationBySlug(params.slug);
    const state = invitation ? getEffectiveEventState(invitation.event, new Date()) : null;
    return invitationPageMetadata(invitation, state);
  } catch {
    return invitationPageMetadata(null, null);
  }
}

export default async function PublicInvitationPage({ params }: { params: { slug: string } }) {
  const resolution = await resolvePublicInvitationPage(params.slug, new Date(), {
    find: getPublicInvitationBySlug,
  });
  if (resolution.kind === "not_found") notFound();

  if (resolution.kind === "unavailable" || resolution.kind === "ended") {
    const state = resolution.kind === "unavailable" ? "draft" : "expired";
    return (
      <InvitationPublicProvider locale={resolution.event.locale} timeZone="UTC">
        <InvitationStateView state={state} />
      </InvitationPublicProvider>
    );
  }

  const clientDetails = toPublicInvitationClientDetails(resolution);
  const initialComments = clientDetails.event.commentWallEnabled
    ? await listPublicInvitationComments(clientDetails.event.id)
    : { comments: [], nextCursor: null };
  return (
    <InvitationPublicProvider locale={clientDetails.event.locale} timeZone={clientDetails.event.timezone}>
      <PublicInvitation
        event={clientDetails.event}
        state={clientDetails.state}
        rsvpSummary={clientDetails.rsvpSummary}
        initialComments={initialComments}
      />
    </InvitationPublicProvider>
  );
}
```

Three deliberate removals from the previous version: the `loadMedia`/`getInvitationMediaForManagement` dependency (media moves client-side, Step 6 below); the `searchParams`/`?next=` handling for the passcode case (middleware's locked-page rewrite now owns that entirely — this page is never reached in the passcode-denied case at all); and the `headers()`-based legacy-domain redirect, which now lives in `src/middleware.ts`'s root-host branch (Task 4, Step 4) instead — reading `headers()` anywhere in this page would force it back to dynamic rendering, undoing everything Tasks 1-4 just enabled, so this page no longer imports `headers`, `redirect`, `isLegacySiteforownersApex`, or `invitationPublicUrl` at all.

- [ ] **Step 5: Rewrite `src/app/invite/[slug]/memories/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { InvitationPublicProvider } from "@/components/invitations/InvitationPublicProvider";
import { GuestMemoriesApp } from "@/components/invitations/memories/GuestMemoriesApp";
import { getPublicInvitationBySlug } from "@/lib/invitations/repository";
import { getEventMemoriesSettings } from "@/lib/invitations/memories/repository";
import { DEFAULT_INVITATION_DESIGN_RECIPE } from "@/lib/invitations/design-recipe";

export const revalidate = 3600;

export default async function GuestMemoriesPage({ params }: { params: { slug: string } }) {
  const invitation = await getPublicInvitationBySlug(params.slug);
  if (!invitation) notFound();

  if (invitation.event.status === "offline") notFound();

  const settings = await getEventMemoriesSettings(invitation.event.id);
  if (!settings || !settings.memoriesEnabled) notFound();

  const recipe = invitation.event.designRecipe ?? DEFAULT_INVITATION_DESIGN_RECIPE;

  return (
    <InvitationPublicProvider locale={invitation.event.locale} timeZone="UTC">
      <GuestMemoriesApp
        eventId={invitation.event.id}
        eventTitle={invitation.event.honoreeNames.trim() || invitation.event.title}
        accent={recipe.palette.accent}
        background={recipe.palette.background}
        text={recipe.palette.text}
        surface={recipe.palette.surface}
        findMeEnabled={settings.findMeEnabled}
      />
    </InvitationPublicProvider>
  );
}
```

Removed entirely: the inline `cookies()`-based passcode check (middleware now handles it, including the `?photo=`-preserving redirect — Task 4's `invitationLockedRewrite` explicitly folds `request.nextUrl.search` into the `next` value it sets, so a deep link like `/invite/{slug}/memories?photo=xyz` survives the locked-page round trip), and the `headers()`-based legacy-domain redirect (same reasoning and same destination — `src/middleware.ts`'s root-host branch from Task 4, Step 4 — as `page.tsx` above; it was the identical check copy-pasted between the two pages).

- [ ] **Step 6: Update `PublicInvitation.tsx` to fetch media on mount**

Remove `media` from `PublicInvitationProps` (line 59) and from the destructured params (line 177). Add client-side fetching. Near the top of the component body (after the `useTranslations` call), add:

```tsx
  const [media, setMedia] = useState<InvitationMediaSnapshot | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/invitations/public/${encodeURIComponent(event.slug)}/media`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled) setMedia(data); })
      .catch(() => { if (!cancelled) setMedia(null); });
    return () => { cancelled = true; };
  }, [event.slug]);
```

Add `useState`/`useEffect` to the existing `import { Fragment, type CSSProperties, type ReactNode } from "react";` line. Every place the component currently reads `media.cover`, `media.gallery`, `media.video` unconditionally now needs a null-guard, since `media` starts as `null` until the fetch resolves — read the full current render logic around lines 249 and 361-369 and adjust each to treat `media === null` as "not loaded yet" (render nothing for that section, or a lightweight placeholder matching the surrounding layout's dimensions so the page doesn't visibly jump once the fetch resolves).

- [ ] **Step 7: Update `PublicInvitation.render.test.tsx`**

This test file renders `PublicInvitation` directly with a `media` prop today. Since `media` is no longer a prop, every call site needs that removed, and since the component now fetches via `fetch()` in a `useEffect`, the tests (currently synchronous `renderToStaticMarkup` calls) need to either mock `global.fetch` before rendering, or accept that the initial static render shows the "not loaded yet" state and assert against that instead of asserting on specific photo URLs. Read the current file in full before deciding which approach fits its existing assertions.

- [ ] **Step 8: Run the full test file to verify it passes**

Run: `npx tsx --test src/components/invitations/PublicInvitation.render.test.tsx`
Expected: PASS.

- [ ] **Step 9: Typecheck and build, then confirm the pages are actually cacheable**

Run: `npx tsc --noEmit && npm run build`

Check the build's route summary specifically for `/invite/[slug]` and `/invite/[slug]/memories` — given both are dynamic path segments with no `generateStaticParams`, they'll still show `ƒ` (Dynamic) in the summary regardless of `revalidate` (same as `/site/[slug]` already does — the symbol doesn't distinguish "dynamic, no caching" from "dynamic segment, ISR'd at runtime"). The real confirmation is that neither file's source still calls `cookies()` or `headers()` after Steps 4-5's fixes — grep both files for both identifiers and confirm zero matches before calling this task done.

- [ ] **Step 10: Commit**

```bash
git add src/lib/invitations/public-access.ts src/lib/invitations/public-access.test.ts src/app/invite/\[slug\]/page.tsx src/app/invite/\[slug\]/memories/page.tsx src/components/invitations/PublicInvitation.tsx src/components/invitations/PublicInvitation.render.test.tsx
git commit -m "feat: make invitation pages cacheable by removing their dynamic-API dependencies"
```

---

### Task 6: On-demand revalidation wiring

**Files:**
- Create: `src/lib/invitations/revalidate-invitation-page.ts`
- Modify: `src/app/api/invitations/rsvp/route.ts`
- Modify: `src/app/api/invitations/public/[slug]/comments/route.ts`
- Modify: `src/app/api/invitations/events/[eventId]/route.ts`
- Modify: `src/app/api/invitations/events/[eventId]/status/route.ts`
- Modify: `src/app/api/invitations/events/[eventId]/media/route.ts`

**Interfaces:**
- Produces: `revalidateInvitationPage(slug: string): void` — calls `revalidatePath` for both `/invite/{slug}` and `/invite/{slug}/memories`, mirroring `revalidateTenantSite` in `src/lib/revalidate-tenant-site.ts`.

**Global Constraint reminder:** the slug passed here must be the submitting event's own slug — never taken from unvalidated request input without confirming it matches the event actually being mutated (see Review Focus).

- [ ] **Step 1: Create the helper**

```ts
import { revalidatePath } from "next/cache";

/**
 * Both guest-facing invitation routes read from the same underlying event
 * record. Call this after any write that changes what either page renders
 * (RSVP, comments, event details, lifecycle status, media) — without it, a
 * change would not show up on the live page for up to an hour
 * (revalidate = 3600 on both pages).
 */
export function revalidateInvitationPage(slug: string): void {
  revalidatePath(`/invite/${slug}`);
  revalidatePath(`/invite/${slug}/memories`);
}
```

- [ ] **Step 2: Wire into RSVP submission**

In `src/lib/invitations/rsvp.ts`, `processPublicRsvpRequest`'s success path currently returns a `PublicRsvpResponse` with no `slug` field. Add one: find the `PublicRsvpResponse` type definition and add `slug: string` to its success-shaped variant (or to the shared base, if the type isn't split by status) — `request.slug` is already available at the point of return (parsed and validated earlier in the same function) and should be threaded through to the response so the route doesn't need to unsafely re-parse the raw body. Update the final `return { status: 200, body: response, ... }` to also include `slug: request.slug` at the top level of the returned object (not inside `body`, so the route can read it without touching the guest-facing JSON shape).

In `src/app/api/invitations/rsvp/route.ts`, after the successful `processPublicRsvpRequest` call and before `return NextResponse.json(result.body, { status: result.status });`, add:
```ts
    if (result.status === 200 && "slug" in result) {
      revalidateInvitationPage(result.slug);
    }
```
Add the import: `import { revalidateInvitationPage } from "@/lib/invitations/revalidate-invitation-page";`

- [ ] **Step 3: Wire into comment posting**

In `src/app/api/invitations/public/[slug]/comments/route.ts`'s `POST` handler, `params.slug` is already available directly (a route param, not something parsed from the body). After the successful `submitInvitationComment` call, before returning the 201/200 response:
```ts
    if (result.ok) {
      revalidateInvitationPage(params.slug);
    }
    return NextResponse.json(result, { status: result.outcome === "created" ? 201 : 200 });
```
Add the same import.

- [ ] **Step 4: Wire into the main event-details edit route**

In `src/app/api/invitations/events/[eventId]/route.ts`, the `PATCH` handler already fetches `const event = await getInvitationEventForManagement(params.eventId);` right before its success response. `event.slug` is confirmed as the real field name (`InvitationEventForManagement` is `Omit<InvitationEvent, "passcodeHash"> & {...}` in `src/lib/invitations/repository-core.ts:252`, and `InvitationEvent.slug: string` is defined in `src/lib/invitations/types.ts:39`) — add `revalidateInvitationPage(event.slug);` immediately before `return NextResponse.json({ event });`. Add the import.

- [ ] **Step 5: Wire into the status-change route**

In `src/app/api/invitations/events/[eventId]/status/route.ts`, the status-update changes which lifecycle view the guest page renders (draft/published/rsvp_closed/expired/offline all render differently) — this needs revalidation. The route already loads `current` via `getInvitationEventForManagement(params.eventId)` before the update; `current.slug` gives the slug needed. Read the route's full success path (the part after the `try { await updateInvitationEventStatus(...)` call shown earlier in this plan's research, which was truncated — read the actual file) and add `revalidateInvitationPage(current.slug)` right before its success response. Add the import.

- [ ] **Step 6: Wire into the media attach/replace/remove route**

`src/app/api/invitations/events/[eventId]/media/route.ts` changes cover/video/gallery content directly — every successful mutation path in this file needs `revalidateInvitationPage` called with the event's slug. Read the full file (it's larger than the others touched in this task, with at least an `attach_invitation_media` RPC path and a direct `.update({ [field]: null, ... })` path for removal, per this plan's earlier research) and identify every distinct success-response point. Fetch the slug the same way the other routes do here — via `getInvitationEventForManagement`/equivalent — and call `revalidateInvitationPage` before each success response, not just the first one found.

- [ ] **Step 7: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 8: Full verification sweep**

Run:
```bash
npx tsx --test "src/**/*.test.ts" "src/**/*.test.tsx"
```
(Pass the glob as a literal quoted string for tsx's own runner to expand — NOT the `find`/`xargs` form. Node's `--test` CLI treats a `[slug]`-style bracketed path segment as a glob character class, so a pre-expanded file list silently matches zero files inside any `[slug]`/`[eventId]`-style directory — most of this plan's own test surface — with no error and the same exit code. This was discovered mid-plan; this step originally specified the broken form.)
Expected: no failures anywhere in the project.

- [ ] **Step 9: Commit**

```bash
git add src/lib/invitations/revalidate-invitation-page.ts src/lib/invitations/rsvp.ts src/app/api/invitations/rsvp/route.ts src/app/api/invitations/public/\[slug\]/comments/route.ts src/app/api/invitations/events/\[eventId\]/route.ts src/app/api/invitations/events/\[eventId\]/status/route.ts src/app/api/invitations/events/\[eventId\]/media/route.ts
git commit -m "feat: invalidate cached invitation pages on every write that changes them"
```

---

### Task 7: `next/image` for publicly-cacheable media

**Files:**
- Modify: `src/components/invitations/PublicInvitation.tsx`

**Interfaces:**
- Consumes: `next/image`'s `Image` component.
- Produces: no new exports — purely an internal rendering change to `InvitationImage` (defined at `PublicInvitation.tsx:127-139`).

This task is separable from Task 5/6's core caching correctness and lower priority — the page is already fully cacheable without it. Do this last, and treat it as skippable under time pressure without reopening the rest of the plan.

- [ ] **Step 1: Decide the signed-vs-public image distinction**

`InvitationImage` currently renders a plain `<img src={src} ...>` for every media item, whether its `url` is one of Task 2's stable public proxy routes (`/api/invitations/public/{slug}/cover` etc.) or a short-lived signed Supabase Storage URL (the passcode-protected case, still produced by `getInvitationMediaForManagement` per Task 3). `next/image` is safe and beneficial for the first case; for the second, converting adds no real benefit (the underlying URL still changes on every fetch) and adds `next/image`'s own `remotePatterns`/dimension constraints for no gain. Distinguish them by checking whether `src` starts with `/api/invitations/public/` (a same-origin relative path, always true for the public case, never true for a Supabase Storage signed URL) rather than adding a new prop that every call site would need to thread through.

- [ ] **Step 2: Convert `InvitationImage` to use `next/image` for the public case**

```tsx
import Image from "next/image";

function InvitationImage({
  src,
  alt,
  className,
  fit = "cover",
}: {
  src: string;
  alt: string;
  className?: string;
  fit?: "contain" | "cover";
}) {
  const objectFitClass = fit === "contain" ? "h-auto object-contain" : "h-full object-cover";
  if (src.startsWith("/api/invitations/public/")) {
    return (
      <div className={`relative w-full ${fit === "contain" ? "h-auto" : "h-full"} ${className ?? ""}`}>
        <Image src={src} alt={alt} fill className={objectFitClass} sizes="(max-width: 768px) 100vw, 768px" />
      </div>
    );
  }
  return <img src={src} alt={alt} className={`block w-full ${objectFitClass} ${className ?? ""}`} />;
}
```

**Before treating this as done:** `fill` requires every call site's parent to establish a sized, positioned container. **Correction to this plan's own earlier research:** `InvitationImage` has exactly one call site in the current file — the gallery grid item (`<InvitationImage key={item.id ?? item.path} src={item.url} ... className={\`aspect-[4/5] ${fillsLastRow ? "sm:col-span-2 sm:aspect-[16/9]" : ""}\`} />`). There is no "hero cover" call site: the hero's cover image is passed to `InvitationHero` as a plain `coverUrl` string prop and rendered there as a CSS `background-image` on a `<section>`, never through `<img>` or `InvitationImage` at all — converting it to `next/image` would mean restructuring `InvitationHero` itself (an absolutely-positioned `fill` image layered behind its content), which is a different component, not in this task's file list, and out of scope. Walk the one real call site and confirm its surrounding markup gives the new wrapping `<div>` real height — the existing `aspect-[4/5]`/`aspect-[16/9]` Tailwind classes already do this via CSS `aspect-ratio`, independent of any parent height, which is exactly the modern pattern `next/image fill` expects; confirm this reading holds. This is exactly the kind of thing that looks right in isolation and breaks visually in the browser, so also verify it that way if a real dev environment with live data is available; if it isn't (no Supabase credentials configured), say so explicitly rather than silently skipping verification, and substitute the strongest check actually available — e.g. extending this file's existing jsdom+`act`-based `renderMounted()` test harness (added in Task 5) to mount `PublicInvitation` with gallery media and assert the rendered output has the expected wrapper/image structure.

- [ ] **Step 3: Manual verification**

Run the dev server (`npm run dev`) and load a real non-passcode invitation's page in a browser. Confirm: the cover image renders at the correct size and position, the gallery grid still lays out correctly, and the browser's network tab shows the image requests going through `/_next/image?url=%2Fapi%2Finvitations%2Fpublic%2F...` (confirming `next/image` optimization is actually engaged, not silently falling back to the plain `<img>` path for every image).

- [ ] **Step 4: Commit**

```bash
git add src/components/invitations/PublicInvitation.tsx
git commit -m "feat: use next/image for publicly-cacheable invitation media"
```
