# Owner Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one mobile-first owner Profile page that edits existing Site Editor business/profile fields, securely changes the dashboard PIN, and removes duplicate owner controls.

**Architecture:** Keep existing records canonical: public business fields and bilingual copy stay on `previews`, private owner email and mirrored business contact fields stay on `tenants`, and PIN hashing stays in the current PIN endpoint. A pure `owner-profile` module owns validation, normalization, and generated-copy merging; authenticated API routes own tenant-scoped persistence and portrait upload; the Profile page composes the form and existing PIN component.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript strict, Tailwind CSS, Supabase PostgreSQL/Storage, Node test runner through `tsx`.

---

## File Map

- Create `src/lib/owner-profile.ts`: profile types, limits, validation, paragraph conversion, and generated-copy merge.
- Create `src/lib/owner-profile.test.ts`: focused unit tests for validation and preservation behavior.
- Create `src/app/api/admin/profile/route.ts`: owner-authenticated profile load/save.
- Create `src/app/api/admin/profile/upload-photo/route.ts`: owner-authenticated portrait upload.
- Create `src/app/site/[slug]/admin/profile/page.tsx`: server page that loads initial profile data.
- Create `src/app/site/[slug]/admin/profile/ProfileClient.tsx`: mobile-first editable Profile UI.
- Create `src/lib/admin-navigation.ts`: testable owner-admin destination builder.
- Create `src/lib/admin-navigation.test.ts`: navigation regression tests.
- Modify `src/app/site/[slug]/admin/_components/AdminShell.tsx`: consume navigation helper.
- Modify `src/lib/admin-nav-icons.ts`: add Profile icon mapping.
- Modify `src/lib/admin-nav-icons.test.ts`: cover Profile icon.
- Modify `src/app/site/[slug]/admin/photos/page.tsx`: stop loading About portrait.
- Modify `src/app/site/[slug]/admin/photos/PhotosClient.tsx`: gallery/video only; link back to Profile.
- Modify `src/app/site/[slug]/admin/settings/page.tsx`: remove duplicate PIN/account controls and redirect to Profile.
- Modify `src/lib/admin-auth.ts`: expose tenant phone in authenticated tenant data.

### Task 1: Profile Domain Validation and Merge

**Files:**
- Create: `src/lib/owner-profile.ts`
- Create: `src/lib/owner-profile.test.ts`

- [ ] **Step 1: Write failing validation and merge tests**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mergeOwnerProfileCopy,
  parseOwnerProfileInput,
  paragraphsToText,
  type OwnerProfileInput,
} from "./owner-profile";

const validInput: OwnerProfileInput = {
  business_name: " Bella Studio ",
  phone: " (718) 555-0100 ",
  tagline: " Personal beauty, beautifully done. ",
  admin_email: " OWNER@EXAMPLE.COM ",
  about_en: "First English paragraph.\n\nSecond English paragraph.",
  about_es: "Primer párrafo.\n\nSegundo párrafo.",
  about_image_url: "https://cdn.example.com/owner.webp",
  instagram: "@bellastudio",
  facebook: "bellastudionyc",
  tiktok: "@bellastudio",
};

test("parseOwnerProfileInput normalizes every editable field", () => {
  const result = parseOwnerProfileInput(validInput);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.business_name, "Bella Studio");
  assert.equal(result.value.phone, "(718) 555-0100");
  assert.equal(result.value.tagline, "Personal beauty, beautifully done.");
  assert.equal(result.value.admin_email, "owner@example.com");
  assert.deepEqual(result.value.about_en, [
    "First English paragraph.",
    "Second English paragraph.",
  ]);
  assert.deepEqual(result.value.about_es, ["Primer párrafo.", "Segundo párrafo."]);
  assert.equal(result.value.social_links?.instagram, "https://www.instagram.com/bellastudio");
});

test("parseOwnerProfileInput rejects missing business name and invalid email", () => {
  const result = parseOwnerProfileInput({
    ...validInput,
    business_name: " ",
    admin_email: "not-an-email",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(
    result.errors.map((error) => error.field),
    ["business_name", "admin_email"],
  );
});

test("mergeOwnerProfileCopy preserves unrelated copy and section settings", () => {
  const parsed = parseOwnerProfileInput(validInput);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const merged = mergeOwnerProfileCopy(
    {
      en: { hero_headline: "Welcome", footer_tagline: "Footer" },
      es: { hero_headline: "Bienvenidos", footer_tagline: "Pie" },
      section_settings: { show_about: false, template_override: "runway" },
      custom_colors: { primary: "#000000" },
    },
    parsed.value,
  );
  assert.deepEqual((merged.en as Record<string, unknown>).about_paragraphs, parsed.value.about_en);
  assert.equal((merged.en as Record<string, unknown>).hero_subheadline, parsed.value.tagline);
  assert.equal((merged.en as Record<string, unknown>).hero_headline, "Welcome");
  assert.deepEqual((merged.es as Record<string, unknown>).about_paragraphs, parsed.value.about_es);
  assert.equal((merged.es as Record<string, unknown>).hero_headline, "Bienvenidos");
  assert.equal((merged.section_settings as Record<string, unknown>).show_about, false);
  assert.equal(
    (merged.section_settings as Record<string, unknown>).about_image_url,
    parsed.value.about_image_url,
  );
  assert.deepEqual(merged.custom_colors, { primary: "#000000" });
});

test("paragraphsToText joins stored paragraphs with blank lines", () => {
  assert.equal(paragraphsToText(["One.", "Two."]), "One.\n\nTwo.");
  assert.equal(paragraphsToText(undefined), "");
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npx tsx --test src/lib/owner-profile.test.ts
```

Expected: FAIL because `src/lib/owner-profile.ts` does not exist.

- [ ] **Step 3: Implement profile types, limits, parsing, and merging**

```ts
import { buildSocialLinksPayload, type SocialLinks } from "./social-links";

export const OWNER_PROFILE_LIMITS = {
  businessName: 120,
  phone: 40,
  tagline: 220,
  aboutCharacters: 3000,
  aboutParagraphs: 8,
} as const;

export type OwnerProfileInput = {
  business_name?: unknown;
  phone?: unknown;
  tagline?: unknown;
  admin_email?: unknown;
  about_en?: unknown;
  about_es?: unknown;
  about_image_url?: unknown;
  instagram?: unknown;
  facebook?: unknown;
  tiktok?: unknown;
};

export type OwnerProfileValue = {
  business_name: string;
  phone: string | null;
  tagline: string;
  admin_email: string | null;
  about_en: string[];
  about_es: string[];
  about_image_url: string | null;
  social_links: SocialLinks | null;
};

export type OwnerProfileError = { field: string; reason: string };
export type OwnerProfileResult =
  | { ok: true; value: OwnerProfileValue }
  | { ok: false; errors: OwnerProfileError[] };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseParagraphs(value: unknown, field: string, errors: OwnerProfileError[]): string[] {
  const text = trimmed(value);
  if (text.length > OWNER_PROFILE_LIMITS.aboutCharacters) {
    errors.push({ field, reason: `max ${OWNER_PROFILE_LIMITS.aboutCharacters} characters` });
  }
  const paragraphs = text.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
  if (paragraphs.length > OWNER_PROFILE_LIMITS.aboutParagraphs) {
    errors.push({ field, reason: `max ${OWNER_PROFILE_LIMITS.aboutParagraphs} paragraphs` });
  }
  return paragraphs;
}

export function paragraphsToText(value: unknown): string {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").join("\n\n")
    : "";
}

export function parseOwnerProfileInput(input: OwnerProfileInput): OwnerProfileResult {
  const errors: OwnerProfileError[] = [];
  const businessName = trimmed(input.business_name);
  const phone = trimmed(input.phone);
  const tagline = trimmed(input.tagline);
  const email = trimmed(input.admin_email).toLowerCase();
  const image = trimmed(input.about_image_url);

  if (!businessName) errors.push({ field: "business_name", reason: "required" });
  if (businessName.length > OWNER_PROFILE_LIMITS.businessName) {
    errors.push({ field: "business_name", reason: `max ${OWNER_PROFILE_LIMITS.businessName} characters` });
  }
  if (phone.length > OWNER_PROFILE_LIMITS.phone) {
    errors.push({ field: "phone", reason: `max ${OWNER_PROFILE_LIMITS.phone} characters` });
  }
  if (tagline.length > OWNER_PROFILE_LIMITS.tagline) {
    errors.push({ field: "tagline", reason: `max ${OWNER_PROFILE_LIMITS.tagline} characters` });
  }
  if (email && !EMAIL_RE.test(email)) errors.push({ field: "admin_email", reason: "invalid email" });
  if (image && !/^https:\/\//.test(image)) {
    errors.push({ field: "about_image_url", reason: "must be an https URL" });
  }

  const aboutEn = parseParagraphs(input.about_en, "about_en", errors);
  const aboutEs = parseParagraphs(input.about_es, "about_es", errors);
  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      business_name: businessName,
      phone: phone || null,
      tagline,
      admin_email: email || null,
      about_en: aboutEn,
      about_es: aboutEs,
      about_image_url: image || null,
      social_links: buildSocialLinksPayload(input),
    },
  };
}

export function mergeOwnerProfileCopy(
  currentCopy: Record<string, unknown>,
  value: OwnerProfileValue,
): Record<string, unknown> {
  const currentEn = (currentCopy.en as Record<string, unknown> | undefined) ?? {};
  const currentEs = (currentCopy.es as Record<string, unknown> | undefined) ?? {};
  const currentSettings =
    (currentCopy.section_settings as Record<string, unknown> | undefined) ?? {};
  return {
    ...currentCopy,
    en: {
      ...currentEn,
      hero_subheadline: value.tagline,
      about_paragraphs: value.about_en,
    },
    es: {
      ...currentEs,
      about_paragraphs: value.about_es,
    },
    section_settings: {
      ...currentSettings,
      about_image_url: value.about_image_url,
    },
    social_links: value.social_links,
  };
}
```

- [ ] **Step 4: Run profile helper tests**

Run:

```bash
npx tsx --test src/lib/owner-profile.test.ts src/lib/social-links.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit domain helper**

```bash
git add src/lib/owner-profile.ts src/lib/owner-profile.test.ts
git commit -m "feat: add owner profile validation"
```

### Task 2: Authenticated Profile Persistence

**Files:**
- Create: `src/app/api/admin/profile/route.ts`
- Modify: `src/lib/admin-auth.ts`
- Modify: `src/lib/admin-tenant.ts`

- [ ] **Step 1: Extend authenticated tenant data with phone**

Add `phone: string | null` to `AdminTenant`, and add `phone` to all tenant select lists in `src/lib/admin-auth.ts` and `src/lib/admin-tenant.ts`.

```ts
export type AdminTenant = {
  id: string;
  business_name: string;
  owner_name: string;
  phone: string | null;
  preview_slug: string | null;
  // existing fields remain unchanged
};
```

- [ ] **Step 2: Implement GET with owner-session tenant scoping**

```ts
export async function GET(request: NextRequest) {
  const session = await requireOwnerSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.tenant.preview_slug) {
    return NextResponse.json({ error: "Website profile unavailable" }, { status: 404 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("previews")
    .select("business_name, phone, generated_copy")
    .eq("slug", session.tenant.preview_slug)
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "Website profile unavailable" }, { status: 404 });
  }

  const copy = (data.generated_copy as Record<string, unknown> | null) ?? {};
  const en = (copy.en as Record<string, unknown> | undefined) ?? {};
  const es = (copy.es as Record<string, unknown> | undefined) ?? {};
  const settings = (copy.section_settings as Record<string, unknown> | undefined) ?? {};
  const socials = (copy.social_links as Record<string, unknown> | undefined) ?? {};

  return NextResponse.json({
    business_name: data.business_name,
    phone: data.phone ?? session.tenant.phone ?? "",
    tagline: typeof en.hero_subheadline === "string" ? en.hero_subheadline : "",
    admin_email: session.tenant.admin_email ?? "",
    about_en: paragraphsToText(en.about_paragraphs),
    about_es: paragraphsToText(es.about_paragraphs),
    about_image_url:
      typeof settings.about_image_url === "string" ? settings.about_image_url : null,
    instagram: socialLinkToDisplayValue(socials.instagram, "instagram"),
    facebook: socialLinkToDisplayValue(socials.facebook, "facebook"),
    tiktok: socialLinkToDisplayValue(socials.tiktok, "tiktok"),
  });
}
```

- [ ] **Step 3: Implement POST validation and preview update**

Parse JSON, call `requireOwnerSession`, call `parseOwnerProfileInput`, load the current `generated_copy`, and update only the authenticated tenant's linked preview:

```ts
const nextCopy = mergeOwnerProfileCopy(currentCopy, parsed.value);
const { error: previewError } = await supabase
  .from("previews")
  .update({
    business_name: parsed.value.business_name,
    phone: parsed.value.phone,
    generated_copy: nextCopy,
  })
  .eq("slug", session.tenant.preview_slug);
```

Return `400` with `{ error: "Validation failed", errors }` when parsing fails and `401` without a valid owner session.

- [ ] **Step 4: Mirror tenant business fields and private email with rollback**

After the preview update succeeds, update the authenticated tenant only:

```ts
const { error: tenantError } = await supabase
  .from("tenants")
  .update({
    business_name: parsed.value.business_name,
    phone: parsed.value.phone,
    sms_phone: parsed.value.phone,
    admin_email: parsed.value.admin_email,
    updated_at: new Date().toISOString(),
  })
  .eq("id", session.tenant.id);
```

If the tenant update fails, log the tenant ID and return `500` without reporting success. Never accept `tenant_id` or `slug` from the request body.

Before updating the preview, retain its current `business_name`, `phone`, and `generated_copy`. If the tenant update fails, restore those three preview values before returning the error:

```ts
if (tenantError) {
  const { error: rollbackError } = await supabase
    .from("previews")
    .update({
      business_name: current.business_name,
      phone: current.phone,
      generated_copy: current.generated_copy,
    })
    .eq("slug", session.tenant.preview_slug);
  console.error("[admin/profile] tenant update failed", {
    tenantId: session.tenant.id,
    tenantError,
    rollbackError,
  });
  return NextResponse.json({ error: "Could not save profile" }, { status: 500 });
}
```

This is compensating rollback for the two-table update. It prevents a reported failed save from leaving public preview data changed.

- [ ] **Step 5: Return normalized saved profile**

Return the canonical value so the client can replace its persisted snapshot:

```ts
return NextResponse.json({
  ok: true,
  profile: {
    ...parsed.value,
    about_en: paragraphsToText(parsed.value.about_en),
    about_es: paragraphsToText(parsed.value.about_es),
    instagram: socialLinkToDisplayValue(parsed.value.social_links?.instagram, "instagram"),
    facebook: socialLinkToDisplayValue(parsed.value.social_links?.facebook, "facebook"),
    tiktok: socialLinkToDisplayValue(parsed.value.social_links?.tiktok, "tiktok"),
  },
});
```

- [ ] **Step 6: Run type checking**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit persistence route**

```bash
git add src/app/api/admin/profile/route.ts src/lib/admin-auth.ts src/lib/admin-tenant.ts
git commit -m "feat: add owner profile api"
```

### Task 3: Secure Portrait Upload

**Files:**
- Create: `src/app/api/admin/profile/upload-photo/route.ts`

- [ ] **Step 1: Implement authenticated file validation**

Use the same owner-session pattern and limits as service image upload:

```ts
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function POST(request: NextRequest) {
  const session = await requireOwnerSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "image file required" }, { status: 400 });
  }
  const extension = EXTENSIONS[file.type];
  if (!extension) {
    return NextResponse.json({ error: "Use JPG, PNG, or WebP." }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File exceeds 5MB limit" }, { status: 400 });
  }
```

- [ ] **Step 2: Store portrait in a tenant-scoped path**

```ts
const path = `tenants/${session.tenant.id}/profile/${crypto.randomUUID()}.${extension}`;
const buffer = Buffer.from(await file.arrayBuffer());
const supabase = createAdminClient();
const { error } = await supabase.storage
  .from("preview-images")
  .upload(path, buffer, { contentType: file.type, upsert: false });
if (error) {
  console.error("[admin/profile/upload-photo] upload failed", {
    tenantId: session.tenant.id,
    error,
  });
  return NextResponse.json({ error: "Upload failed" }, { status: 500 });
}
const { data } = supabase.storage.from("preview-images").getPublicUrl(path);
return NextResponse.json({ url: data.publicUrl });
```

- [ ] **Step 3: Run type checking**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit portrait upload**

```bash
git add src/app/api/admin/profile/upload-photo/route.ts
git commit -m "feat: secure owner portrait uploads"
```

### Task 4: Profile Page and Mobile-First Form

**Files:**
- Create: `src/app/site/[slug]/admin/profile/page.tsx`
- Create: `src/app/site/[slug]/admin/profile/ProfileClient.tsx`
- Modify: `src/app/site/[slug]/admin/_components/ChangePinForm.tsx`

- [ ] **Step 1: Create the server page**

Load the tenant by route slug, load its preview fields, convert paragraphs/social URLs for editing, and pass a typed initial snapshot to `ProfileClient`. Do not expose `tenants.email`; pass only `tenant.admin_email`. Keep this loader in `page.tsx` and use the pure conversion helpers from `src/lib/owner-profile.ts`.

```tsx
export default async function ProfilePage({ params }: { params: { slug: string } }) {
  const tenant = await loadTenantBySlug(params.slug);
  if (!tenant) notFound();
  const profile = await loadOwnerProfile(tenant);
  return (
    <div className="mx-auto max-w-2xl px-4 py-5 md:px-8 md:py-8">
      <ProfileClient initialProfile={profile} />
    </div>
  );
}
```

- [ ] **Step 2: Build ProfileClient state and dirty tracking**

Define a flat editable snapshot:

```ts
export type EditableOwnerProfile = {
  business_name: string;
  phone: string;
  tagline: string;
  admin_email: string;
  about_en: string;
  about_es: string;
  about_image_url: string | null;
  instagram: string;
  facebook: string;
  tiktok: string;
};
```

Use `persistedProfile` and `profile` state; compute dirty state with `JSON.stringify(profile) !== JSON.stringify(persistedProfile)`.

- [ ] **Step 3: Build the approved card order**

Render:

1. Header: `Profile` and `Manage your public business details and private account email.`
2. Business card: business name, phone, tagline, private owner email.
3. Personal photo card: current portrait, Upload/Replace, Clear, and `Used in your About Us section`.
4. About Me card: visible English and Spanish textareas with character counters.
5. Social Media card: Instagram, Facebook, TikTok.
6. Sticky `Save profile` action.
7. Security card containing `ChangePinForm`.
8. Account card containing `SignOutButton`.
9. Gallery link: `Manage gallery photos` to `/admin/photos`.

Use the existing warm owner-admin classes: rounded `1.5rem` white cards, `warm-*` text/background tokens, and `pop-pink` primary actions.

- [ ] **Step 4: Wire authenticated portrait upload**

```ts
const formData = new FormData();
formData.append("image", file);
const response = await fetch("/api/admin/profile/upload-photo", {
  method: "POST",
  body: formData,
});
const body = (await response.json()) as { url?: string; error?: string };
if (!response.ok || !body.url) throw new Error(body.error || "Upload failed");
setProfile((current) => ({ ...current, about_image_url: body.url! }));
```

Upload changes only local form state. The portrait becomes the public About image after `Save profile`.

- [ ] **Step 5: Wire profile save**

```ts
const response = await fetch("/api/admin/profile", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(profile),
});
const body = await response.json();
if (!response.ok) {
  throw new Error(body.error || "Could not save profile");
}
setProfile(body.profile);
setPersistedProfile(body.profile);
```

Keep field values when validation or network errors occur. Show `Saved.` only after the persisted snapshot is updated.

- [ ] **Step 6: Align PIN copy and validation**

Keep `ChangePinForm` behavior, but clear its success message when any PIN field changes. Make the client and endpoint agree on exactly six digits by changing the API regex from `^\d{4,8}$` to `^\d{6}$`.

- [ ] **Step 7: Run focused tests and type checking**

Run:

```bash
npx tsx --test src/lib/owner-profile.test.ts src/lib/admin-auth.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 8: Commit Profile UI**

```bash
git add src/app/site/[slug]/admin/profile src/app/site/[slug]/admin/_components/ChangePinForm.tsx src/app/api/admin/pin/change/route.ts
git commit -m "feat: add owner profile page"
```

### Task 5: Navigation and Duplicate-Control Cleanup

**Files:**
- Create: `src/lib/admin-navigation.ts`
- Create: `src/lib/admin-navigation.test.ts`
- Modify: `src/app/site/[slug]/admin/_components/AdminShell.tsx`
- Modify: `src/lib/admin-nav-icons.ts`
- Modify: `src/lib/admin-nav-icons.test.ts`
- Modify: `src/app/site/[slug]/admin/photos/page.tsx`
- Modify: `src/app/site/[slug]/admin/photos/PhotosClient.tsx`
- Modify: `src/app/site/[slug]/admin/settings/page.tsx`
- Keep: `src/app/site/[slug]/admin/_components/AboutImagePicker.tsx` for founder Site Editor usage

- [ ] **Step 1: Write failing navigation tests**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAdminTabs } from "./admin-navigation";

test("owner navigation includes Profile and excludes duplicate Settings", () => {
  const labels = buildAdminTabs({
    business_name: "Bella Studio",
    booking_tool: "internal",
    checkout_mode: "mockup",
  }).map((tab) => tab.label);
  assert.ok(labels.includes("Profile"));
  assert.equal(labels.includes("Settings"), false);
});

test("Photos is not a primary owner navigation destination", () => {
  const labels = buildAdminTabs({
    business_name: "Bella Studio",
    booking_tool: "internal",
    checkout_mode: "mockup",
  }).map((tab) => tab.label);
  assert.equal(labels.includes("Photos"), false);
});

test("Profile remains a desktop destination", () => {
  const profile = buildAdminTabs({
    business_name: "Bella Studio",
    booking_tool: "internal",
    checkout_mode: "mockup",
  }).find((tab) => tab.label === "Profile");
  assert.equal(profile?.href, "/admin/profile");
});
```

- [ ] **Step 2: Run navigation test and verify RED**

Run:

```bash
npx tsx --test src/lib/admin-navigation.test.ts
```

Expected: FAIL because `buildAdminTabs` does not exist.

- [ ] **Step 3: Extract and update the tab builder**

Move `Tab`, `ShellTenant`, and `buildTabs` behavior into `src/lib/admin-navigation.ts` as `buildAdminTabs`. Preserve conditional Schedule, Services, and Orders behavior. Add:

```ts
tabs.push({
  href: "/admin/profile",
  label: "Profile",
  icon: getAdminNavIconName("Profile"),
});
```

Do not add Photos or Settings. Import `buildAdminTabs` and `ShellTenant` into `AdminShell`.

- [ ] **Step 4: Add a Profile icon and visible mobile header entry**

Add a `user` SVG path set to `ADMIN_NAV_ICON_PATHS`, map `"Profile"` to `"user"`, and update `admin-nav-icons.test.ts`:

```ts
assert.equal(getAdminNavIconName("Profile"), "user");
assert.ok(ADMIN_NAV_ICON_PATHS.user.length > 0);
```

In `AdminShell`, keep Profile in the desktop sidebar but exclude it from the mobile `More` list. Replace the mobile envelope/Leads and Sign Out controls with a labeled Profile link:

```tsx
<Link
  href="/admin/profile"
  className="flex items-center gap-1.5 rounded-full border border-pop-pink/30 bg-white p-1 pr-2.5 text-[11px] font-black text-pink-700 shadow-sm"
>
  <span className="grid h-8 w-8 place-items-center overflow-hidden rounded-full bg-pop-pink text-pop-cream">
    <AdminNavGlyph name="user" className="h-4 w-4" />
  </span>
  Profile
</Link>
```

When the tenant has an About portrait URL available in the shell data, render it inside the circle; otherwise use the user glyph. Remove `LeadsBadge` and `SignOutButton` from the mobile header only. Keep Leads in the mobile `More` menu and preserve the desktop Leads badge/sign-out controls.

- [ ] **Step 5: Remove About portrait from Photos**

Change the Photos page/client contract to:

```ts
type PhotosClientProps = {
  initialImages: string[];
  initialGalleryVideoUrl: string | null;
  initialGalleryVideoTitle: string | null;
};
```

Remove `aboutImageUrl` state, `about_image_url` from `/api/admin/images` save payloads, and `AboutImagePicker`. Change the description to `Manage your gallery photos and video.` Add a small link to `/admin/profile` labeled `Change About Us photo in Profile`.

- [ ] **Step 6: Redirect Settings to Profile**

Replace the Settings page body with:

```ts
import { redirect } from "next/navigation";

export default function SettingsPage() {
  redirect("/admin/profile");
}
```

This preserves old bookmarks without leaving duplicate PIN or email controls.

- [ ] **Step 7: Confirm AboutImagePicker remains founder-only**

Run:

```bash
rg -n "AboutImagePicker" src
```

Expected: imports/usages remain in `src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx` and the component definition, with no owner Photos import.

- [ ] **Step 8: Run navigation and type tests**

Run:

```bash
npx tsx --test src/lib/admin-navigation.test.ts src/lib/admin-nav-icons.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 9: Commit navigation cleanup**

```bash
git add src/lib/admin-navigation.ts src/lib/admin-navigation.test.ts src/lib/admin-nav-icons.ts src/lib/admin-nav-icons.test.ts src/app/site/[slug]/admin/_components/AdminShell.tsx src/app/site/[slug]/admin/photos src/app/site/[slug]/admin/settings/page.tsx
git commit -m "refactor: centralize owner profile controls"
```

### Task 6: Full Verification and Mobile Browser Check

**Files:**
- Verify all files changed in Tasks 1-5.

- [ ] **Step 1: Run all Node tests**

Run:

```bash
npx tsx --test $(rg --files src -g '*.test.ts')
```

Expected: all tests PASS.

- [ ] **Step 2: Run strict TypeScript checking**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Run whitespace validation**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 4: Start the development server**

Run:

```bash
npm run dev
```

Expected: Next.js reports a local URL without compilation errors.

- [ ] **Step 5: Verify Profile at 375px**

Using the in-app Browser:

1. Open the tenant owner admin Profile route.
2. Set viewport width to 375px.
3. Confirm card order matches the approved mockup.
4. Confirm the labeled Profile avatar remains visible beside `View site`.
5. Confirm the mobile header no longer shows the envelope or Sign Out controls.
6. Confirm Leads remains reachable under `More`.
7. Confirm all fields fit without horizontal scrolling.
8. Upload a valid portrait and confirm it previews before save.
9. Save business name, phone, tagline, private email, both About languages, and social handles.
10. Reload and confirm every value persists.
11. Open the public site and confirm business name, phone, tagline, About text, About portrait, and social links update.
12. Confirm private owner email does not appear publicly.
13. Change PIN and log in with the new six-digit PIN.
14. Sign out from Profile and confirm the session ends.
15. Open `/admin/settings` and confirm it redirects to `/admin/profile`.
16. Open `/admin/photos` and confirm only gallery/video controls remain.

- [ ] **Step 6: Verify desktop responsiveness**

At a desktop viewport, confirm the same single-column hierarchy remains centered and readable, with no unexpected two-column reordering.

- [ ] **Step 7: Review final diff**

Run:

```bash
git status --short
git diff --stat
git diff
```

Expected: only owner Profile, navigation, portrait upload, PIN consistency, and duplicate-control cleanup changes are present.

- [ ] **Step 8: Commit final verified implementation**

```bash
git add src docs/superpowers/specs/2026-06-11-owner-profile-design.md docs/superpowers/plans/2026-06-11-owner-profile.md
git commit -m "feat: add owner profile management"
```
