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

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Select preview error:", error);
    return NextResponse.json(
      { error: "Failed to save selection" },
      { status: 500 }
    );
  }
}
