export type HomeServicesLocale = "en" | "es";

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

export interface HomeServicesConfig {
  trust_points: HomeServicesTrustPoint[];
  gallery_projects: HomeServicesGalleryProject[];
  why_us_points: HomeServicesWhyUsPoint[];
  coverage_summary_en: string;
  coverage_summary_es: string;
  message_links: { whatsapp_e164?: string; sms_e164?: string };
  sections: {
    show_trust?: boolean;
    show_gallery?: boolean;
    show_why_us?: boolean;
    show_reviews?: boolean;
    show_service_areas?: boolean;
    show_estimate?: boolean;
  };
}

const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const rows = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
    : [];

export function parseHomeServicesConfig(raw: unknown): HomeServicesConfig {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const links = source.message_links && typeof source.message_links === "object"
    ? source.message_links as Record<string, unknown>
    : {};
  const sections = source.sections && typeof source.sections === "object"
    ? source.sections as HomeServicesConfig["sections"]
    : {};

  const whatsapp_e164 = text(links.whatsapp_e164) || undefined;
  const sms_e164 = text(links.sms_e164) || undefined;

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
    coverage_summary_en: text(source.coverage_summary_en),
    coverage_summary_es: text(source.coverage_summary_es),
    message_links: {
      ...(whatsapp_e164 ? { whatsapp_e164 } : {}),
      ...(sms_e164 ? { sms_e164 } : {}),
    },
    sections,
  };
}
