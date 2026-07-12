import { NextRequest, NextResponse } from "next/server";
import { resolveTenantByHost } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, hashIp, getClientIp } from "@/lib/api-rate-limit";
import { parseHomeServicesConfig } from "@/lib/home-services/types";
import type { HomeServicesLocale } from "@/lib/home-services/types";
import {
  createEstimatePhotoLinks,
  uploadEstimatePhotos,
} from "@/lib/estimate-storage";
import {
  formatEstimateMessage,
  deliverEstimateText,
  sendEstimateNotification,
} from "@/lib/estimate-notification";
import { selectEstimateOwnerEmail, sendEstimateEmail } from "@/lib/estimate-email";
import type { EstimateChannelResult } from "@/lib/estimate-delivery";
import { orchestrateEstimateDelivery } from "@/lib/estimate-delivery-orchestration";
import {
  ESTIMATE_RATE_LIMIT,
  estimateRateLimitBucket,
} from "@/lib/estimate-rate-limit";
import {
  isEstimateHoneypotTripped,
  parseEstimateFormFields,
} from "@/lib/validation/estimate-request";
import { validateEstimatePhotos } from "@/lib/validation/estimate-photos";

type FieldError = { field: string; reason: string };

function normalizeHost(hostname: string): string {
  return hostname.split(":")[0].replace(/^www\./, "").toLowerCase();
}

function deriveLocaleAndSourcePath(
  referer: string | null,
  host: string,
): { locale: HomeServicesLocale; sourcePath: string } {
  const fallback = { locale: "en" as const, sourcePath: "/" };
  if (!referer) return fallback;

  try {
    const refUrl = new URL(referer);
    if (normalizeHost(refUrl.host) !== normalizeHost(host)) return fallback;

    const sourcePath = refUrl.pathname || "/";
    if (sourcePath === "/es" || sourcePath.startsWith("/es/")) {
      return { locale: "es", sourcePath };
    }
    return { locale: "en", sourcePath };
  } catch {
    return fallback;
  }
}

function collectPhotoFiles(form: FormData): File[] {
  return form
    .getAll("photos")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
}

function mapPhotoErrors(
  errors: { index: number; reason: string }[],
): FieldError[] {
  return errors.map((error) => ({
    field: error.index >= 0 ? `photos.${error.index}` : "photos",
    reason: error.reason,
  }));
}

export async function POST(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const tenant = await resolveTenantByHost(host);
  if (!tenant) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!tenant.preview_slug) {
    return NextResponse.json(
      { ok: false, code: "estimate_unavailable" },
      { status: 503 },
    );
  }

  const supabase = createAdminClient();
  const { data: preview, error: previewError } = await supabase
    .from("previews")
    .select("business_type, generated_copy")
    .eq("slug", tenant.preview_slug)
    .maybeSingle();

  if (previewError) {
    console.error("[api/estimate] preview lookup failed", {
      tenantId: tenant.id,
      error: previewError,
    });
    return NextResponse.json(
      { ok: false, code: "estimate_unavailable" },
      { status: 503 },
    );
  }

  if (!preview || preview.business_type !== "home_services") {
    return NextResponse.json(
      { ok: false, code: "estimate_unavailable" },
      { status: 503 },
    );
  }

  const generatedCopy =
    preview.generated_copy && typeof preview.generated_copy === "object"
      ? (preview.generated_copy as Record<string, unknown>)
      : {};
  const config = parseHomeServicesConfig(generatedCopy.home_services_config);
  const ownerEmail = selectEstimateOwnerEmail(tenant);
  const textNotification = config.notification;
  if (!textNotification?.destination_e164 && !ownerEmail) {
    return NextResponse.json(
      { ok: false, code: "estimate_unavailable" },
      { status: 503 },
    );
  }

  const { locale, sourcePath } = deriveLocaleAndSourcePath(
    request.headers.get("referer"),
    host,
  );

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, code: "invalid", errors: [{ field: "form", reason: "invalid" }] },
      { status: 400 },
    );
  }

  if (isEstimateHoneypotTripped(form)) {
    return NextResponse.json({ ok: true, photoWarning: false });
  }

  const ipHash = hashIp(getClientIp(request.headers));
  const allowed = await checkRateLimit(
    estimateRateLimitBucket(tenant.id, ipHash),
    ESTIMATE_RATE_LIMIT.windowSeconds,
    ESTIMATE_RATE_LIMIT.maxRequests,
  );
  if (!allowed) {
    return NextResponse.json(
      { ok: false, code: "rate_limited" },
      { status: 429 },
    );
  }

  const parsedFields = parseEstimateFormFields(form, locale, sourcePath);
  if (!parsedFields.ok) {
    return NextResponse.json(
      { ok: false, code: "invalid", errors: parsedFields.errors },
      { status: 400 },
    );
  }

  const photoFiles = collectPhotoFiles(form);
  const photoValidation = await validateEstimatePhotos(photoFiles);
  if (!photoValidation.ok) {
    return NextResponse.json(
      {
        ok: false,
        code: "invalid",
        errors: mapPhotoErrors(photoValidation.errors),
      },
      { status: 400 },
    );
  }

  const parsed = parsedFields.value;
  const { data: inserted, error: insertError } = await supabase
    .from("estimate_requests")
    .insert({
      tenant_id: tenant.id,
      customer_name: parsed.customer_name,
      customer_phone: parsed.customer_phone,
      service_needed: parsed.service_needed,
      job_location: parsed.job_location,
      description: parsed.description,
      preferred_response: parsed.preferred_response,
      locale: parsed.locale,
      source_path: parsed.source_path,
      notification_channel: textNotification?.channel ?? null,
      notification_destination: textNotification?.destination_e164 ?? null,
      notification_state: "pending",
      text_notification_state: textNotification ? "pending" : "not_configured",
      email_notification_state: ownerEmail ? "pending" : "not_configured",
      email_notification_destination: ownerEmail,
      photo_upload_warning: false,
    })
    .select("id")
    .single();

  if (insertError || !inserted?.id) {
    console.error("[api/estimate] request insert failed", {
      tenantId: tenant.id,
      error: insertError,
    });
    return NextResponse.json(
      { ok: false, code: "server_error" },
      { status: 500 },
    );
  }

  const requestId = inserted.id as string;
  let photoWarning = false;
  let uploadedPaths: string[] = [];

  if (photoValidation.photos.length > 0) {
    const { uploaded, failedIndices } = await uploadEstimatePhotos(
      supabase,
      tenant.id,
      requestId,
      photoValidation.photos,
    );

    if (failedIndices.length > 0) {
      photoWarning = true;
    }

    if (uploaded.length > 0) {
      const { error: photoInsertError } = await supabase
        .from("estimate_photos")
        .insert(uploaded);

      if (photoInsertError) {
        console.error("[api/estimate] photo row insert failed", {
          tenantId: tenant.id,
          requestId,
          error: photoInsertError,
        });
        photoWarning = true;
      } else {
        uploadedPaths = uploaded.map((row) => row.storage_path);
      }
    }
  }

  const photoLinks = await createEstimatePhotoLinks(supabase, uploadedPaths);
  const messageInput = {
    businessName: tenant.business_name,
    customerName: parsed.customer_name,
    customerPhone: parsed.customer_phone,
    serviceNeeded: parsed.service_needed,
    jobLocation: parsed.job_location,
    description: parsed.description,
    preferredResponse: parsed.preferred_response,
    locale: parsed.locale,
    photoLinks,
  };
  const messageBody = formatEstimateMessage(messageInput);
  const notConfigured: EstimateChannelResult = { state: "not_configured" };
  const emailDelivery: Promise<EstimateChannelResult> = ownerEmail
    ? sendEstimateEmail(ownerEmail, messageInput)
        .then((result): EstimateChannelResult => result.ok
          ? { state: "sent", providerId: result.providerId, destination: ownerEmail }
          : { state: "failed", error: result.error, destination: ownerEmail })
        .catch((error: unknown): EstimateChannelResult => {
          console.error("[api/estimate] unexpected email delivery rejection", {
            tenantId: tenant.id,
            requestId,
            error,
          });
          return { state: "failed", error: "Email delivery failed", destination: ownerEmail };
        })
    : Promise.resolve(notConfigured);
  let textDelivery: Awaited<ReturnType<typeof deliverEstimateText>> | null = null;
  await orchestrateEstimateDelivery({
    persist: async () => requestId,
    deliverText: async () => {
      textDelivery = textNotification
        ? await deliverEstimateText(messageBody, textNotification, sendEstimateNotification)
        : null;
      return textDelivery?.result ?? notConfigured;
    },
    deliverEmail: () => emailDelivery,
    update: async (persistedId, channelUpdate) => {
      const textResult = textDelivery?.result ?? notConfigured;
      const { error: updateError } = await supabase
        .from("estimate_requests")
        .update({
          ...channelUpdate,
          notification_state: textResult.state === "sent" ? "sent" : "failed",
          notification_channel: textDelivery?.channel ?? null,
          notification_destination: textDelivery?.destination ?? null,
          provider_message_id: textResult.state === "sent" ? textResult.providerId : null,
          provider_error: textResult.state === "failed" ? textResult.error : null,
          photo_upload_warning: photoWarning,
          notified_at: textResult.state === "sent" ? new Date().toISOString() : null,
        })
        .eq("id", persistedId)
        .eq("tenant_id", tenant.id);
      if (updateError) console.error("[api/estimate] delivery state update failed", { tenantId: tenant.id, requestId: persistedId, error: updateError });
    },
  });

  return NextResponse.json({ ok: true, photoWarning });
}
