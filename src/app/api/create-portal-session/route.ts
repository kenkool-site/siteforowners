import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://siteforowners.com";

export async function POST(request: NextRequest) {
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }

  const sessionCookie = request.cookies.get("admin_session")?.value;
  if (!ADMIN_PASSWORD || sessionCookie !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { tenant_id, return_url } = await request.json();

    if (!tenant_id) {
      return NextResponse.json({ error: "tenant_id required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: tenant, error } = await supabase
      .from("tenants")
      .select("stripe_customer_id")
      .eq("id", tenant_id)
      .single();

    if (error || !tenant?.stripe_customer_id) {
      return NextResponse.json(
        { error: "Tenant has no Stripe customer" },
        { status: 404 }
      );
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: tenant.stripe_customer_id,
      return_url: return_url || `${APP_URL}/clients`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Portal session error:", err);
    return NextResponse.json(
      { error: "Failed to create portal session" },
      { status: 500 }
    );
  }
}
