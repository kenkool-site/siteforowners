import { normalizeE164 } from "./urls";

export type HomeServicesLocale = "en" | "es";

export type EstimateDeliveryChannel = "sms" | "whatsapp";

export interface HomeServicesNotificationConfig {
  channel: EstimateDeliveryChannel;
  destination_e164: string;
  sms_fallback_e164?: string;
}

export interface HomeServicesTrustPoint {
  id: string;
  label_en: string;
  label_es: string;
}

export interface HomeServicesGalleryProject {
  id: string;
  before_image?: string;
  after_image?: string;
  image?: string;
  caption_en?: string;
  caption_es?: string;
  service_name?: string;
  area_slug?: string;
}

export interface HomeServicesWhyUsPoint {
  id: string;
  title_en: string;
  title_es: string;
  body_en?: string;
  body_es?: string;
}

export interface HomeServicesProcessStep {
  id: string;
  title_en: string;
  body_en: string;
  title_es: string;
  body_es: string;
}

export interface HomeServicesServiceArea {
  id: string;
  name: string;
  zip_codes: string[];
  note_en?: string;
  note_es?: string;
}

export interface HomeServicesSectionCopy {
  eyebrow_en?: string;
  title_en?: string;
  intro_en?: string;
  eyebrow_es?: string;
  title_es?: string;
  intro_es?: string;
}

export type HomeServicesSectionKey =
  | "services"
  | "recent_work"
  | "process"
  | "reviews"
  | "service_areas"
  | "final_cta";

export type HomeServicesSectionCopyConfig = Partial<Record<HomeServicesSectionKey, HomeServicesSectionCopy>>;

export interface HomeServicesConfig {
  trust_points: HomeServicesTrustPoint[];
  gallery_projects: HomeServicesGalleryProject[];
  why_us_points: HomeServicesWhyUsPoint[];
  section_copy: HomeServicesSectionCopyConfig;
  process_steps: HomeServicesProcessStep[];
  service_areas: HomeServicesServiceArea[];
  coverage_summary_en: string;
  coverage_summary_es: string;
  message_links: { whatsapp_e164?: string; sms_e164?: string };
  notification?: HomeServicesNotificationConfig;
  sections: {
    show_trust?: boolean;
    show_gallery?: boolean;
    show_why_us?: boolean;
    show_reviews?: boolean;
    show_service_areas?: boolean;
    show_process?: boolean;
    show_estimate?: boolean;
  };
}

const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const rows = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
    : [];

const ZIP_PATTERN = /^\d{5}(?:-\d{4})?$/;
const SECTION_KEYS: HomeServicesSectionKey[] = [
  "services", "recent_work", "process", "reviews", "service_areas", "final_cta",
];
const COPY_KEYS: (keyof HomeServicesSectionCopy)[] = [
  "eyebrow_en", "title_en", "intro_en", "eyebrow_es", "title_es", "intro_es",
];
const VISIBILITY_KEYS: (keyof HomeServicesConfig["sections"])[] = [
  "show_trust", "show_gallery", "show_why_us", "show_reviews", "show_service_areas", "show_process", "show_estimate",
];

export function parseHomeServicesConfig(raw: unknown): HomeServicesConfig {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const links = source.message_links && typeof source.message_links === "object"
    ? source.message_links as Record<string, unknown>
    : {};
  const sectionsSource = source.sections && typeof source.sections === "object"
    ? source.sections as Record<string, unknown>
    : {};
  const sections: HomeServicesConfig["sections"] = {};
  for (const key of VISIBILITY_KEYS) {
    if (typeof sectionsSource[key] === "boolean") sections[key] = sectionsSource[key];
  }
  const sectionCopySource = source.section_copy && typeof source.section_copy === "object"
    ? source.section_copy as Record<string, unknown>
    : {};
  const section_copy: HomeServicesSectionCopyConfig = {};
  for (const section of SECTION_KEYS) {
    const rawCopy = sectionCopySource[section];
    if (!rawCopy || typeof rawCopy !== "object") continue;
    const copySource = rawCopy as Record<string, unknown>;
    const copy: HomeServicesSectionCopy = {};
    for (const key of COPY_KEYS) {
      const value = text(copySource[key]);
      if (value) copy[key] = value;
    }
    if (Object.keys(copy).length) section_copy[section] = copy;
  }

  const process_steps = rows(source.process_steps).flatMap((row) => {
    const step: HomeServicesProcessStep = {
      id: text(row.id), title_en: text(row.title_en), body_en: text(row.body_en),
      title_es: text(row.title_es), body_es: text(row.body_es),
    };
    return Object.values(step).every(Boolean) ? [step] : [];
  }).slice(0, 3);

  const areaNames = new Set<string>();
  const zipCodes = new Set<string>();
  const service_areas = rows(source.service_areas).flatMap((row) => {
    const id = text(row.id);
    const name = text(row.name);
    const normalizedName = name.toLocaleLowerCase();
    if (!id || !name || areaNames.has(normalizedName)) return [];
    const areaZips: string[] = [];
    if (Array.isArray(row.zip_codes)) {
      for (const value of row.zip_codes) {
          if (areaZips.length === 10) break;
          const zip = text(value);
          if (!ZIP_PATTERN.test(zip) || zipCodes.has(zip)) continue;
          zipCodes.add(zip);
          areaZips.push(zip);
      }
    }
    areaNames.add(normalizedName);
    return [{
      id, name, zip_codes: areaZips,
      ...(text(row.note_en) ? { note_en: text(row.note_en) } : {}),
      ...(text(row.note_es) ? { note_es: text(row.note_es) } : {}),
    }];
  }).slice(0, 20);

  const whatsapp_e164 = text(links.whatsapp_e164) || undefined;
  const sms_e164 = text(links.sms_e164) || undefined;

  const notificationRaw = source.notification && typeof source.notification === "object"
    ? source.notification as Record<string, unknown>
    : null;
  const notificationChannel = notificationRaw ? text(notificationRaw.channel) : "";
  const notificationDestination = notificationRaw
    ? normalizeE164(text(notificationRaw.destination_e164))
    : null;
  const notificationFallbackRaw = notificationRaw ? text(notificationRaw.sms_fallback_e164) : "";
  const notificationFallback = notificationFallbackRaw
    ? normalizeE164(notificationFallbackRaw) ?? undefined
    : undefined;
  const notification = notificationRaw
    && (notificationChannel === "sms" || notificationChannel === "whatsapp")
    && notificationDestination
    ? {
        channel: notificationChannel as EstimateDeliveryChannel,
        destination_e164: notificationDestination,
        ...(notificationFallback ? { sms_fallback_e164: notificationFallback } : {}),
      }
    : undefined;

  return {
    trust_points: rows(source.trust_points).flatMap((row) => {
      const id = text(row.id);
      const label_en = text(row.label_en);
      const label_es = text(row.label_es);
      return id && label_en && label_es ? [{ id, label_en, label_es }] : [];
    }),
    gallery_projects: rows(source.gallery_projects).flatMap((row) => {
      const id = text(row.id);
      if (!id) return [];
      return [{
        id,
        before_image: text(row.before_image) || undefined,
        after_image: text(row.after_image) || undefined,
        image: text(row.image) || undefined,
        caption_en: text(row.caption_en) || undefined,
        caption_es: text(row.caption_es) || undefined,
        service_name: text(row.service_name) || undefined,
        area_slug: text(row.area_slug) || undefined,
      }];
    }),
    why_us_points: rows(source.why_us_points).flatMap((row) => {
      const id = text(row.id);
      const title_en = text(row.title_en);
      const title_es = text(row.title_es);
      return id && title_en && title_es ? [{
        id,
        title_en,
        title_es,
        body_en: text(row.body_en) || undefined,
        body_es: text(row.body_es) || undefined,
      }] : [];
    }),
    section_copy,
    process_steps,
    service_areas,
    coverage_summary_en: text(source.coverage_summary_en),
    coverage_summary_es: text(source.coverage_summary_es),
    message_links: {
      ...(whatsapp_e164 ? { whatsapp_e164 } : {}),
      ...(sms_e164 ? { sms_e164 } : {}),
    },
    ...(notification ? { notification } : {}),
    sections,
  };
}
