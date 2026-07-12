import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseHomeServicesConfig } from "@/lib/home-services/types";
import { createEstimatePhotoLinks } from "@/lib/estimate-storage";
import { formatEstimateMessage, sendEstimateNotification } from "@/lib/estimate-notification";
import { selectEstimateOwnerEmail, sendEstimateEmail } from "@/lib/estimate-email";
import { executeAdminEstimateResend, type RetryResult } from "@/lib/estimate-admin-resend";
import type { PreferredResponse } from "@/lib/validation/estimate-request";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

function requireFounder(request: NextRequest): boolean {
  return !!ADMIN_PASSWORD && request.cookies.get("admin_session")?.value === ADMIN_PASSWORD;
}

export async function POST(request: NextRequest) {
  let input: unknown;
  try { input = await request.json(); }
  catch { input = null; }
  const supabase = createAdminClient;
  let loadedRequest: Record<string, unknown> | null = null;
  let loadedTenant: Record<string, unknown> | null = null;

  async function loadPhotoLinks(requestId: string, tenantId: string): Promise<string[]> {
    const db = supabase();
    const photoResult = await db.from("estimate_photos").select("storage_path")
      .eq("tenant_id", tenantId).eq("estimate_request_id", requestId);
    if (photoResult.error) throw new Error("Failed to load photos");
    return createEstimatePhotoLinks(db, (photoResult.data ?? []).map((row) => row.storage_path as string));
  }

  const result = await executeAdminEstimateResend(requireFounder(request), input, {
    findRequest: async (requestId, tenantId) => {
      const db = supabase();
      const requestResult = await db.from("estimate_requests").select(`
        id, tenant_id, customer_name, customer_phone, service_needed, job_location,
        description, preferred_response, locale
      `).eq("id", requestId).eq("tenant_id", tenantId).maybeSingle();
      if (requestResult.error || !requestResult.data) return false;
      const tenantResult = await db.from("tenants").select("id, business_name, preview_slug, email, admin_email")
        .eq("id", tenantId).maybeSingle();
      if (tenantResult.error || !tenantResult.data) return false;
      loadedRequest = requestResult.data;
      loadedTenant = tenantResult.data;
      return true;
    },
    sendEmail: async (requestId, tenantId) => {
      if (!loadedRequest || !loadedTenant) return null;
      const destination = selectEstimateOwnerEmail(loadedTenant);
      if (!destination) return null;
      const photoLinks = await loadPhotoLinks(requestId, tenantId);
      const delivery = await sendEstimateEmail(destination, {
        ...messageInput(loadedRequest, loadedTenant),
        photoLinks,
      });
      return { ok: delivery.ok, destination, providerId: delivery.ok ? delivery.providerId : undefined, error: delivery.ok ? undefined : delivery.error };
    },
    sendText: async (requestId, tenantId) => {
      if (!loadedRequest || !loadedTenant || !loadedTenant.preview_slug) return null;
      const db = supabase();
      const previewResult = await db.from("previews").select("generated_copy")
        .eq("slug", loadedTenant.preview_slug).maybeSingle();
      const generatedCopy = previewResult.data?.generated_copy && typeof previewResult.data.generated_copy === "object"
        ? previewResult.data.generated_copy as Record<string, unknown> : {};
      const notification = parseHomeServicesConfig(generatedCopy.home_services_config).notification;
      if (previewResult.error || !notification?.destination_e164) return null;
      const photoLinks = await loadPhotoLinks(requestId, tenantId);
      const message = formatEstimateMessage({
        ...messageInput(loadedRequest, loadedTenant),
        preferredResponse: loadedRequest.preferred_response as PreferredResponse,
        locale: loadedRequest.locale as "en" | "es",
        photoLinks,
      });
      let channel = notification.channel;
      let destination = notification.destination_e164;
      let delivery = await sendEstimateNotification(message, channel, destination);
      if (!delivery.ok && channel === "whatsapp" && notification.sms_fallback_e164) {
        channel = "sms";
        destination = notification.sms_fallback_e164;
        delivery = await sendEstimateNotification(message, channel, destination);
      }
      return { ok: delivery.ok, destination, providerId: delivery.ok ? delivery.messageSid : undefined,
        error: delivery.ok ? undefined : delivery.error, legacy: { channel, destination } } satisfies RetryResult;
    },
    updateRequest: async (requestId, tenantId, fields) => {
      const { error } = await supabase().from("estimate_requests").update(fields)
        .eq("id", requestId).eq("tenant_id", tenantId);
      if (error) throw new Error("Failed to update delivery state");
    },
  });
  return NextResponse.json(result.body, { status: result.status });
}

function messageInput(estimateRequest: Record<string, unknown>, tenant: Record<string, unknown>) {
  return {
    businessName: tenant.business_name as string,
    customerName: estimateRequest.customer_name as string,
    customerPhone: estimateRequest.customer_phone as string,
    serviceNeeded: estimateRequest.service_needed as string,
    jobLocation: estimateRequest.job_location as string,
    description: estimateRequest.description as string,
    preferredResponse: estimateRequest.preferred_response as PreferredResponse,
    locale: estimateRequest.locale as "en" | "es",
  };
}
