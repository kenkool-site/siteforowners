import {
  buildSocialLinksPayload,
  socialLinkToDisplayValue,
  type SocialLinks,
} from "./social-links";

export const OWNER_PROFILE_LIMITS = {
  businessName: 120,
  phone: 40,
  tagline: 220,
  aboutCharacters: 3000,
  aboutParagraphs: 8,
} as const;

export type OwnerProfileInput = {
  business_name?: unknown;
  phone?: unknown;
  tagline?: unknown;
  admin_email?: unknown;
  about_en?: unknown;
  about_es?: unknown;
  about_image_url?: unknown;
  instagram?: unknown;
  facebook?: unknown;
  tiktok?: unknown;
};

export type OwnerProfileValue = {
  business_name: string;
  phone: string | null;
  tagline: string;
  admin_email: string | null;
  about_en: string[];
  about_es: string[];
  about_image_url: string | null;
  social_links: SocialLinks | null;
};

export type OwnerProfileError = {
  field: string;
  reason: string;
};

export type OwnerProfileResult =
  | { ok: true; value: OwnerProfileValue }
  | { ok: false; errors: OwnerProfileError[] };

export type EditableOwnerProfile = {
  business_name: string;
  phone: string;
  tagline: string;
  admin_email: string;
  about_en: string;
  about_es: string;
  about_image_url: string | null;
  instagram: string;
  facebook: string;
  tiktok: string;
};

export type OwnerProfilePreviewSnapshot = {
  business_name?: unknown;
  phone?: unknown;
  generated_copy?: unknown;
};

export type OwnerProfileTenantSnapshot = {
  phone?: unknown;
  admin_email?: unknown;
  [key: string]: unknown;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STRING_FIELDS = [
  "business_name",
  "phone",
  "tagline",
  "admin_email",
  "about_en",
  "about_es",
  "about_image_url",
  "instagram",
  "facebook",
  "tiktok",
] as const satisfies readonly (keyof OwnerProfileInput)[];

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isIpv4Literal(hostname: string): boolean {
  const octets = hostname.split(".").map(Number);
  return !(
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  );
}

function isPrivateOrLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.+$/, "").replace(/^\[|\]$/g, "");
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized === "::1"
  ) {
    return true;
  }

  return isIpv4Literal(normalized) || normalized.includes(":");
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password &&
      !isPrivateOrLocalHostname(url.hostname)
    );
  } catch {
    return false;
  }
}

function validateStringFields(
  input: OwnerProfileInput,
  errors: OwnerProfileError[],
): void {
  for (const field of STRING_FIELDS) {
    const value = input[field];
    if (value !== undefined && value !== null && typeof value !== "string") {
      errors.push({ field, reason: "must be a string" });
    }
  }
}

function parseParagraphs(
  value: unknown,
  field: string,
  errors: OwnerProfileError[],
): string[] {
  const text = trimmed(value);
  if (text.length > OWNER_PROFILE_LIMITS.aboutCharacters) {
    errors.push({
      field,
      reason: `max ${OWNER_PROFILE_LIMITS.aboutCharacters} characters`,
    });
  }

  const paragraphs = text
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length > OWNER_PROFILE_LIMITS.aboutParagraphs) {
    errors.push({
      field,
      reason: `max ${OWNER_PROFILE_LIMITS.aboutParagraphs} paragraphs`,
    });
  }

  return paragraphs;
}

export function paragraphsToText(value: unknown): string {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) return "";
  return value.join("\n\n");
}

export function ownerProfileToEditable(
  preview: OwnerProfilePreviewSnapshot,
  tenant: OwnerProfileTenantSnapshot,
): EditableOwnerProfile {
  const copy = isRecord(preview.generated_copy) ? preview.generated_copy : {};
  const en = isRecord(copy.en) ? copy.en : {};
  const es = isRecord(copy.es) ? copy.es : {};
  const sectionSettings = isRecord(copy.section_settings) ? copy.section_settings : {};
  const socialLinks = isRecord(copy.social_links) ? copy.social_links : {};
  const previewPhone = typeof preview.phone === "string" ? preview.phone : null;
  const tenantPhone = typeof tenant.phone === "string" ? tenant.phone : "";

  return {
    business_name:
      typeof preview.business_name === "string" ? preview.business_name : "",
    phone: previewPhone ?? tenantPhone,
    tagline: typeof en.hero_subheadline === "string" ? en.hero_subheadline : "",
    admin_email:
      typeof tenant.admin_email === "string" ? tenant.admin_email : "",
    about_en: paragraphsToText(en.about_paragraphs),
    about_es: paragraphsToText(es.about_paragraphs),
    about_image_url:
      typeof sectionSettings.about_image_url === "string"
        ? sectionSettings.about_image_url
        : null,
    instagram: socialLinkToDisplayValue(socialLinks.instagram, "instagram"),
    facebook: socialLinkToDisplayValue(socialLinks.facebook, "facebook"),
    tiktok: socialLinkToDisplayValue(socialLinks.tiktok, "tiktok"),
  };
}

export function parseOwnerProfileInput(input: OwnerProfileInput): OwnerProfileResult {
  const errors: OwnerProfileError[] = [];
  validateStringFields(input, errors);

  const businessName = trimmed(input.business_name);
  const phone = trimmed(input.phone);
  const tagline = trimmed(input.tagline);
  const adminEmail = trimmed(input.admin_email).toLowerCase();
  const aboutImageUrl = trimmed(input.about_image_url);

  if (
    (input.business_name === undefined ||
      input.business_name === null ||
      typeof input.business_name === "string") &&
    !businessName
  ) {
    errors.push({ field: "business_name", reason: "required" });
  }
  if (businessName.length > OWNER_PROFILE_LIMITS.businessName) {
    errors.push({
      field: "business_name",
      reason: `max ${OWNER_PROFILE_LIMITS.businessName} characters`,
    });
  }
  if (phone.length > OWNER_PROFILE_LIMITS.phone) {
    errors.push({
      field: "phone",
      reason: `max ${OWNER_PROFILE_LIMITS.phone} characters`,
    });
  }
  if (tagline.length > OWNER_PROFILE_LIMITS.tagline) {
    errors.push({
      field: "tagline",
      reason: `max ${OWNER_PROFILE_LIMITS.tagline} characters`,
    });
  }
  if (adminEmail && !EMAIL_RE.test(adminEmail)) {
    errors.push({ field: "admin_email", reason: "invalid email" });
  }
  if (aboutImageUrl && !isHttpsUrl(aboutImageUrl)) {
    errors.push({ field: "about_image_url", reason: "must be an https URL" });
  }

  const aboutEn = parseParagraphs(input.about_en, "about_en", errors);
  const aboutEs = parseParagraphs(input.about_es, "about_es", errors);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      business_name: businessName,
      phone: phone || null,
      tagline,
      admin_email: adminEmail || null,
      about_en: aboutEn,
      about_es: aboutEs,
      about_image_url: aboutImageUrl || null,
      social_links: buildSocialLinksPayload(input),
    },
  };
}

export function mergeOwnerProfileCopy(
  currentCopy: Record<string, unknown>,
  value: OwnerProfileValue,
): Record<string, unknown> {
  const currentEn = isRecord(currentCopy.en) ? currentCopy.en : {};
  const currentEs = isRecord(currentCopy.es) ? currentCopy.es : {};
  const currentSettings = isRecord(currentCopy.section_settings)
    ? currentCopy.section_settings
    : {};

  return {
    ...currentCopy,
    en: {
      ...currentEn,
      hero_subheadline: value.tagline,
      about_paragraphs: value.about_en,
    },
    es: {
      ...currentEs,
      about_paragraphs: value.about_es,
    },
    section_settings: {
      ...currentSettings,
      about_image_url: value.about_image_url,
    },
    social_links: value.social_links,
  };
}
