import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const { slugs } = await request.json();

    if (!slugs || !Array.isArray(slugs) || slugs.length === 0) {
      return NextResponse.json({ error: "slugs array required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Don't delete previews linked to active tenants
    const { data: linkedTenants } = await supabase
      .from("tenants")
      .select("preview_slug")
      .in("preview_slug", slugs);

    const protectedSlugs = new Set((linkedTenants || []).map((t) => t.preview_slug));
    const deletable = slugs.filter((s: string) => !protectedSlugs.has(s));

    if (deletable.length === 0) {
      return NextResponse.json(
        { error: "Cannot delete — all selected previews are linked to active clients" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("previews")
      .delete()
      .in("slug", deletable);

    if (error) {
      console.error("Delete error:", error);
      return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      deleted: deletable.length,
      protected: slugs.length - deletable.length,
    });
  } catch (error) {
    console.error("Delete preview error:", error);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
