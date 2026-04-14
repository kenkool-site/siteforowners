import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const groupId = searchParams.get("group_id");

  if (!groupId) {
    return NextResponse.json({ error: "group_id required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("previews")
    .select("*")
    .eq("group_id", groupId)
    .order("variant_label", { ascending: true })
    .limit(1);

  if (error || !data || data.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const preview = data[0];
  const copy = preview.generated_copy as Record<string, unknown> | null;

  return NextResponse.json({
    business_name: preview.business_name,
    business_type: preview.business_type,
    phone: preview.phone || "",
    address: preview.address || "",
    description: "",
    services: preview.services || [],
    products: preview.products || [],
    booking_url: preview.booking_url || "",
    images: preview.images || [],
    hours: preview.hours || null,
    rating: preview.rating || null,
    review_count: preview.review_count || null,
    logo: copy?.logo || "",
    brand_colors: [],
    booking_categories: copy?.booking_categories || null,
    google_reviews: copy?.google_reviews || [],
    template_variant: preview.template_variant || "",
  });
}
