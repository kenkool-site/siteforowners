import Anthropic from "@anthropic-ai/sdk";
import type { BusinessType, GeneratedCopy, ServiceItem, ProductItem } from "./types";
import { buildSystemPrompt, buildUserPrompt } from "./prompts";

const anthropic = new Anthropic();

interface GenerateCopyParams {
  businessName: string;
  businessType: BusinessType;
  tagline?: string;
  description?: string;
  services: ServiceItem[];
  products?: ProductItem[];
  address?: string;
}

export interface CopyVariant {
  style: string;
  en: GeneratedCopy["en"];
  es: GeneratedCopy["es"];
}

export async function generateWebsiteCopyVariants(
  params: GenerateCopyParams
): Promise<CopyVariant[]> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 6000,
    system: buildSystemPrompt(params.businessType),
    messages: [
      {
        role: "user",
        content: buildUserPrompt({
          businessName: params.businessName,
          businessType: params.businessType,
          tagline: params.tagline,
          description: params.description,
          services: params.services,
          products: params.products,
          address: params.address,
        }),
      },
    ],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse AI response as JSON");
  }

  const parsed = JSON.parse(jsonMatch[0]) as { variants: CopyVariant[] };

  if (!parsed.variants || parsed.variants.length < 3) {
    throw new Error("AI response missing required variants");
  }

  // Validate each variant has en and es
  for (const variant of parsed.variants) {
    if (!variant.en || !variant.es) {
      throw new Error("AI response variant missing required language keys");
    }
  }

  return parsed.variants;
}
