import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseHomeServicesConfig } from "@/lib/home-services/types";
import { createEstimatePhotoLinks } from "@/lib/estimate-storage";
import { formatEstimateMessage, sendEstimateNotification } from "@/lib/estimate-notification";
import { selectEstimateOwnerEmail, sendEstimateEmail } from "@/lib/estimate-email";
import type { PreferredResponse } from "@/lib/validation/estimate-request";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireFounder(request: NextRequest): boolean {
  return !!ADMIN_PASSWORD && request.cookies.get("admin_session")?.value === ADMIN_PASSWORD;
}

export async function POST(request: NextRequest) {
  if (!requireFounder(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const tenantId = typeof body.tenantId === "string" ? body.tenantId.trim() : "";
  const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
  const channel = body.channel;
  if (!UUID_RE.test(tenantId) || !UUID_RE.test(requestId)) {
    return NextResponse.json({ error: "tenantId and requestId required" }, { status: 400 });
  }
  if (channel !== "text" && channel !== "email") {
    return NextResponse.json({ error: "channel must be text or email" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: estimateRequest, error: requestError } = await supabase.from("estimate_requests").select(`
    id, tenant_id, customer_name, customer_phone, service_needed, job_location,
    description, preferred_response, locale
  `).eq("id", requestId).eq("tenant_id", tenantId).maybeSingle();
  if (requestError) return NextResponse.json({ error: "Failed to load request" }, { status: 500 });
  if (!estimateRequest) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: tenant, error: tenantError } = await supabase.from("tenants")
    .select("id, business_name, preview_slug, email, admin_email").eq("id", tenantId).maybeSingle();
  if (tenantError || !tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  const messageInput = {
    businessName: tenant.business_name as string,
    customerName: estimateRequest.customer_name as string,
    customerPhone: estimateRequest.customer_phone as string,
    serviceNeeded: estimateRequest.service_needed as string,
    jobLocation: estimateRequest.job_location as string,
    description: estimateRequest.description as string,
  };

  let update: Record<string, string | null>;
  if (channel === "email") {
    const destination = selectEstimateOwnerEmail(tenant);
    if (!destination) return NextResponse.json({ error: "Email notification not configured" }, { status: 400 });
    const delivery = await sendEstimateEmail(destination, messageInput);
    update = {
      email_notification_state: delivery.ok ? "sent" : "failed",
      email_notification_destination: destination,
      email_provider_message_id: delivery.ok ? delivery.providerId : null,
      email_provider_error: delivery.ok ? null : delivery.error,
    };
  } else {
    if (!tenant.preview_slug) return NextResponse.json({ error: "Text notification not configured" }, { status: 400 });
    const { data: preview, error: previewError } = await supabase.from("previews")
      .select("generated_copy").eq("slug", tenant.preview_slug).maybeSingle();
    if (previewError) return NextResponse.json({ error: "Failed to load notification config" }, { status: 500 });
    const generatedCopy = preview?.generated_copy && typeof preview.generated_copy === "object"
      ? preview.generated_copy as Record<string, unknown> : {};
    const notification = parseHomeServicesConfig(generatedCopy.home_services_config).notification;
    if (!notification?.destination_e164) return NextResponse.json({ error: "Text notification not configured" }, { status: 400 });
    const { data: photos, error: photoError } = await supabase.from("estimate_photos").select("storage_path")
      .eq("tenant_id", tenantId).eq("estimate_request_id", requestId);
    if (photoError) return NextResponse.json({ error: "Failed to load photos" }, { status: 500 });
    const photoLinks = await createEstimatePhotoLinks(supabase, (photos ?? []).map((row) => row.storage_path as string));
    const message = formatEstimateMessage({
      ...messageInput,
      preferredResponse: estimateRequest.preferred_response as PreferredResponse,
      locale: estimateRequest.locale as "en" | "es",
      photoLinks,
    });
    let usedChannel = notification.channel;
    let destination = notification.destination_e164;
    let delivery = await sendEstimateNotification(message, usedChannel, destination);
    if (!delivery.ok && usedChannel === "whatsapp" && notification.sms_fallback_e164) {
      usedChannel = "sms";
      destination = notification.sms_fallback_e164;
      delivery = await sendEstimateNotification(message, usedChannel, destination);
    }
    update = {
      text_notification_state: delivery.ok ? "sent" : "failed",
      text_provider_message_id: delivery.ok ? delivery.messageSid : null,
      text_provider_error: delivery.ok ? null : delivery.error,
      notification_state: delivery.ok ? "sent" : "failed",
      notification_channel: usedChannel,
      notification_destination: destination,
      provider_message_id: delivery.ok ? delivery.messageSid : null,
      provider_error: delivery.ok ? null : delivery.error,
      notified_at: delivery.ok ? new Date().toISOString() : null,
    };
  }
  const { error: updateError } = await supabase.from("estimate_requests").update(update)
    .eq("id", requestId).eq("tenant_id", tenantId);
  if (updateError) return NextResponse.json({ error: "Failed to update delivery state" }, { status: 500 });
  return NextResponse.json({ ok: true, channel });
}
