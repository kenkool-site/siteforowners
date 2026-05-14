import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseCustomDomainForStorage } from "@/lib/normalize-custom-domain";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_CHECKOUT_MODES = new Set(["mockup", "pickup"]);
const ALLOWED_BOOKING_MODES = new Set(["in_site_only", "external_only", "both"]);

interface UpdatesBody {
  tenant_id?: unknown;
  updates?: {
    checkout_mode?: unknown;
    email?: unknown;
    booking_mode?: unknown;
    custom_domain?: unknown;
  };
}

export async function POST(request: NextRequest) {
  const sessionCookie = request.cookies.get("admin_session")?.value;
  if (!ADMIN_PASSWORD || sessionCookie !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: UpdatesBody;
  try {
    body = (await request.json()) as UpdatesBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tenantId = typeof body.tenant_id === "string" ? body.tenant_id.trim() : "";
  if (!tenantId) {
    return NextResponse.json({ error: "tenant_id required" }, { status: 400 });
  }
  const updates = body.updates || {};
  const allowed: Record<string, string | null> = {};

  if (updates.checkout_mode !== undefined) {
    if (typeof updates.checkout_mode !== "string" || !ALLOWED_CHECKOUT_MODES.has(updates.checkout_mode)) {
      return NextResponse.json({ error: "Invalid checkout_mode" }, { status: 400 });
    }
    allowed.checkout_mode = updates.checkout_mode;
  }

  if (updates.email !== undefined) {
    if (updates.email === null || updates.email === "") {
      allowed.email = null;
    } else if (typeof updates.email === "string" && EMAIL_RE.test(updates.email.trim())) {
      allowed.email = updates.email.trim();
    } else {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }
  }

  if (updates.booking_mode !== undefined) {
    if (typeof updates.booking_mode !== "string" || !ALLOWED_BOOKING_MODES.has(updates.booking_mode)) {
      return NextResponse.json({ error: "Invalid booking_mode" }, { status: 400 });
    }
    allowed.booking_mode = updates.booking_mode;
  }

  if (updates.custom_domain !== undefined) {
    const parsed = parseCustomDomainForStorage(updates.custom_domain);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    allowed.custom_domain = parsed.value;
  }

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: "No valid updates provided" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // If caller is setting checkout_mode='pickup', verify the resulting row has an email.
  if (allowed.checkout_mode === "pickup") {
    const resultingEmail =
      "email" in allowed
        ? allowed.email
        : (
            await supabase
              .from("tenants")
              .select("email")
              .eq("id", tenantId)
              .maybeSingle()
          ).data?.email ?? null;
    if (!resultingEmail) {
      return NextResponse.json(
        { error: "Notification email required for pickup mode" },
        { status: 400 }
      );
    }
  }

  const { error: updateError } = await supabase
    .from("tenants")
    .update({ ...allowed, updated_at: new Date().toISOString() })
    .eq("id", tenantId);
  if (updateError) {
    console.error("update-tenant failed:", updateError);
    const msg = String(updateError.message || "");
    const code = (updateError as { code?: string }).code;
    if (code === "23505" || msg.includes("unique") || msg.includes("duplicate")) {
      return NextResponse.json(
        { error: "That domain is already linked to another site." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
