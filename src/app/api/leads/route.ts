import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const { preview_slug, business_name, owner_name, phone, email, message } =
      await request.json();

    if (!preview_slug || !owner_name || !phone) {
      return NextResponse.json(
        { error: "Name and phone number are required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const { error } = await supabase.from("interested_leads").insert({
      preview_slug,
      business_name,
      owner_name,
      phone,
      email: email || null,
      message: message || null,
    });

    if (error) {
      console.error("Lead insert error:", error);
      throw new Error("Failed to save");
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Leads API error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
