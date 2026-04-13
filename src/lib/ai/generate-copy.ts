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
  const callClaude = async (attempt = 0): Promise<Anthropic.Message> => {
    try {
      return await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 5000,
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
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if ((status === 529 || status === 503 || status === 500) && attempt < 2) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        return callClaude(attempt + 1);
      }
      throw err;
    }
  };

  const message = await callClaude();

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";

  // Check if response was truncated
  if (message.stop_reason === "max_tokens") {
    console.warn("AI response was truncated — max_tokens reached");
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse AI response as JSON");
  }

  const jsonStr = jsonMatch[0];

  // Attempt to repair truncated JSON by closing open structures
  let parsed: { variants: CopyVariant[] };
  try {
    parsed = JSON.parse(jsonStr) as { variants: CopyVariant[] };
  } catch {
    // Try to repair: close any unclosed strings, objects, arrays
    let repaired = jsonStr;
    // Remove trailing incomplete string value
    repaired = repaired.replace(/,\s*"[^"]*":\s*"[^"]*$/, "");
    repaired = repaired.replace(/,\s*"[^"]*$/, "");
    // Close open structures
    const opens = (repaired.match(/\{/g) || []).length;
    const closes = (repaired.match(/\}/g) || []).length;
    const openBrackets = (repaired.match(/\[/g) || []).length;
    const closeBrackets = (repaired.match(/\]/g) || []).length;
    repaired += "]".repeat(Math.max(0, openBrackets - closeBrackets));
    repaired += "}".repeat(Math.max(0, opens - closes));
    parsed = JSON.parse(repaired) as { variants: CopyVariant[] };
  }

  if (!parsed.variants || parsed.variants.length < 2) {
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
