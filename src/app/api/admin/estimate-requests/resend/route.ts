import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseHomeServicesConfig } from "@/lib/home-services/types";
import { createEstimatePhotoLinks } from "@/lib/estimate-storage";
import {
  formatEstimateMessage,
  sendEstimateNotification,
} from "@/lib/estimate-notification";
import type { PreferredResponse } from "@/lib/validation/estimate-request";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireFounder(request: NextRequest): boolean {
  const cookie = request.cookies.get("admin_session")?.value;
  return !!ADMIN_PASSWORD && cookie === ADMIN_PASSWORD;
}

export async function POST(request: NextRequest) {
  if (!requireFounder(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const tenantId = typeof body.tenantId === "string" ? body.tenantId.trim() : "";
  const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
  if (!UUID_RE.test(tenantId) || !UUID_RE.test(requestId)) {
    return NextResponse.json({ error: "tenantId and requestId required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: estimateRequest, error: requestError } = await supabase
    .from("estimate_requests")
    .select(`
      id,
      tenant_id,
      customer_name,
      customer_phone,
      service_needed,
      job_location,
      description,
      preferred_response,
      locale
    `)
    .eq("id", requestId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (requestError) {
    console.error("[admin/estimate-requests/resend] request lookup failed", {
      tenantId,
      requestId,
      error: requestError,
    });
    return NextResponse.json({ error: "Failed to load request" }, { status: 500 });
  }

  if (!estimateRequest) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("id, business_name, preview_slug")
    .eq("id", tenantId)
    .maybeSingle();

  if (tenantError || !tenant?.preview_slug) {
    console.error("[admin/estimate-requests/resend] tenant lookup failed", {
      tenantId,
      error: tenantError,
    });
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const { data: preview, error: previewError } = await supabase
    .from("previews")
    .select("generated_copy")
    .eq("slug", tenant.preview_slug)
    .maybeSingle();

  if (previewError) {
    console.error("[admin/estimate-requests/resend] preview lookup failed", {
      tenantId,
      error: previewError,
    });
    return NextResponse.json({ error: "Failed to load notification config" }, { status: 500 });
  }

  const generatedCopy =
    preview?.generated_copy && typeof preview.generated_copy === "object"
      ? (preview.generated_copy as Record<string, unknown>)
      : {};
  const config = parseHomeServicesConfig(generatedCopy.home_services_config);
  const notification = config.notification;
  if (!notification?.destination_e164) {
    return NextResponse.json({ error: "Notification not configured" }, { status: 400 });
  }

  const { data: photoRows, error: photoError } = await supabase
    .from("estimate_photos")
    .select("storage_path")
    .eq("tenant_id", tenantId)
    .eq("estimate_request_id", requestId);

  if (photoError) {
    console.error("[admin/estimate-requests/resend] photo lookup failed", {
      tenantId,
      requestId,
      error: photoError,
    });
    return NextResponse.json({ error: "Failed to load photos" }, { status: 500 });
  }

  const photoPaths = (photoRows ?? []).map((row) => row.storage_path as string);
  const photoLinks = await createEstimatePhotoLinks(supabase, photoPaths);

  const messageBody = formatEstimateMessage({
    businessName: tenant.business_name as string,
    customerName: estimateRequest.customer_name as string,
    customerPhone: estimateRequest.customer_phone as string,
    serviceNeeded: estimateRequest.service_needed as string,
    jobLocation: estimateRequest.job_location as string,
    description: estimateRequest.description as string,
    preferredResponse: estimateRequest.preferred_response as PreferredResponse,
    locale: estimateRequest.locale as "en" | "es",
    photoLinks,
  });

  let usedChannel = notification.channel;
  let usedDestination = notification.destination_e164;

  let delivery = await sendEstimateNotification(
    messageBody,
    usedChannel,
    usedDestination,
  );

  if (!delivery.ok && usedChannel === "whatsapp" && notification.sms_fallback_e164) {
    usedChannel = "sms";
    usedDestination = notification.sms_fallback_e164;
    delivery = await sendEstimateNotification(
      messageBody,
      usedChannel,
      usedDestination,
    );
  }

  const { error: updateError } = await supabase
    .from("estimate_requests")
    .update({
      notification_state: delivery.ok ? "sent" : "failed",
      notification_channel: usedChannel,
      notification_destination: usedDestination,
      provider_message_id: delivery.ok ? delivery.messageSid : null,
      provider_error: delivery.ok ? null : delivery.error,
      notified_at: delivery.ok ? new Date().toISOString() : null,
    })
    .eq("id", requestId)
    .eq("tenant_id", tenantId);

  if (updateError) {
    console.error("[admin/estimate-requests/resend] delivery state update failed", {
      tenantId,
      requestId,
      error: updateError,
    });
    return NextResponse.json({ error: "Failed to update delivery state" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    notification_state: delivery.ok ? "sent" : "failed",
    provider_error: delivery.ok ? null : delivery.error,
  });
}
