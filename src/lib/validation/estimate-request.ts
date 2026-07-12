import { normalizeE164 } from "@/lib/home-services/urls";
import type { HomeServicesLocale } from "@/lib/home-services/types";

export const ESTIMATE_FIELD_LIMITS = {
  name: 100,
  phone: 32,
  service: 120,
  location: 240,
  description: 2000,
} as const;

export type PreferredResponse = "call" | "sms" | "whatsapp";

export interface ParsedEstimateRequest {
  customer_name: string;
  customer_phone: string;
  service_needed: string;
  job_location: string;
  description: string;
  preferred_response: PreferredResponse;
  locale: HomeServicesLocale;
  source_path: string;
}

export type EstimateValidationResult =
  | { ok: true; value: ParsedEstimateRequest }
  | {
      ok: false;
      isSpam: boolean;
      errors: { field: string; reason: "required" | "too_long" | "invalid" }[];
    };

const PREFERRED_RESPONSES = new Set<PreferredResponse>(["call", "sms", "whatsapp"]);

function formField(form: FormData, key: string): string {
  const value = form.get(key);
  if (typeof value !== "string") return "";
  return value.trim();
}

function optionalString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function parsePreferredResponse(value: string): PreferredResponse {
  return value as PreferredResponse;
}

export function isEstimateHoneypotTripped(form: FormData): boolean {
  return formField(form, "company_website").length > 0;
}

export function parseEstimateFormFields(
  form: FormData,
  locale: HomeServicesLocale,
  sourcePath: string,
): EstimateValidationResult {
  if (isEstimateHoneypotTripped(form)) {
    return { ok: false, isSpam: true, errors: [] };
  }

  const name = formField(form, "name");
  const phone = formField(form, "phone");
  const service = formField(form, "service");
  const location = formField(form, "location");
  const description = optionalString(form.get("description"));
  const preferredResponseRaw = optionalString(form.get("preferred_response"));
  const preferredResponse: PreferredResponse = preferredResponseRaw
    ? parsePreferredResponse(preferredResponseRaw)
    : "sms";

  const errors: { field: string; reason: "required" | "too_long" | "invalid" }[] = [];

  if (!name) errors.push({ field: "name", reason: "required" });
  else if (name.length > ESTIMATE_FIELD_LIMITS.name) errors.push({ field: "name", reason: "too_long" });

  if (!phone) errors.push({ field: "phone", reason: "required" });
  else if (phone.length > ESTIMATE_FIELD_LIMITS.phone) errors.push({ field: "phone", reason: "too_long" });

  if (!service) errors.push({ field: "service", reason: "required" });
  else if (service.length > ESTIMATE_FIELD_LIMITS.service) {
    errors.push({ field: "service", reason: "too_long" });
  }

  if (!location) errors.push({ field: "location", reason: "required" });
  else if (location.length > ESTIMATE_FIELD_LIMITS.location) {
    errors.push({ field: "location", reason: "too_long" });
  }

  if (description.length > 0 && description.length > ESTIMATE_FIELD_LIMITS.description) {
    errors.push({ field: "description", reason: "too_long" });
  }

  if (!PREFERRED_RESPONSES.has(preferredResponse)) {
    errors.push({ field: "preferred_response", reason: "invalid" });
  }

  let normalizedPhone: string | null = null;
  if (phone && phone.length <= ESTIMATE_FIELD_LIMITS.phone) {
    normalizedPhone = normalizeE164(phone);
    if (!normalizedPhone) errors.push({ field: "phone", reason: "invalid" });
  }

  if (errors.length > 0) {
    return { ok: false, isSpam: false, errors };
  }

  return {
    ok: true,
    value: {
      customer_name: name,
      customer_phone: normalizedPhone!,
      service_needed: service,
      job_location: location,
      description,
      preferred_response: preferredResponse,
      locale,
      source_path: sourcePath,
    },
  };
}
