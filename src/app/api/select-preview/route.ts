import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const { group_id, slug } = await request.json();

    if (!group_id || !slug) {
      return NextResponse.json(
        { error: "Missing group_id or slug" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Reset all in group
    await supabase
      .from("previews")
      .update({ is_selected: false })
      .eq("group_id", group_id);

    // Mark selected
    const { error } = await supabase
      .from("previews")
      .update({ is_selected: true })
      .eq("slug", slug)
      .eq("group_id", group_id);

    if (error) {
      console.error("Select preview error:", error);
      return NextResponse.json(
        { error: "Failed to save selection" },
        { status: 500 }
      );
    }

    // If a tenant is linked to any preview in this group, update to new slug
    // This makes the live subdomain site point to the newly selected variant
    const { data: groupPreviews } = await supabase
      .from("previews")
      .select("slug")
      .eq("group_id", group_id);

    if (groupPreviews) {
      const allSlugs = groupPreviews.map((p) => p.slug);
      const { data: tenant } = await supabase
        .from("tenants")
        .select("id")
        .in("preview_slug", allSlugs)
        .limit(1)
        .single();

      if (tenant) {
        await supabase
          .from("tenants")
          .update({ preview_slug: slug, updated_at: new Date().toISOString() })
          .eq("id", tenant.id);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Select preview error:", error);
    return NextResponse.json(
      { error: "Failed to save selection" },
      { status: 500 }
    );
  }
}
