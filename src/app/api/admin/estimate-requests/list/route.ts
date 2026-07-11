import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEstimateTwilioConfigWarning } from "@/lib/estimate-twilio-config";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireFounder(request: NextRequest): boolean {
  const cookie = request.cookies.get("admin_session")?.value;
  return !!ADMIN_PASSWORD && cookie === ADMIN_PASSWORD;
}

export async function GET(request: NextRequest) {
  if (!requireFounder(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = request.nextUrl.searchParams.get("tenantId")?.trim() || "";
  if (!UUID_RE.test(tenantId)) {
    return NextResponse.json({ error: "tenantId required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: rows, error } = await supabase
    .from("estimate_requests")
    .select(`
      id,
      created_at,
      service_needed,
      notification_state,
      provider_error,
      estimate_photos (
        content_type,
        size_bytes
      )
    `)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("[admin/estimate-requests/list] query failed", { tenantId, error });
    return NextResponse.json({ error: "Failed to load requests" }, { status: 500 });
  }

  const requests = (rows ?? []).map((row) => {
    const photos = Array.isArray(row.estimate_photos)
      ? row.estimate_photos.map((photo: { content_type: string; size_bytes: number }) => ({
          content_type: photo.content_type,
          size_bytes: photo.size_bytes,
        }))
      : [];

    return {
      id: row.id,
      created_at: row.created_at,
      service_needed: row.service_needed,
      notification_state: row.notification_state,
      provider_error: row.provider_error,
      photo_count: photos.length,
      photos,
    };
  });

  return NextResponse.json({
    requests,
    twilioWarning: getEstimateTwilioConfigWarning(),
    channelWarnings: {
      sms: getEstimateTwilioConfigWarning("sms"),
      whatsapp: getEstimateTwilioConfigWarning("whatsapp"),
    },
  });
}
