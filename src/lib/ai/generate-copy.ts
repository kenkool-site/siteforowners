import Anthropic from "@anthropic-ai/sdk";
import type { BusinessType, GeneratedCopy, ServiceItem } from "./types";
import { buildSystemPrompt, buildUserPrompt } from "./prompts";

const anthropic = new Anthropic();

interface GenerateCopyParams {
  businessName: string;
  businessType: BusinessType;
  tagline?: string;
  services: ServiceItem[];
  address?: string;
}

export async function generateWebsiteCopy(
  params: GenerateCopyParams
): Promise<GeneratedCopy> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    system: buildSystemPrompt(params.businessType),
    messages: [
      {
        role: "user",
        content: buildUserPrompt({
          businessName: params.businessName,
          businessType: params.businessType,
          tagline: params.tagline,
          services: params.services,
          address: params.address,
        }),
      },
    ],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";

  // Extract JSON from response (handle potential markdown code blocks)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse AI response as JSON");
  }

  const parsed = JSON.parse(jsonMatch[0]) as GeneratedCopy;

  // Validate structure
  if (!parsed.en || !parsed.es) {
    throw new Error("AI response missing required language keys");
  }

  return parsed;
}
