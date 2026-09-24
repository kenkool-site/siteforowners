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
//
// Bilingual (English + Spanish) per this codebase's non-negotiable rule that
// user-facing behavior supports both languages - a denylist that only catches
// English category names is a real gap, not an English-only feature. Entries
// below are written in their post-normalization (accent-stripped, lowercase)
// form; see `normalizeForDenylist` - "religión" and "religion" collapse to
// the same token once diacritics are stripped, so a single entry covers both.
//
// Two tiers, deliberately:
//
// 1. DENYLIST_WORDS - bare words with no legitimate use as a modifier of
//    anything other than people (there is no innocent "Race Tea Ceremony" or
//    "Fat Garden Portraits"). Matching anywhere in the text is always unsafe.
//
// 2. PEOPLE_ADJACENT_TERMS - demonyms/nationalities, religions, disability,
//    and age-as-identity terms are NOT safe to bare-word-match, because they
//    double as ordinary adjectives for real wedding traditions and objects:
//    "Chinese Tea Ceremony", "Korean Paebaek Ceremony", "Mexican Folk Dance",
//    "Fine China and Table Settings", "La Misa Católica" (Catholic Mass),
//    "Senior Moments" are all legitimate, common category names that must
//    survive. What makes a term unsafe is not the word alone but the word
//    sitting next to a noun that refers to *people* ("Asian Guests",
//    "Invitados Asiáticos", "Senior Guests") - so these are matched only via
//    isPeopleAdjacentDenylistHit, which checks adjacency (either order, small
//    window) to PEOPLE_NOUNS, never as a bare-word hit on their own.
//    "black"/"white" (and Spanish "negro"/"blanco") use the same reasoning
//    but as literal phrases in DENYLIST_PHRASES instead (avoids "Black Tie",
//    "Black and White" decor theme).
//
// This cannot be an exhaustive list of every nationality/ethnicity/religion
// on Earth - that is a known, disclosed residual limitation, not a claim of
// completeness. The adjacency requirement is the real defense (it generalizes
// to demonyms never explicitly listed here, as long as the model phrases them
// as "<demonym> guests/family/..."); the word lists below are a backstop for
// the most common cases, reinforced by the system prompt's own instruction to
// the model never to name groups after personal traits.
const DENYLIST_WORDS = new Set([
  // race / ethnicity (English) - concept nouns, no innocent adjacent-noun
  // use the way a nationality adjective has ("Chinese Tea Ceremony"), so
  // these stay bare-word matched rather than adjacency-gated.
  "race",
  "racial",
  "races",
  "ethnicity",
  "ethnic",
  // race / ethnicity (Spanish)
  "raza",
  "etnia",
  // gender / sexuality inference (English; "gay"/"straight" deliberately
  // excluded from this bare list - see PEOPLE_ADJACENT_TERMS)
  "gender",
  "transgender",
  "cisgender",
  "nonbinary",
  "genderqueer",
  "lesbian",
  "bisexual",
  "queer",
  "heterosexual",
  "homosexual",
  "sexuality",
  "lgbtq",
  // gender / sexuality inference (Spanish)
  "genero",
  "transgenero",
  "lesbiana",
  "sexualidad",
  // body-shaming (English)
  "fat",
  "obese",
  "overweight",
  "skinny",
  "chubby",
  "underweight",
  // body-shaming (Spanish; "delgado"/"delgada" deliberately excluded - too
  // common as a surname (e.g. "The Delgado Family") to safely denylist)
  "gordo",
  "gorda",
  "gordos",
  "gordas",
  "obeso",
  "obesa",
  "obesos",
  "obesas",
  // generically demeaning (English)
  "ugly",
  "stupid",
  "dumb",
  "loser",
  "creepy",
  // generically demeaning (Spanish)
  "feo",
  "fea",
  "feos",
  "feas",
  "estupido",
  "estupida",
  "estupidos",
  "estupidas",
  "tonto",
  "tonta",
  "tontos",
  "tontas",
]);

// Terms that are unsafe *only* when adjacent to a people-referring noun -
// see the tier-2 explanation above. Explicit singular/plural and
// masculine/feminine Spanish inflections are enumerated rather than matched
// by stem/prefix: a naive prefix check (e.g. "indi" to catch "indio"/"india")
// risks matching unrelated Spanish words that happen to share a prefix
// ("indice", "indignado"), which is worse than a slightly longer list.
const PEOPLE_ADJACENT_TERMS = new Set([
  // ethnicity / nationality (English)
  "caucasian",
  "hispanic",
  "latino",
  "latina",
  "biracial",
  "asian",
  "african",
  "arab",
  "arabic",
  "indian",
  "chinese",
  "korean",
  "japanese",
  "filipino",
  "filipina",
  "mexican",
  "vietnamese",
  "nigerian",
  "dominican",
  "haitian",
  "israeli",
  // ethnicity / nationality (Spanish)
  "hispano",
  "hispana",
  "hispanos",
  "hispanas",
  "asiatico",
  "asiatica",
  "asiaticos",
  "asiaticas",
  "africano",
  "africana",
  "africanos",
  "africanas",
  "arabe",
  "arabes",
  "indio",
  "india",
  "indios",
  "indias",
  "chino",
  "china",
  "chinos",
  "chinas",
  "coreano",
  "coreana",
  "coreanos",
  "coreanas",
  "japones",
  "japonesa",
  "japoneses",
  "japonesas",
  "mexicano",
  "mexicana",
  "mexicanos",
  "mexicanas",
  "vietnamita",
  "vietnamitas",
  "nigeriano",
  "nigeriana",
  "nigerianos",
  "nigerianas",
  "dominicano",
  "dominicana",
  "dominicanos",
  "dominicanas",
  "haitiano",
  "haitiana",
  "haitianos",
  "haitianas",
  // "israeli" (English, above) is spelled identically to Spanish "israelí"
  // once the accent is stripped, so one entry covers both languages'
  // singular; only the Spanish plural needs its own entry.
  "israelies",
  // religion (English) - adjacency-gated, not bare-word, so real ceremony
  // names like "Jewish Chuppah Ceremony" / "La Misa Católica" (below) survive.
  // "religion"/"religious" also cover the accented Spanish "religión" once
  // normalizeForDenylist strips its diacritic - one entry for both languages.
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
  // religion (Spanish)
  "cristiano",
  "cristiana",
  "cristianos",
  "cristianas",
  "musulman",
  "musulmana",
  "musulmanes",
  "musulmanas",
  "judio",
  "judia",
  "judios",
  "judias",
  "budista",
  "budistas",
  "catolico",
  "catolica",
  "catolicos",
  "catolicas",
  "ateo",
  "atea",
  "ateos",
  "ateas",
  // disability inference (English)
  "disabled",
  "disability",
  "handicapped",
  // disability inference (Spanish)
  "discapacitado",
  "discapacitada",
  "discapacitados",
  "discapacitadas",
  "discapacidad",
  // age-inference-as-a-category (English; role-based groups like "Children"
  // are not denylisted - see note above). "Senior Moments" (an idiom, not a
  // photo grouping by age) must survive, hence adjacency-gated rather than
  // bare-word.
  "elderly",
  "senior",
  "geriatric",
  // age-inference-as-a-category (Spanish)
  "mayores",
  "ancianos",
  "ancianas",
  // gender/sexuality: "gay"/"straight" specifically (not the rest of the
  // gender/sexuality set above) - bare-word matching false-positives on
  // "Straight from the Heart" and idioms like it. Note this does not fully
  // resolve an analogous surname collision ("The Gay Family") since "family"
  // must remain a people-noun trigger for other terms (e.g. "Black Family");
  // that specific case is an accepted, disclosed residual limitation, not
  // silently different from before - it was already blocked pre-fix too.
  "gay",
  "straight",
]);

// People-referring nouns (English + Spanish) that make an adjacent
// PEOPLE_ADJACENT_TERMS hit unsafe. Checked in both orders - "Asian Guests"
// (adjective before noun, standard English) and "Invitados Asiáticos" (noun
// before adjective, standard Spanish) - within a small window so a single
// connector word ("Guests with Disability" / "Invitados con Discapacidad")
// doesn't defeat the check.
const PEOPLE_NOUNS = new Set([
  "guest",
  "guests",
  "attendee",
  "attendees",
  "family",
  "families",
  "people",
  "familia",
  "familias",
  "invitado",
  "invitados",
  "invitada",
  "invitadas",
  "asistente",
  "asistentes",
  "persona",
  "personas",
]);

// How many tokens apart an adjacent-term/people-noun pair may be and still
// count as "adjacent" - 1 catches direct adjacency ("asian guests"), 2
// tolerates one connector word in between ("guests with disability" /
// "invitados con discapacidad" / "senior citizen guests").
const PEOPLE_ADJACENCY_WINDOW = 2;

function isPeopleAdjacentDenylistHit(tokens: string[]): boolean {
  for (let i = 0; i < tokens.length; i++) {
    const isTerm = PEOPLE_ADJACENT_TERMS.has(tokens[i]);
    const isNoun = PEOPLE_NOUNS.has(tokens[i]);
    if (!isTerm && !isNoun) continue;

    for (let window = 1; window <= PEOPLE_ADJACENCY_WINDOW; window++) {
      const neighbor = tokens[i + window];
      if (!neighbor) continue;
      if (isTerm && PEOPLE_NOUNS.has(neighbor)) return true;
      if (isNoun && PEOPLE_ADJACENT_TERMS.has(neighbor)) return true;
    }
  }
  return false;
}

// "black"/"white" (and Spanish "negro"/"blanco") must be phrases, not
// standalone denylist words - as bare words they would false-positive on
// legitimate wedding-photo category names like "Black Tie" or a "Black and
// White" decor theme. Scoped narrowly to guest/attendee/family combinations.
const DENYLIST_PHRASES = [
  "old people",
  "young people",
  "plus size",
  "body type",
  "body shape",
  "sexual orientation",
  "orientacion sexual",
  "gender identity",
  "identidad de genero",
  "skin color",
  "skin tone",
  "color de piel",
  "tono de piel",
  "people of color",
  "gente de color",
  "personas de color",
  "black guests",
  "white guests",
  "black attendees",
  "white attendees",
  "black family",
  "white family",
  "invitados negros",
  "invitados blancos",
  "familia negra",
  "familia blanca",
];

// Strips diacritics (NFD-decompose, then drop the combining marks) so
// "Religión" normalizes to "religion" the same as its unaccented English
// cognate, instead of a naive `.toLowerCase()` alone silently splitting it
// into unrelated tokens at the accented character.
function normalizeForDenylist(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function containsDenylistedContent(...parts: Array<string | null>): boolean {
  const normalized = normalizeForDenylist(parts.filter((part): part is string => Boolean(part)).join(" "));
  // Collapse everything but letters into single spaces so hyphenated or
  // punctuated forms ("black-guests") are checked identically to spaced
  // ones ("black guests"), for both the phrase and word-token checks below.
  const spaced = normalized.replace(/[^a-z]+/g, " ").trim();
  if (DENYLIST_PHRASES.some((phrase) => spaced.includes(phrase))) return true;

  const tokens = spaced.split(" ").filter(Boolean);
  if (tokens.some((token) => DENYLIST_WORDS.has(token))) return true;

  return isPeopleAdjacentDenylistHit(tokens);
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

// Canonicalizes a semantic key so casing/punctuation drift from the model
// ("Cake Cutting" vs "cake-cutting" vs "cake_cutting" vs "Cocina Piñón") all
// collapse to the same literal string: decompose and strip diacritics first
// (so accented input transliterates - "Piñón" -> "pinon" - rather than
// having its accented letters silently deleted by the character-allowlist
// step that follows), lowercase, strip everything but alphanumerics and
// whitespace/hyphens/underscores, collapse whitespace/hyphen/underscore runs
// to a single hyphen, trim leading/trailing hyphens. This is the plan's
// "normalized semantic keys" requirement - applied identically at the
// merge-lookup point and to the final emitted value for a *newly proposed*
// key, so the key that goes into the merge Map is always exactly the key
// that comes out (no separate normalization step for comparison vs. output
// that could silently diverge). An existing group's own semantic key is
// reused verbatim, never re-slugified, when a proposal strong-matches it -
// see the call site - so an already-persisted key survives regeneration
// exactly as stored even if it predates this function or uses a different
// convention.
function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

  // Keyed by slugified (canonicalized) semantic key so duplicate/near-
  // duplicate groups the model returns under casing/punctuation variants of
  // the same key ("Cake Cutting" vs "cake-cutting") merge instead of
  // colliding later at the (event_id, source, semantic_key) uniqueness
  // boundary.
  const merged = new Map<string, HighlightProposal>();

  for (const raw of parsed.groups as RawDynamicGroup[]) {
    if (!raw || typeof raw !== "object") continue;
    if (typeof raw.semanticKey !== "string" || typeof raw.name !== "string") continue;

    const semanticKeySlug = slugify(clip(raw.semanticKey, MAX_SEMANTIC_KEY_LENGTH));
    const name = clip(raw.name, MAX_NAME_LENGTH);
    if (!semanticKeySlug || !name) continue;

    const description =
      typeof raw.description === "string" && raw.description.trim().length > 0
        ? clip(raw.description, MAX_DESCRIPTION_LENGTH)
        : null;

    // Sensitive/identity-inference category names are excluded outright -
    // never partially sanitized or renamed, just dropped.
    if (containsDenylistedContent(semanticKeySlug, name, description)) continue;

    const rawMediaIds = Array.isArray(raw.mediaIds) ? raw.mediaIds : [];
    const mediaIds = Array.from(
      new Set(rawMediaIds.filter((id): id is string => typeof id === "string" && knownMediaIds.has(id))),
    );
    if (mediaIds.length === 0) continue;

    // Strong-match preservation: existing groups carry no membership here,
    // so the only evidence available to compare a freshly proposed group
    // against an already-persisted one is textual. Treat an exact match
    // (after slugifying the key, and trim/lowercase-normalizing the name) of
    // either the semantic key or the display name as "the same group" -
    // covers both the case where the model keeps the key but rewords the
    // name, and the case where it keeps the name but drifts the key format.
    // When matched, the persisted group's key and name win over whatever the
    // model returned this round, so a host-renamed group's label - and the
    // persisted row Task 4 will reuse by semantic key - survive regeneration
    // untouched.
    const strongMatch = input.existingGroups.find(
      (group) => slugify(group.semanticKey) === semanticKeySlug || normalizeKey(group.name) === normalizeKey(name),
    );
    // A strong-matched existing key is reused verbatim, NOT re-slugified -
    // it is already a persisted row's exact identity (which may predate this
    // function or use its own convention, e.g. "cake_cutting"), and
    // re-slugifying it here (e.g. to "cakecutting", since slugify treats "_"
    // as a separator to collapse rather than something to preserve) would
    // produce a key that no longer equals the persisted row, defeating the
    // entire point of preserving identity across regenerations. Only a
    // brand-new key (no strong match) is slugified.
    const resolvedKey = strongMatch ? strongMatch.semanticKey : semanticKeySlug;
    const resolvedName = strongMatch ? strongMatch.name : name;

    const existingProposal = merged.get(resolvedKey);
    if (existingProposal) {
      for (const mediaId of mediaIds) {
        if (!existingProposal.mediaIds.includes(mediaId)) existingProposal.mediaIds.push(mediaId);
      }
      continue;
    }

    merged.set(resolvedKey, {
      semanticKey: resolvedKey,
      name: resolvedName,
      description,
      source: "ai_generated",
      mediaIds,
    });
  }

  // Second pass: two surviving groups can still carry different semantic
  // keys yet an identical (or whitespace/casing-only different) display
  // name - e.g. {key:"cake", name:"Cake"} and {key:"the-cake", name:"Cake"}
  // on a first-ever generation, where there is no existing-groups list to
  // snap either of them against. The plan requires "4-8 distinct" groups;
  // two identically-labeled guest-facing tabs is not distinct, so merge on
  // normalized name too, keeping whichever entry was encountered first.
  const byName = new Map<string, HighlightProposal>();
  for (const proposal of Array.from(merged.values())) {
    const nameKey = normalizeKey(proposal.name);
    const existingByName = byName.get(nameKey);
    if (existingByName) {
      for (const mediaId of proposal.mediaIds) {
        if (!existingByName.mediaIds.includes(mediaId)) existingByName.mediaIds.push(mediaId);
      }
      continue;
    }
    byName.set(nameKey, proposal);
  }

  const proposals = Array.from(byName.values());
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
