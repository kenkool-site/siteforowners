import { normalizeInvitationDesignRecipe, type InvitationDesignRecipe } from "./design-recipe";

export const EXTRACTED_FACT_KEYS = ["title", "honoreeNames", "startsAt", "venueName", "address", "description", "styleNote"] as const;
export type ExtractedFactKey = typeof EXTRACTED_FACT_KEYS[number];
export type ExtractedFact = { key: ExtractedFactKey; value: string; confidence: number; evidence: string };
export type ExtractedEventColor = { name: string; color: string; confidence: number; evidence: string };
export type InvitationReferenceAnalysis = {
  schemaVersion: 3;
  referencePath: string;
  model: string;
  createdAt: string;
  facts: ExtractedFact[];
  paletteCandidates: string[];
  eventColors: ExtractedEventColor[];
  recipe: InvitationDesignRecipe;
};

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isPath = (value: unknown) => typeof value === "string" && /^[0-9a-f-]+\/designed_invite\/[A-Za-z0-9._-]+$/i.test(value);
const hex = (value: unknown) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : null;

export function normalizeInvitationReferenceAnalysis(input: unknown): InvitationReferenceAnalysis | null {
  if (!isRecord(input) || (input.schemaVersion !== 2 && input.schemaVersion !== 3) || !isPath(input.referencePath) || typeof input.model !== "string" || input.model.length > 100 || typeof input.createdAt !== "string" || Number.isNaN(Date.parse(input.createdAt)) || !Array.isArray(input.facts) || !Array.isArray(input.paletteCandidates)) return null;
  const facts: ExtractedFact[] = [];
  for (const fact of input.facts) {
    if (!isRecord(fact) || !EXTRACTED_FACT_KEYS.includes(fact.key as ExtractedFactKey) || typeof fact.value !== "string" || !fact.value.trim() || fact.value.length > 1000 || typeof fact.confidence !== "number" || !Number.isFinite(fact.confidence) || typeof fact.evidence !== "string" || fact.evidence.length > 160) return null;
    facts.push({ key: fact.key as ExtractedFactKey, value: fact.value.trim(), confidence: Math.min(1, Math.max(0, fact.confidence)), evidence: fact.evidence.trim() });
  }
  const paletteCandidates = input.paletteCandidates.map(hex);
  if (paletteCandidates.some((value) => !value)) return null;
  const eventColors: ExtractedEventColor[] = [];
  const proposedColors = input.schemaVersion === 3 && Array.isArray(input.eventColors) ? input.eventColors : [];
  for (const item of proposedColors.slice(0, 8)) {
    if (!isRecord(item) || typeof item.name !== "string" || !item.name.trim() || item.name.trim().length > 60 || typeof item.confidence !== "number" || !Number.isFinite(item.confidence) || typeof item.evidence !== "string" || item.evidence.length > 160) continue;
    const color = hex(item.color);
    if (!color) continue;
    eventColors.push({ name: item.name.trim(), color, confidence: Math.min(1, Math.max(0, item.confidence)), evidence: item.evidence.trim() });
  }
  const recipe = normalizeInvitationDesignRecipe(input.recipe);
  if (!recipe.ok) return null;
  return { schemaVersion: 3, referencePath: input.referencePath as string, model: input.model as string, createdAt: new Date(input.createdAt as string).toISOString(), facts, paletteCandidates: Array.from(new Set(paletteCandidates as string[])).slice(0, 8), eventColors, recipe: recipe.value };
}
