export const maxDuration = 60;

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateWebsiteCopyVariants } from "@/lib/ai/generate-copy";
import type { BusinessType } from "@/lib/ai/types";

export async function POST(request: Request) {
  try {
    const { slug } = await request.json();

    if (!slug) {
      return NextResponse.json({ error: "slug required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: preview, error: fetchError } = await supabase
      .from("previews")
      .select("*")
      .eq("slug", slug)
      .single();

    if (fetchError || !preview) {
      return NextResponse.json({ error: "Preview not found" }, { status: 404 });
    }

    const services = (preview.services || []) as { name: string; price: string }[];
    const products = (preview.products || []) as { name: string; price: string }[];

    // Generate fresh copy using existing business data
    const variants = await generateWebsiteCopyVariants({
      businessName: preview.business_name,
      businessType: preview.business_type as BusinessType,
      description: "",
      services: services.filter((s) => s.name.trim()),
      products: products.filter((p) => p.name.trim()),
      address: preview.address || undefined,
    });

    // Take the first variant
    const variant = variants[0];
    const currentCopy = (preview.generated_copy || {}) as Record<string, unknown>;

    // Merge: keep existing non-copy fields (logo, custom_colors, brand_colors, etc)
    const updatedCopy = {
      ...currentCopy,
      en: variant.en,
      es: variant.es,
    };

    const { error: updateError } = await supabase
      .from("previews")
      .update({ generated_copy: updatedCopy })
      .eq("slug", slug);

    if (updateError) {
      console.error("Regenerate update error:", updateError);
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      en: variant.en,
      es: variant.es,
    });
  } catch (error) {
    console.error("Regenerate copy error:", error);
    return NextResponse.json(
      { error: "Failed to regenerate copy" },
      { status: 500 }
    );
  }
}
