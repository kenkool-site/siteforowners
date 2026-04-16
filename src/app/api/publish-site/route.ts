import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

function generateSubdomain(businessName: string): string {
  return businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export async function POST(request: Request) {
  try {
    const { tenant_id, subdomain: customSubdomain } = await request.json();

    if (!tenant_id) {
      return NextResponse.json({ error: "tenant_id required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Get tenant
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("*")
      .eq("id", tenant_id)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    if (tenant.subscription_status !== "active") {
      return NextResponse.json(
        { error: "Subscription must be active to publish" },
        { status: 400 }
      );
    }

    // Determine subdomain
    let subdomain = customSubdomain || tenant.subdomain || generateSubdomain(tenant.business_name);

    // Check uniqueness
    const { data: existing } = await supabase
      .from("tenants")
      .select("id")
      .eq("subdomain", subdomain)
      .neq("id", tenant_id)
      .single();

    if (existing) {
      // Append random suffix
      subdomain = `${subdomain}-${Math.random().toString(36).slice(2, 6)}`;
    }

    // Update tenant
    const { error: updateError } = await supabase
      .from("tenants")
      .update({
        subdomain,
        site_published: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tenant_id);

    if (updateError) {
      console.error("Publish error:", updateError);
      return NextResponse.json({ error: "Failed to publish" }, { status: 500 });
    }

    const siteUrl = `https://${subdomain}.siteforowners.com`;

    return NextResponse.json({
      success: true,
      subdomain,
      url: siteUrl,
    });
  } catch (error) {
    console.error("Publish error:", error);
    return NextResponse.json({ error: "Failed to publish site" }, { status: 500 });
  }
}
