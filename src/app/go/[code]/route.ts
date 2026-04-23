import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  if (!code || code.length < 4 || code.length > 16) {
    return NextResponse.redirect(new URL("/", _request.url), { status: 302 });
  }

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("interested_leads")
    .select("checkout_url")
    .eq("checkout_short_code", code)
    .single();

  if (!data?.checkout_url) {
    return NextResponse.redirect(new URL("/", _request.url), { status: 302 });
  }

  return NextResponse.redirect(data.checkout_url, { status: 302 });
}
