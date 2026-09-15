export const MAX_INVITATION_ADDITIONAL_SECTIONS = 8;
export const MAX_INVITATION_SECTION_HEADING_LENGTH = 80;
export const MAX_INVITATION_SECTION_CONTENT_LENGTH = 2000;

export type InvitationAdditionalSection = {
  heading: string;
  content: string;
};

export type AdditionalSectionsParseResult =
  | { ok: true; value: InvitationAdditionalSection[] }
  | { ok: false; error: string };

export function parseInvitationAdditionalSections(value: unknown): AdditionalSectionsParseResult {
  if (!Array.isArray(value) || value.length > MAX_INVITATION_ADDITIONAL_SECTIONS) {
    return { ok: false, error: "Add no more than 8 additional sections." };
  }

  const sections: InvitationAdditionalSection[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, error: "Complete or remove each additional section." };
    }
    const heading = typeof (item as Record<string, unknown>).heading === "string"
      ? ((item as Record<string, unknown>).heading as string).trim()
      : "";
    const content = typeof (item as Record<string, unknown>).content === "string"
      ? ((item as Record<string, unknown>).content as string).trim()
      : "";

    if (!heading && !content) continue;
    if (!heading || !content) return { ok: false, error: "Complete or remove each additional section." };
    if (heading.length > MAX_INVITATION_SECTION_HEADING_LENGTH) {
      return { ok: false, error: "Keep each section heading under 80 characters." };
    }
    if (content.length > MAX_INVITATION_SECTION_CONTENT_LENGTH) {
      return { ok: false, error: "Keep each section under 2,000 characters." };
    }
    sections.push({ heading, content });
  }

  return { ok: true, value: sections };
}

export function normalizeInvitationAdditionalSections(value: unknown): InvitationAdditionalSection[] {
  const parsed = parseInvitationAdditionalSections(value);
  return parsed.ok ? parsed.value : [];
}
