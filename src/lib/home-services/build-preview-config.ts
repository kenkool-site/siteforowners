import { buildOutdoorServicesPreset } from "./preset-outdoor-services";
import { parseHomeServicesConfig, type HomeServicesConfig } from "./types";
import { normalizeE164 } from "./urls";

function baseConfig(): HomeServicesConfig {
  const preset = buildOutdoorServicesPreset();
  return parseHomeServicesConfig(preset.generated_copy?.home_services_config);
}

/** Turn a wizard address into a public-safe service-area phrase (no street). */
export function deriveServiceAreaSummary(
  address: string,
  locale: "en" | "es",
): string {
  const trimmed = address.trim();
  if (!trimmed) return "";

  const parts = trimmed.split(",").map((part) => part.trim()).filter(Boolean);
  let area = trimmed;
  if (parts.length >= 2) {
    const cityCandidate = parts[parts.length - 2];
    area = cityCandidate.replace(/\d{5}(-\d{4})?/g, "").trim() || cityCandidate;
  }

  if (locale === "es") {
    return `Servicio en ${area} y zonas cercanas`;
  }
  return `Serving ${area} and nearby areas`;
}

export function buildHomeServicesConfigForPreview(input: {
  phone?: string;
  serviceAreaAddress?: string;
}): HomeServicesConfig {
  const base = baseConfig();
  const phoneE164 = input.phone ? normalizeE164(input.phone) : null;
  const coverageEn = deriveServiceAreaSummary(input.serviceAreaAddress ?? "", "en");
  const coverageEs = deriveServiceAreaSummary(input.serviceAreaAddress ?? "", "es");

  return {
    ...base,
    coverage_summary_en: coverageEn || base.coverage_summary_en,
    coverage_summary_es: coverageEs || base.coverage_summary_es,
    message_links: phoneE164
      ? { sms_e164: phoneE164, whatsapp_e164: phoneE164 }
      : base.message_links,
    notification: undefined,
    sections: {
      show_trust: true,
      show_gallery: true,
      show_why_us: true,
      show_reviews: true,
      show_service_areas: false,
      show_estimate: true,
    },
  };
}
