import Anthropic from "@anthropic-ai/sdk";
import { extractInvitationPalette } from "./palette";
import { normalizeInvitationReferenceAnalysis, type InvitationReferenceAnalysis } from "./reference-analysis";

export const INVITATION_ANALYSIS_SCHEMA_VERSION = 1;
export const INVITATION_ANALYSIS_MODEL = "claude-haiku-4-5-20251001";

type Input = { bytes: Uint8Array; mediaType: "image/jpeg" | "image/png" | "image/webp"; referencePath: string };
type Dependencies = {
  extractPalette?(bytes: Uint8Array): Promise<string[]>;
  analyzeVision?(input: Input, palette: string[]): Promise<string>;
  now?(): Date;
};

const PROMPT = `Analyze this designed event invitation as a visual reference for a responsive web invitation.
Return ONLY one JSON object with keys "facts" and "recipe". Facts may use only title, honoreeNames, startsAt, venueName, address, description. Include only wording visibly supported by the image. Each fact is {key,value,confidence,evidence}; confidence is 0..1 and evidence is a short exact fragment. Omit absent facts and never infer logistics.
Recipe version is 1. Use only these values: display formal-script|editorial-serif|classic-serif|geometric-sans|humanist-sans; body classic-serif|humanist-sans|geometric-sans; composition framed|centered|asymmetric|editorial|layered; alignment left|center; rhythm compact|balanced|airy; hero placement top|center|bottom; frame none|line|double|botanical|ornamental; radius none|soft|rounded; motif none|botanical|floral|geometric|ribbon|ornamental; density minimal|balanced|rich; symmetry none|balanced|mirrored; divider none|line|dots|flourish; scale restrained|balanced|dramatic. Return six-digit hex colors. Never return HTML, CSS, class names, code, URLs, or font files.`;

async function anthropicVision(input: Input, palette: string[]): Promise<string> {
  const response = await new Anthropic().messages.create({
    model: INVITATION_ANALYSIS_MODEL,
    max_tokens: 2500,
    messages: [{ role: "user", content: [
      { type: "text", text: `${PROMPT}\nSampled palette: ${palette.join(", ")}` },
      { type: "image", source: { type: "base64", media_type: input.mediaType, data: Buffer.from(input.bytes).toString("base64") } },
    ] }],
  });
  const block = response.content.find((item) => item.type === "text");
  return block?.type === "text" ? block.text : "";
}

function parseObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { const value: unknown = JSON.parse(text.slice(start, end + 1)); return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
  catch { return null; }
}

export async function analyzeInvitationReference(input: Input, dependencies: Dependencies = {}): Promise<InvitationReferenceAnalysis> {
  const palette = await (dependencies.extractPalette ?? extractInvitationPalette)(input.bytes);
  const raw = await (dependencies.analyzeVision ?? anthropicVision)(input, palette);
  const parsed = parseObject(raw);
  if (!parsed) throw new Error("AI returned no valid structured analysis");
  const analysis = normalizeInvitationReferenceAnalysis({
    schemaVersion: INVITATION_ANALYSIS_SCHEMA_VERSION,
    referencePath: input.referencePath,
    model: INVITATION_ANALYSIS_MODEL,
    createdAt: (dependencies.now?.() ?? new Date()).toISOString(),
    facts: parsed.facts,
    paletteCandidates: palette,
    recipe: parsed.recipe,
  });
  if (!analysis) throw new Error("AI returned an invalid structured analysis");
  return analysis;
}
