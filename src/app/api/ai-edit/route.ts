export const maxDuration = 60;

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export async function POST(request: Request) {
  try {
    const { instructions, current_copy } = await request.json();

    if (!instructions || !current_copy) {
      return NextResponse.json({ error: "instructions and current_copy required" }, { status: 400 });
    }

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: `You are editing website copy for a small business. Apply the following instruction to the current copy and return the updated version.

INSTRUCTION: ${instructions}

CURRENT COPY (JSON):
${JSON.stringify(current_copy, null, 2)}

RULES:
- Only modify what the instruction asks for. Keep everything else exactly the same.
- Maintain the same JSON structure.
- Keep text natural and professional.
- If the instruction mentions a specific section (about, hero, services, footer), only modify that section.
- Return ONLY valid JSON — no explanation, no markdown.

Return the updated copy JSON:`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }

    const updatedCopy = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ success: true, copy: updatedCopy });
  } catch (error) {
    console.error("AI edit error:", error);
    return NextResponse.json({ error: "AI edit failed" }, { status: 500 });
  }
}
