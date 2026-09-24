// src/lib/invitations/memories/highlight-classifier.ts
//
// Pure classification and generation-policy logic for the AI Highlight
// system. No database or network access lives here — this module only turns
// already-fetched descriptors into proposed groupings and decides whether a
// new generation run is warranted. The Anthropic-backed dynamic classifier
// (used once an event has >= 8 approved photos) is a separate concern built
// in a later task; this file only covers the general-purpose fallback used
// below that floor (or when dynamic classification is unavailable) and the
// deterministic host-defined-group matcher that runs ahead of any AI call.
import type { HighlightGroupSource, MemoryHighlightGroup, MemoryMediaDescriptor } from "./highlight-types";

// A proposed highlight group, not yet persisted. Task 4 (persistence) turns
// these into MemoryHighlightGroup rows by assigning id/eventId/sortOrder and
// preserving isVisible across regenerations keyed on semanticKey.
export interface HighlightProposal {
  semanticKey: string;
  name: string;
  description: string | null;
  source: HighlightGroupSource;
  mediaIds: string[];
}

// One media item's assignment into an already-persisted (host-defined) group.
export interface HighlightAssignment {
  groupId: string;
  mediaId: string;
}

export interface HighlightGenerationPolicyInput {
  approvedCount: number;
  lastGeneratedCount: number;
  hasPublishedGeneration: boolean;
  hasPendingGeneration: boolean;
}

// Labels below this confidence are treated as noise for classification
// purposes, whether matching the fallback dictionary or a host group.
const MIN_LABEL_CONFIDENCE = 0.6;

// The floor below which dynamic (Anthropic-backed) classification is not
// attempted at all — fallback dictionary output is refreshed instead.
const DYNAMIC_CLASSIFICATION_FLOOR = 8;

// Once dynamic classification is active, how many additional approved items
// must accumulate before it's worth re-running (cost/rate-limit guard).
const REGENERATION_INTERVAL = 10;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

// General-purpose categories, independent of any host-authored schedule or
// Moment names. Keyword sets are mutually exclusive by design: a photo
// belongs to multiple groups only when it carries multiple distinct labels,
// each landing in a different category (e.g. a cake-table shot labeled both
// "Cake" and "Food").
const FALLBACK_HIGHLIGHT_CATEGORIES: ReadonlyArray<{
  semanticKey: string;
  name: string;
  description: string;
  keywords: readonly string[];
}> = [
  {
    semanticKey: "ceremony",
    name: "Ceremony",
    description: "Vows, rings, and the formal ceremony moments.",
    keywords: ["ceremony", "altar", "aisle", "vows", "officiant", "chapel", "veil", "pew", "wedding rings"],
  },
  {
    semanticKey: "cake",
    name: "Cake",
    description: "Cake cutting and dessert-table centerpiece shots.",
    keywords: ["cake", "wedding cake", "birthday cake", "icing", "frosting", "cake topper", "cake cutting"],
  },
  {
    semanticKey: "dancing",
    name: "Dancing",
    description: "First dance and open dance-floor moments.",
    keywords: ["dancing", "dance floor", "dance pose", "nightclub", "disco ball", "dj", "first dance"],
  },
  {
    semanticKey: "food-drinks",
    name: "Food & Drinks",
    description: "Catering, drinks, and dining moments.",
    keywords: ["food", "dessert", "buffet", "champagne", "wine", "cocktail", "beverage", "plate", "cutlery", "catering", "drink"],
  },
  {
    semanticKey: "decorations",
    name: "Decorations",
    description: "Florals, table settings, and venue styling.",
    keywords: [
      "decoration",
      "floral design",
      "flower arrangement",
      "centerpiece",
      "balloon",
      "balloon arch",
      "table setting",
      "string lights",
      "backdrop",
      "floral",
    ],
  },
  {
    semanticKey: "group-photos",
    name: "Group Photos",
    description: "Posed and candid group shots.",
    // "portrait" deliberately excluded: Rekognition tags nearly every
    // people-photo (solo, couple, or group) with this generic label, so it
    // pulled plain solo/couple shots into a category meant for actual group
    // shots. Confirmed against real production descriptors (2026-09-24).
    keywords: ["group photo", "crowd", "family photo", "photo booth", "wedding party"],
  },
  {
    semanticKey: "children",
    name: "Children",
    description: "Kids, flower girls, and ring bearers.",
    keywords: ["child", "kid", "toddler", "baby", "children", "flower girl", "ring bearer"],
  },
  {
    semanticKey: "gifts",
    name: "Gifts",
    description: "Gift table and present-opening moments.",
    keywords: ["gift", "present", "wrapping paper", "gift box", "gift table", "card box"],
  },
  {
    semanticKey: "send-off",
    name: "Send-Off",
    description: "The couple's exit and farewell moments.",
    keywords: ["send-off", "sparkler", "confetti", "fireworks", "limousine", "just married", "waving", "exit"],
  },
];

// General-purpose fallback classifier. Used when an event has fewer than
// DYNAMIC_CLASSIFICATION_FLOOR approved photos (not enough signal to justify
// a dynamic AI grouping pass), and as the floor case dynamic classification
// falls back to. One descriptor can land in multiple groups when its labels
// span multiple categories.
export function classifyFallbackHighlights(descriptors: MemoryMediaDescriptor[]): HighlightProposal[] {
  const mediaIdsByCategory = new Map<string, Set<string>>();

  for (const descriptor of descriptors) {
    for (const label of descriptor.labels) {
      if (label.confidence < MIN_LABEL_CONFIDENCE) continue;
      const normalizedLabel = normalize(label.name);

      for (const category of FALLBACK_HIGHLIGHT_CATEGORIES) {
        if (!category.keywords.includes(normalizedLabel)) continue;

        let mediaIds = mediaIdsByCategory.get(category.semanticKey);
        if (!mediaIds) {
          mediaIds = new Set<string>();
          mediaIdsByCategory.set(category.semanticKey, mediaIds);
        }
        mediaIds.add(descriptor.mediaId);
      }
    }
  }

  const proposals: HighlightProposal[] = [];
  for (const category of FALLBACK_HIGHLIGHT_CATEGORIES) {
    const mediaIds = mediaIdsByCategory.get(category.semanticKey);
    if (!mediaIds || mediaIds.size === 0) continue;

    proposals.push({
      semanticKey: category.semanticKey,
      name: category.name,
      description: category.description,
      source: "fallback",
      mediaIds: Array.from(mediaIds),
    });
  }

  return proposals;
}

function extractMatchTerms(group: MemoryHighlightGroup): Set<string> {
  const terms = new Set<string>();
  terms.add(normalize(group.name));

  if (group.description) {
    for (const word of group.description.split(/[^a-zA-Z]+/)) {
      if (word.length > 2) terms.add(normalize(word));
    }
  }

  return terms;
}

// Deterministic exact label/description matching against host-defined
// groups, run before any AI (fallback dictionary or dynamic) classification
// is attempted. A descriptor is assigned to a group only when one of its
// labels exactly equals the group's name or a word from its description —
// no fuzzy or substring matching.
export function classifyIntoHostGroups(
  descriptors: MemoryMediaDescriptor[],
  groups: MemoryHighlightGroup[],
): HighlightAssignment[] {
  const groupsWithTerms = groups.map((group) => ({ group, terms: extractMatchTerms(group) }));
  const assignments: HighlightAssignment[] = [];
  const seenPairs = new Set<string>();

  for (const descriptor of descriptors) {
    for (const label of descriptor.labels) {
      if (label.confidence < MIN_LABEL_CONFIDENCE) continue;
      const normalizedLabel = normalize(label.name);

      for (const { group, terms } of groupsWithTerms) {
        if (!terms.has(normalizedLabel)) continue;

        const pairKey = `${group.id}:${descriptor.mediaId}`;
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);

        assignments.push({ groupId: group.id, mediaId: descriptor.mediaId });
      }
    }
  }

  return assignments;
}

// Decides whether an event's next AI Highlights generation should be queued.
//
// - Never queue over a generation that's already pending (queued/processing).
// - If nothing has ever published, queue as soon as there's any approved
//   media to work with — guests should never be stuck on an empty state
//   longer than necessary, regardless of whether a prior (unpublished)
//   attempt ran at the same count.
// - Below the dynamic-classification floor (or while the last generation
//   was itself below the floor), refresh on every newly approved item —
//   this is cheap fallback-dictionary work, not an AI call.
// - The moment the approved count reaches the floor while the last
//   generation was still below it, switch to dynamic mode immediately.
// - Once dynamic mode is active (both counts >= floor), only re-run once
//   enough new media has accumulated to justify another AI call.
export function shouldQueueHighlightGeneration(input: HighlightGenerationPolicyInput): boolean {
  const { approvedCount, lastGeneratedCount, hasPublishedGeneration, hasPendingGeneration } = input;

  if (hasPendingGeneration) return false;

  if (!hasPublishedGeneration) return approvedCount > 0;

  if (approvedCount < DYNAMIC_CLASSIFICATION_FLOOR || lastGeneratedCount < DYNAMIC_CLASSIFICATION_FLOOR) {
    return approvedCount > lastGeneratedCount;
  }

  return approvedCount - lastGeneratedCount >= REGENERATION_INTERVAL;
}
