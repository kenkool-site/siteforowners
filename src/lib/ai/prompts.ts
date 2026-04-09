import type { BusinessType } from "./types";

const TONE_GUIDELINES: Record<BusinessType, string> = {
  salon:
    "Warm, personal, empowering, and community-rooted. Speak like a trusted friend who makes you feel beautiful. Celebrate self-care and confidence.",
  barbershop:
    "Confident, clean, masculine, and rooted in neighborhood pride. Speak like a trusted craftsman. Celebrate precision and looking sharp.",
  restaurant:
    "Inviting, appetizing, and rooted in family and neighborhood. Speak like a warm host welcoming you to their table. Celebrate flavor and community.",
  nails:
    "Fun, playful, glamorous, and focused on self-care. Speak like a friend who makes pampering exciting. Celebrate beauty and treating yourself.",
  braids:
    "Cultural, vibrant, proud, and empowering. Speak like a skilled artist who honors tradition. Celebrate heritage, beauty, and the art of braiding.",
};

export function buildSystemPrompt(businessType: BusinessType): string {
  return `You are a professional website copywriter specializing in small business websites.
You write compelling, authentic content that connects with local customers.

TONE: ${TONE_GUIDELINES[businessType]}

RULES:
- Write in a warm, human voice — never robotic or corporate
- Keep sentences short and punchy
- Reference the local community/neighborhood when the address is provided
- Service descriptions should be 1-2 sentences max — highlight the experience, not just the task
- The about section should tell a story, not list facts
- All content must feel personal and specific to THIS business
- Output must be in BOTH English and Spanish
- Spanish should be natural Latin American Spanish, not textbook — the kind spoken in NYC neighborhoods`;
}

export function buildUserPrompt(params: {
  businessName: string;
  businessType: BusinessType;
  tagline?: string;
  description?: string;
  services: { name: string; price: string }[];
  address?: string;
}): string {
  const serviceList = params.services
    .map((s) => `- ${s.name} (${s.price})`)
    .join("\n");

  return `Generate website copy for this business:

BUSINESS NAME: ${params.businessName}
TYPE: ${params.businessType}
${params.description ? `BUSINESS DESCRIPTION: ${params.description}` : ""}
${params.tagline ? `TAGLINE PREFERENCE: ${params.tagline}` : ""}
${params.address ? `ADDRESS: ${params.address}` : ""}

SERVICES:
${serviceList}

Generate the following in BOTH English (en) and Spanish (es):

1. hero_headline — A bold, attention-grabbing headline (under 10 words)
2. hero_subheadline — Supporting text (1 sentence, under 20 words)
3. about_paragraphs — 2-3 paragraphs telling the business story (each 2-3 sentences)
4. service_descriptions — A short description for EACH service listed above (1-2 sentences each). Use the exact service names as keys.
5. seo_title — Page title for search engines (under 60 chars)
6. seo_description — Meta description for search engines (under 160 chars)
7. footer_tagline — A short memorable phrase (under 8 words)
8. google_business_description — A description for Google Business Profile (2-3 sentences)

IMPORTANT: Return ONLY valid JSON matching this exact structure:
{
  "en": {
    "hero_headline": "...",
    "hero_subheadline": "...",
    "about_paragraphs": ["...", "..."],
    "service_descriptions": {"Service Name": "..."},
    "seo_title": "...",
    "seo_description": "...",
    "footer_tagline": "...",
    "google_business_description": "..."
  },
  "es": {
    "hero_headline": "...",
    "hero_subheadline": "...",
    "about_paragraphs": ["...", "..."],
    "service_descriptions": {"Service Name": "..."},
    "seo_title": "...",
    "seo_description": "...",
    "footer_tagline": "...",
    "google_business_description": "..."
  }
}`;
}
