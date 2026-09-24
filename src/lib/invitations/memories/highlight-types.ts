// src/lib/invitations/memories/highlight-types.ts
//
// Domain types for the independent, multi-group AI Highlight system. These
// types are separate from timestamp-based Moments (see MemoryMoment in
// ./types.ts) and must never be conflated with Moment membership.

// Event-level setting: whether AI Highlights derives groups automatically
// (fallback dictionary, then dynamic generation) or uses host-defined groups.
export type HighlightMode = "automatic" | "host_defined";

// Where a given highlight group definition came from.
export type HighlightGroupSource = "fallback" | "ai_generated" | "host_defined";

// Per-generation classification mode actually used for that attempt. Distinct
// from HighlightMode: an event in "automatic" HighlightMode may still produce
// a "fallback" generation while it has too little media for dynamic grouping.
export type HighlightGenerationMode = "fallback" | "automatic" | "host_defined";

// Lifecycle status of one classification attempt.
export type HighlightGenerationStatus = "queued" | "processing" | "published" | "failed";

// Provider-independent AI input for a single media item. Current photo
// support supplies labels only; embedding and transcriptCues are reserved
// for future video support and remain optional.
export interface MemoryMediaDescriptor {
  mediaId: string;
  mediaKind: "photo" | "video";
  labels: Array<{ name: string; confidence: number }>;
  embedding?: number[];
  transcriptCues?: string[];
}

// A highlight group definition (automatic, fallback, or host-defined) for one
// event. `semanticKey` is the stable identity regeneration uses to preserve
// host-edited name/order/visibility across re-runs.
export interface MemoryHighlightGroup {
  id: string;
  eventId: string;
  name: string;
  description: string | null;
  semanticKey: string;
  source: HighlightGroupSource;
  sortOrder: number;
  isVisible: boolean;
}

// One complete classification attempt for an event. This is the atomic
// publication boundary: guests only ever see the last generation whose
// status reached "published".
export interface MemoryHighlightGeneration {
  id: string;
  eventId: string;
  mode: HighlightGenerationMode;
  status: HighlightGenerationStatus;
  mediaCount: number;
  errorCode: string | null;
  createdAt: string;
  publishedAt: string | null;
}

// The guest-facing read model: only the currently published generation's
// visible groups and their media membership. `generationId` is null when an
// event has never published a highlight generation (existing empty state).
export interface PublishedMemoryHighlights {
  generationId: string | null;
  groups: Array<{
    group: MemoryHighlightGroup;
    mediaIds: string[];
  }>;
}
