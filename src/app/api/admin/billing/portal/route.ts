import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";

export async function POST(request: NextRequest) {
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }
  const session = await requireOwnerSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const { data: tenant, error } = await supabase
    .from("tenants")
    .select("stripe_customer_id")
    .eq("id", session.tenant.id)
    .maybeSingle();
  if (error || !tenant?.stripe_customer_id) {
    return NextResponse.json({ error: "No Stripe customer" }, { status: 404 });
  }

  const host = request.headers.get("host") || "";
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const returnUrl = `${proto}://${host}/admin/billing`;

  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: tenant.stripe_customer_id,
      return_url: returnUrl,
    });
    return NextResponse.json({ url: portal.url });
  } catch (err) {
    console.error("[admin/billing/portal] stripe failed", { tenantId: session.tenant.id, err });
    return NextResponse.json({ error: "Could not open billing portal" }, { status: 500 });
  }
}
