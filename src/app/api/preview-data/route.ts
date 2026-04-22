import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const groupId = searchParams.get("group_id");
  const slug = searchParams.get("slug");

  if (!groupId && !slug) {
    return NextResponse.json({ error: "group_id or slug required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  let preview;
  if (slug) {
    // Direct slug lookup
    const { data, error } = await supabase
      .from("previews")
      .select("*")
      .eq("slug", slug)
      .single();
    if (error || !data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    preview = data;
  } else {
    // Group lookup — get first variant
    const { data, error } = await supabase
      .from("previews")
      .select("*")
      .eq("group_id", groupId!)
      .order("variant_label", { ascending: true })
      .limit(1);
    if (error || !data || data.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    preview = data[0];
  }

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
    imported_hours: preview.imported_hours || null,
    rating: preview.rating || null,
    review_count: preview.review_count || null,
    logo: copy?.logo || "",
    brand_colors: (copy?.brand_colors as string[]) || [],
    booking_categories: copy?.booking_categories || null,
    google_reviews: copy?.google_reviews || [],
    template_variant: preview.template_variant || "",
    color_theme: preview.color_theme || "",
    custom_colors: copy?.custom_colors || null,
  });
}
