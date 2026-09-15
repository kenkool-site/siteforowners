import Anthropic from "@anthropic-ai/sdk";
import { extractInvitationPalette } from "./palette";
import { DEFAULT_INVITATION_DESIGN_RECIPE, normalizeInvitationDesignRecipe, type InvitationDesignRecipe } from "./design-recipe";
import { EXTRACTED_FACT_KEYS, normalizeInvitationReferenceAnalysis, type InvitationReferenceAnalysis } from "./reference-analysis";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sampledPalette(palette: string[]): InvitationDesignRecipe["palette"] {
  return {
    ...DEFAULT_INVITATION_DESIGN_RECIPE.palette,
    background: palette[0] ?? DEFAULT_INVITATION_DESIGN_RECIPE.palette.background,
    surface: palette[0] ?? DEFAULT_INVITATION_DESIGN_RECIPE.palette.surface,
    text: palette[1] ?? DEFAULT_INVITATION_DESIGN_RECIPE.palette.text,
    mutedText: palette[1] ?? DEFAULT_INVITATION_DESIGN_RECIPE.palette.mutedText,
    accent: palette[2] ?? palette[1] ?? DEFAULT_INVITATION_DESIGN_RECIPE.palette.accent,
    overlay: palette[1] ?? DEFAULT_INVITATION_DESIGN_RECIPE.palette.overlay,
  };
}

/** Accept useful model fields one at a time; the strict normalizer remains the final gate. */
function repairRecipe(value: unknown, palette: string[]): InvitationDesignRecipe {
  let recipe: InvitationDesignRecipe = { ...structuredClone(DEFAULT_INVITATION_DESIGN_RECIPE), palette: sampledPalette(palette) };
  if (!isRecord(value)) return recipe;

  for (const section of ["typography", "composition", "frame", "decoration", "hero"] as const) {
    const proposed = value[section];
    if (!isRecord(proposed)) continue;
    for (const key of Object.keys(recipe[section])) {
      if (!(key in proposed)) continue;
      const candidate = structuredClone(recipe) as unknown as Record<string, unknown>;
      candidate[section] = { ...(candidate[section] as Record<string, unknown>), [key]: proposed[key] };
      const normalized = normalizeInvitationDesignRecipe(candidate);
      if (normalized.ok) recipe = normalized.value;
    }
  }
  if (Array.isArray(value.contentOrder)) {
    const normalized = normalizeInvitationDesignRecipe({ ...recipe, contentOrder: value.contentOrder });
    if (normalized.ok) recipe = normalized.value;
  }
  return recipe;
}

function repairFacts(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((fact) => {
    if (!isRecord(fact) || !EXTRACTED_FACT_KEYS.includes(fact.key as typeof EXTRACTED_FACT_KEYS[number]) || typeof fact.value !== "string" || !fact.value.trim() || typeof fact.confidence !== "number" || !Number.isFinite(fact.confidence)) return [];
    return [{
      key: fact.key,
      value: fact.value.trim().slice(0, 1000),
      confidence: fact.confidence,
      evidence: typeof fact.evidence === "string" ? fact.evidence.trim().slice(0, 160) : "",
    }];
  });
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
    facts: repairFacts(parsed.facts),
    paletteCandidates: palette,
    recipe: repairRecipe(parsed.recipe, palette),
  });
  if (!analysis) throw new Error("AI returned an invalid structured analysis");
  return analysis;
}
