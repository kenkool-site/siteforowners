import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_CHECKOUT_MODES = new Set(["mockup", "pickup"]);

interface UpdatesBody {
  tenant_id?: unknown;
  updates?: {
    checkout_mode?: unknown;
    email?: unknown;
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
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
