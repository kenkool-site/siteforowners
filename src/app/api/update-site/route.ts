import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const { slug, updates } = await request.json();

    if (!slug || !updates) {
      return NextResponse.json({ error: "slug and updates required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Get current preview
    const { data: current, error: fetchError } = await supabase
      .from("previews")
      .select("*")
      .eq("slug", slug)
      .single();

    if (fetchError || !current) {
      return NextResponse.json({ error: "Preview not found" }, { status: 404 });
    }

    // Build the update object — only allow specific fields
    const allowed: Record<string, unknown> = {};

    if (updates.business_name !== undefined) allowed.business_name = updates.business_name;
    if (updates.phone !== undefined) allowed.phone = updates.phone;
    if (updates.address !== undefined) allowed.address = updates.address;
    if (updates.booking_url !== undefined) allowed.booking_url = updates.booking_url;
    if (updates.services !== undefined) allowed.services = updates.services;
    if (updates.products !== undefined) allowed.products = updates.products;
    if (updates.images !== undefined) allowed.images = updates.images;
    if (updates.hours !== undefined) allowed.hours = updates.hours;

    // Handle generated_copy updates (merge, don't replace)
    if (updates.generated_copy) {
      const currentCopy = (current.generated_copy || {}) as Record<string, unknown>;
      const mergedCopy = { ...currentCopy };

      // Merge EN copy
      if (updates.generated_copy.en) {
        const currentEn = (currentCopy.en || {}) as Record<string, unknown>;
        mergedCopy.en = { ...currentEn, ...updates.generated_copy.en };
      }

      // Merge ES copy
      if (updates.generated_copy.es) {
        const currentEs = (currentCopy.es || {}) as Record<string, unknown>;
        mergedCopy.es = { ...currentEs, ...updates.generated_copy.es };
      }

      // Merge top-level copy fields (logo, custom_colors, etc)
      if (updates.generated_copy.logo !== undefined) mergedCopy.logo = updates.generated_copy.logo;

      allowed.generated_copy = mergedCopy;
    }

    if (Object.keys(allowed).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from("previews")
      .update(allowed)
      .eq("slug", slug);

    if (updateError) {
      console.error("Update error:", updateError);
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update site error:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
