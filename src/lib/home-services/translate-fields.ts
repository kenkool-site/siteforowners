import {
  HOME_SERVICES_SECTION_KEYS,
  type HomeServicesSectionKey,
} from "./types";
import type { EditorDraft } from "@/app/(admin)/clients/[tenantId]/edit/HomeServicesSiteEditor";

/**
 * Draft ⇄ flat-map bridge for the "Translate missing fields with AI" button.
 * Key scheme: copy.<field> | copy.about_paragraphs.<i> | desc.<client_id> |
 * sc.<section>.<eyebrow|title|intro> | trust.<id>.label | why.<id>.<title|body> |
 * proc.<id>.<title|body> | cap.<projectId> | coverage
 * Service-area names are deliberately excluded (proper nouns).
 */

export type TranslateLocale = "en" | "es";

const COPY_FIELDS = [
  "hero_headline",
  "hero_subheadline",
  "seo_title",
  "seo_description",
  "footer_tagline",
  "google_business_description",
] as const;
type CopyField = (typeof COPY_FIELDS)[number];

const SECTION_PARTS = ["eyebrow", "title", "intro"] as const;
const MAX_PARAGRAPH_INDEX = 50;

const filled = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "";

export function collectMissingTranslations(
  draft: EditorDraft,
  from: TranslateLocale,
  to: TranslateLocale,
): Record<string, string> {
  const texts: Record<string, string> = {};
  const src = draft.generated_copy[from];
  const dst = draft.generated_copy[to];

  for (const field of COPY_FIELDS) {
    if (filled(src[field]) && !filled(dst[field])) texts[`copy.${field}`] = src[field];
  }
  src.about_paragraphs.forEach((paragraph, index) => {
    if (filled(paragraph) && !filled(dst.about_paragraphs[index])) {
      texts[`copy.about_paragraphs.${index}`] = paragraph;
    }
  });
  for (const service of draft.services) {
    const id = service.client_id;
    if (!id) continue;
    const source = src.service_descriptions[id];
    if (filled(source) && !filled(dst.service_descriptions[id])) texts[`desc.${id}`] = source;
  }

  const config = draft.home_services_config;
  for (const key of HOME_SERVICES_SECTION_KEYS) {
    const section = config.section_copy[key];
    if (!section) continue;
    for (const part of SECTION_PARTS) {
      const source = section[`${part}_${from}`];
      if (filled(source) && !filled(section[`${part}_${to}`])) {
        texts[`sc.${key}.${part}`] = source;
      }
    }
  }
  for (const point of config.trust_points) {
    if (filled(point[`label_${from}`]) && !filled(point[`label_${to}`])) {
      texts[`trust.${point.id}.label`] = point[`label_${from}`];
    }
  }
  for (const point of config.why_us_points) {
    if (filled(point[`title_${from}`]) && !filled(point[`title_${to}`])) {
      texts[`why.${point.id}.title`] = point[`title_${from}`];
    }
    const body = point[`body_${from}`];
    if (filled(body) && !filled(point[`body_${to}`])) texts[`why.${point.id}.body`] = body;
  }
  for (const step of config.process_steps) {
    if (filled(step[`title_${from}`]) && !filled(step[`title_${to}`])) {
      texts[`proc.${step.id}.title`] = step[`title_${from}`];
    }
    if (filled(step[`body_${from}`]) && !filled(step[`body_${to}`])) {
      texts[`proc.${step.id}.body`] = step[`body_${from}`];
    }
  }
  for (const project of config.gallery_projects) {
    const source = project[`caption_${from}`];
    if (filled(source) && !filled(project[`caption_${to}`])) texts[`cap.${project.id}`] = source;
  }
  const coverageSource = config[`coverage_summary_${from}`];
  if (filled(coverageSource) && !filled(config[`coverage_summary_${to}`])) {
    texts["coverage"] = coverageSource;
  }

  return texts;
}

export function applyTranslations(
  draft: EditorDraft,
  to: TranslateLocale,
  translations: Record<string, string>,
): EditorDraft {
  const next: EditorDraft = {
    ...draft,
    generated_copy: {
      ...draft.generated_copy,
      [to]: {
        ...draft.generated_copy[to],
        about_paragraphs: [...draft.generated_copy[to].about_paragraphs],
        service_descriptions: { ...draft.generated_copy[to].service_descriptions },
      },
    },
    home_services_config: {
      ...draft.home_services_config,
      section_copy: { ...draft.home_services_config.section_copy },
      trust_points: draft.home_services_config.trust_points.map((p) => ({ ...p })),
      why_us_points: draft.home_services_config.why_us_points.map((p) => ({ ...p })),
      process_steps: draft.home_services_config.process_steps.map((p) => ({ ...p })),
      gallery_projects: draft.home_services_config.gallery_projects.map((p) => ({ ...p })),
    },
  };
  const dst = next.generated_copy[to];
  const config = next.home_services_config;

  for (const [key, value] of Object.entries(translations)) {
    if (!filled(value)) continue;
    const parts = key.split(".");
    const head = parts[0];

    if (head === "copy" && parts.length === 2 && (COPY_FIELDS as readonly string[]).includes(parts[1]!)) {
      dst[parts[1] as CopyField] = value;
    } else if (head === "copy" && parts[1] === "about_paragraphs" && parts.length === 3) {
      const index = Number(parts[2]);
      if (!Number.isInteger(index) || index < 0 || index > MAX_PARAGRAPH_INDEX) continue;
      while (dst.about_paragraphs.length <= index) dst.about_paragraphs.push("");
      dst.about_paragraphs[index] = value;
    } else if (head === "desc" && parts.length === 2 && parts[1]) {
      dst.service_descriptions[parts[1]] = value;
    } else if (head === "sc" && parts.length === 3) {
      const sectionKey = parts[1] as HomeServicesSectionKey;
      const part = parts[2];
      if (!HOME_SERVICES_SECTION_KEYS.includes(sectionKey)) continue;
      if (part !== "eyebrow" && part !== "title" && part !== "intro") continue;
      const section = { ...(config.section_copy[sectionKey] ?? {}) };
      section[`${part}_${to}`] = value;
      config.section_copy[sectionKey] = section;
    } else if (head === "trust" && parts.length === 3 && parts[2] === "label") {
      const point = config.trust_points.find((p) => p.id === parts[1]);
      if (point) point[`label_${to}`] = value;
    } else if (head === "why" && parts.length === 3 && (parts[2] === "title" || parts[2] === "body")) {
      const point = config.why_us_points.find((p) => p.id === parts[1]);
      if (point) point[`${parts[2]}_${to}`] = value;
    } else if (head === "proc" && parts.length === 3 && (parts[2] === "title" || parts[2] === "body")) {
      const step = config.process_steps.find((p) => p.id === parts[1]);
      if (step) step[`${parts[2]}_${to}`] = value;
    } else if (head === "cap" && parts.length === 2) {
      const project = config.gallery_projects.find((p) => p.id === parts[1]);
      if (project) project[`caption_${to}`] = value;
    } else if (key === "coverage") {
      config[`coverage_summary_${to}`] = value;
    }
  }

  return next;
}
