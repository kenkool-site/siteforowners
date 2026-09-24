// src/lib/invitations/memories/highlight-generator.ts
//
// Anthropic-backed "smart half" of AI Highlight grouping. Task 2's
// classifyFallbackHighlights (fixed 9-category dictionary) and
// classifyIntoHostGroups (deterministic exact-match pre-filter) cover the
// cheap, no-network cases. This module covers the two cases that genuinely
// need a model: deriving 4-8 dynamic, event-specific groups once an event
// has enough approved media (classifyFallbackHighlights' floor lives in
// ./highlight-classifier, not here — this module is unconditionally
// "smart" and never itself decides whether it should run), and fuzzily
// assigning photos into a host's own named galleries for cases the
// exact-match pre-filter misses.
//
// No raw image bytes are ever sent here or anywhere in this module — only
// the already-extracted MemoryMediaDescriptor labels, per the plan's
// constraint that regrouping consumes stored descriptors.
//
// The `generateText` dependency is the entire seam to Anthropic: production
// code only reaches Anthropic through `defaultGenerateText` below, and every
// test in highlight-generator.test.ts injects its own fake, so no test run
// ever constructs a real client or makes a network call.
import Anthropic from "@anthropic-ai/sdk";
import type { HighlightAssignment, HighlightProposal } from "./highlight-classifier";
import type { MemoryHighlightGroup, MemoryMediaDescriptor } from "./highlight-types";

const MODEL = "claude-haiku-4-5-20251001";

// Per the plan's dynamic-generation contract: "produce four to eight
// distinct, guest-friendly groups."
const MIN_DYNAMIC_GROUPS = 4;
const MAX_DYNAMIC_GROUPS = 8;

// Bounded text lengths: keep AI-authored copy short enough to render as a
// gallery tab/label without layout breakage, regardless of what the model
// returns.
const MAX_NAME_LENGTH = 60;
const MAX_DESCRIPTION_LENGTH = 200;
const MAX_SEMANTIC_KEY_LENGTH = 60;

// Labels below this confidence are omitted from the prompt entirely - noise
// that would only bloat the request without helping the model. Matches the
// same floor the deterministic classifiers use (MIN_LABEL_CONFIDENCE in
// ./highlight-classifier).
const MIN_PROMPT_LABEL_CONFIDENCE = 0.6;

export interface GenerateDynamicHighlightsInput {
  descriptors: MemoryMediaDescriptor[];
  existingGroups: MemoryHighlightGroup[];
}

export interface GenerateHostDefinedAssignmentsInput {
  descriptors: MemoryMediaDescriptor[];
  groups: MemoryHighlightGroup[];
}

// The injectable provider boundary. Tests always supply their own
// `generateText`; production code omits it and falls back to
// `defaultGenerateText`, which is the only place this module talks to
// Anthropic.
export interface HighlightGeneratorDependencies {
  generateText?: (request: { system: string; prompt: string }) => Promise<string>;
}

let anthropicClient: Anthropic | undefined;

// Lazily constructed so merely importing this module - or running its
// tests, all of which inject a fake generateText - never requires
// ANTHROPIC_API_KEY to be set and never touches the network.
function getAnthropicClient(): Anthropic {
  if (!anthropicClient) anthropicClient = new Anthropic();
  return anthropicClient;
}

async function defaultGenerateText(request: { system: string; prompt: string }): Promise<string> {
  const message = await getAnthropicClient().messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: request.system,
    messages: [{ role: "user", content: request.prompt }],
  });
  const block = message.content[0];
  return block?.type === "text" ? block.text : "";
}

// ---------------------------------------------------------------------------
// Denylist
//
// These are photo *groupings* shown to every guest at someone's event - a
// label that sorts people by a protected or otherwise personal trait (race,
// religion, gender/sexuality, body type, age-as-a-judgment, disability),
// rather than by what is happening in the photo, is never an appropriate
// highlight category, however accurate the underlying descriptor labels
// might be. Scope is deliberately narrow to the group names/descriptions the
// model invents - it does not touch the underlying descriptor labels
// (opaque detection tags this system never displays directly), and it does
// not apply to host-defined mode, where the category names come from the
// host, not the model. Role-based groups like "Children" are intentionally
// not denylisted - they describe who is *in* the photo for wayfinding
// purposes, not a judgment about them; "Elderly Guests" or "Overweight
// Guests" would be judgmental/segregating in a way "Children" is not.
// ---------------------------------------------------------------------------
const DENYLIST_WORDS = new Set([
  // race / ethnicity
  "race",
  "racial",
  "races",
  "ethnicity",
  "ethnic",
  "caucasian",
  "hispanic",
  "latino",
  "latina",
  "biracial",
  // religion
  "religion",
  "religious",
  "christian",
  "christians",
  "muslim",
  "muslims",
  "jewish",
  "jew",
  "jews",
  "hindu",
  "buddhist",
  "atheist",
  "atheists",
  "catholic",
  "catholics",
  // gender / sexuality inference
  "gender",
  "transgender",
  "cisgender",
  "nonbinary",
  "genderqueer",
  "gay",
  "lesbian",
  "bisexual",
  "straight",
  "queer",
  "heterosexual",
  "homosexual",
  "sexuality",
  "lgbtq",
  // body-shaming
  "fat",
  "obese",
  "overweight",
  "skinny",
  "chubby",
  "underweight",
  // age-inference-as-a-category (role-based groups like "Children" are not
  // denylisted - see note above)
  "elderly",
  "geriatric",
  // disability inference
  "disabled",
  "disability",
  "handicapped",
  // generically demeaning
  "ugly",
  "stupid",
  "dumb",
  "loser",
  "creepy",
]);

const DENYLIST_PHRASES = [
  "old people",
  "young people",
  "plus size",
  "body type",
  "body shape",
  "sexual orientation",
  "gender identity",
  "skin color",
  "skin tone",
  "people of color",
];

function containsDenylistedContent(...parts: Array<string | null>): boolean {
  const text = parts
    .filter((part): part is string => Boolean(part))
    .join(" ")
    .toLowerCase();
  if (DENYLIST_PHRASES.some((phrase) => text.includes(phrase))) return true;

  const tokens = text.split(/[^a-z]+/).filter(Boolean);
  return tokens.some((token) => DENYLIST_WORDS.has(token));
}

// ---------------------------------------------------------------------------
// JSON extraction
// ---------------------------------------------------------------------------

// Scans for the first balanced top-level {...} object in `text`, ignoring
// braces inside string literals. The model is asked to respond with JSON
// only, but this tolerates stray leading/trailing prose without the failure
// mode of a naive greedy regex (which would swallow trailing text as if it
// were part of the object, or silently pick the wrong closing brace).
function extractFirstJsonObject(text: string): string {
  const start = text.indexOf("{");
  if (start === -1) {
    throw new Error("AI response did not contain a JSON object");
  }

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (char === "\\") {
      escapeNext = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  throw new Error("AI response contained an incomplete JSON object");
}

function parseJsonResponse(text: string): unknown {
  const jsonText = extractFirstJsonObject(text);
  try {
    return JSON.parse(jsonText);
  } catch {
    throw new Error("Failed to parse AI response as JSON");
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function clip(value: string, maxLength: number): string {
  const trimmed = value.trim();
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function formatDescriptorsForPrompt(descriptors: MemoryMediaDescriptor[]): string {
  return descriptors
    .map((descriptor) => {
      const labels = descriptor.labels
        .filter((label) => label.confidence >= MIN_PROMPT_LABEL_CONFIDENCE)
        .map((label) => `${label.name} (${label.confidence.toFixed(2)})`)
        .join(", ");
      return `- ${descriptor.mediaId}: ${labels || "(no labels)"}`;
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// Dynamic grouping
// ---------------------------------------------------------------------------

const DYNAMIC_SYSTEM_PROMPT = `You group event photos into a small number of thematic highlight galleries for a wedding or celebration website.

You are given a compact list of photo descriptors (an id and its content labels with confidence scores) and, optionally, a list of already-published highlight groups from a previous run.

Respond with a single JSON object and nothing else, in exactly this shape:
{"groups":[{"semanticKey":"kebab-case-id","name":"Guest-Facing Title","description":"One short sentence.","mediaIds":["id1","id2"]}]}

Rules:
- Produce between 4 and 8 groups.
- Every id in "mediaIds" must be one of the ids given to you in the photo descriptor list.
- A photo may appear in more than one group when it genuinely fits more than one theme.
- Name groups after the moment or activity shown (e.g. "Cake Cutting", "Dance Floor", "Family Portraits") - never after the race, ethnicity, religion, gender, sexual orientation, age bracket, body type, disability, or any other personal trait of the people in the photos.
- Do not return two groups that mean the same thing; merge overlapping ideas into one group.
- If a group you are about to propose matches the theme of one of the "Existing groups" listed below, reuse that group's exact "semanticKey" and "name" instead of inventing new ones.
- Respond with only the JSON object - no other text before or after it.`;

function buildDynamicPrompt(descriptors: MemoryMediaDescriptor[], existingGroups: MemoryHighlightGroup[]): string {
  const existingGroupsText =
    existingGroups.length === 0
      ? "(none)"
      : existingGroups.map((group) => `- key: ${group.semanticKey}, name: ${group.name}`).join("\n");

  return `Existing groups:\n${existingGroupsText}\n\nPhoto descriptors:\n${formatDescriptorsForPrompt(descriptors)}`;
}

interface RawDynamicGroup {
  semanticKey?: unknown;
  name?: unknown;
  description?: unknown;
  mediaIds?: unknown;
}

export async function generateDynamicHighlights(
  input: GenerateDynamicHighlightsInput,
  dependencies: HighlightGeneratorDependencies = {},
): Promise<HighlightProposal[]> {
  const generateText = dependencies.generateText ?? defaultGenerateText;
  const knownMediaIds = new Set(input.descriptors.map((descriptor) => descriptor.mediaId));

  const responseText = await generateText({
    system: DYNAMIC_SYSTEM_PROMPT,
    prompt: buildDynamicPrompt(input.descriptors, input.existingGroups),
  });

  const parsed = parseJsonResponse(responseText) as { groups?: unknown };
  if (!Array.isArray(parsed.groups)) {
    throw new Error("AI response missing a 'groups' array");
  }

  // Keyed by normalized semantic key so duplicate/near-duplicate groups the
  // model returns under the same key merge instead of colliding later at
  // the (event_id, source, semantic_key) uniqueness boundary.
  const merged = new Map<string, HighlightProposal>();

  for (const raw of parsed.groups as RawDynamicGroup[]) {
    if (!raw || typeof raw !== "object") continue;
    if (typeof raw.semanticKey !== "string" || typeof raw.name !== "string") continue;

    const semanticKey = clip(raw.semanticKey, MAX_SEMANTIC_KEY_LENGTH);
    const name = clip(raw.name, MAX_NAME_LENGTH);
    if (!semanticKey || !name) continue;

    const description =
      typeof raw.description === "string" && raw.description.trim().length > 0
        ? clip(raw.description, MAX_DESCRIPTION_LENGTH)
        : null;

    // Sensitive/identity-inference category names are excluded outright -
    // never partially sanitized or renamed, just dropped.
    if (containsDenylistedContent(semanticKey, name, description)) continue;

    const rawMediaIds = Array.isArray(raw.mediaIds) ? raw.mediaIds : [];
    const mediaIds = Array.from(
      new Set(rawMediaIds.filter((id): id is string => typeof id === "string" && knownMediaIds.has(id))),
    );
    if (mediaIds.length === 0) continue;

    // Strong-match preservation: existing groups carry no membership here,
    // so the only evidence available to compare a freshly proposed group
    // against an already-persisted one is textual. Treat an exact match
    // (after trim/lowercase normalization) of either the semantic key or
    // the display name as "the same group" - covers both the case where
    // the model keeps the key but rewords the name, and the case where it
    // keeps the name but drifts the key format. When matched, the
    // persisted group's key and name win over whatever the model returned
    // this round, so a host-renamed group's label - and the persisted row
    // Task 4 will reuse by semantic key - survive regeneration untouched.
    const strongMatch = input.existingGroups.find(
      (group) =>
        normalizeKey(group.semanticKey) === normalizeKey(semanticKey) ||
        normalizeKey(group.name) === normalizeKey(name),
    );
    const resolvedKey = strongMatch ? strongMatch.semanticKey : semanticKey;
    const resolvedName = strongMatch ? strongMatch.name : name;

    const mergeKey = normalizeKey(resolvedKey);
    const existingProposal = merged.get(mergeKey);
    if (existingProposal) {
      for (const mediaId of mediaIds) {
        if (!existingProposal.mediaIds.includes(mediaId)) existingProposal.mediaIds.push(mediaId);
      }
      continue;
    }

    merged.set(mergeKey, {
      semanticKey: resolvedKey,
      name: resolvedName,
      description,
      source: "ai_generated",
      mediaIds,
    });
  }

  const proposals = Array.from(merged.values());
  if (proposals.length < MIN_DYNAMIC_GROUPS || proposals.length > MAX_DYNAMIC_GROUPS) {
    throw new Error(
      `AI response produced ${proposals.length} valid group(s); expected between ${MIN_DYNAMIC_GROUPS} and ${MAX_DYNAMIC_GROUPS}`,
    );
  }

  return proposals;
}

// ---------------------------------------------------------------------------
// Host-defined classification
// ---------------------------------------------------------------------------

const HOST_SYSTEM_PROMPT = `You assign event photos to a host's own named highlight galleries for a wedding or celebration website.

You are given the exact list of galleries (id, name, and an optional description) and a compact list of photo descriptors (an id and its content labels with confidence scores).

Respond with a single JSON object and nothing else, in exactly this shape:
{"assignments":[{"groupId":"<one of the gallery ids given to you>","mediaIds":["id1","id2"]}]}

Rules:
- Only use "groupId" values from the gallery list given to you - never invent a new one.
- A photo may be assigned to zero, one, or multiple galleries; only assign it where it genuinely matches that gallery's name or description.
- Every id in "mediaIds" must be one of the ids given to you in the photo descriptor list.
- Respond with only the JSON object - no other text before or after it.`;

function buildHostPrompt(descriptors: MemoryMediaDescriptor[], groups: MemoryHighlightGroup[]): string {
  const galleriesText = groups
    .map((group) => `- id: ${group.id}, name: ${group.name}, description: ${group.description ?? "(none)"}`)
    .join("\n");

  return `Galleries:\n${galleriesText}\n\nPhoto descriptors:\n${formatDescriptorsForPrompt(descriptors)}`;
}

interface RawAssignmentGroup {
  groupId?: unknown;
  mediaIds?: unknown;
}

export async function generateHostDefinedAssignments(
  input: GenerateHostDefinedAssignmentsInput,
  dependencies: HighlightGeneratorDependencies = {},
): Promise<HighlightAssignment[]> {
  const generateText = dependencies.generateText ?? defaultGenerateText;
  const knownMediaIds = new Set(input.descriptors.map((descriptor) => descriptor.mediaId));
  const knownGroupIds = new Set(input.groups.map((group) => group.id));

  const responseText = await generateText({
    system: HOST_SYSTEM_PROMPT,
    prompt: buildHostPrompt(input.descriptors, input.groups),
  });

  const parsed = parseJsonResponse(responseText) as { assignments?: unknown };
  if (!Array.isArray(parsed.assignments)) {
    throw new Error("AI response missing an 'assignments' array");
  }

  const seenPairs = new Set<string>();
  const assignments: HighlightAssignment[] = [];

  for (const raw of parsed.assignments as RawAssignmentGroup[]) {
    if (!raw || typeof raw !== "object") continue;
    if (typeof raw.groupId !== "string" || !knownGroupIds.has(raw.groupId)) continue;

    const rawMediaIds = Array.isArray(raw.mediaIds) ? raw.mediaIds : [];
    for (const mediaId of rawMediaIds) {
      if (typeof mediaId !== "string" || !knownMediaIds.has(mediaId)) continue;

      const pairKey = `${raw.groupId}:${mediaId}`;
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);

      assignments.push({ groupId: raw.groupId, mediaId });
    }
  }

  return assignments;
}
