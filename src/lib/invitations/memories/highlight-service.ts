// src/lib/invitations/memories/highlight-service.ts
//
// Orchestration layer that ties Task 1's persistence, Task 2's fallback
// classifier + generation policy, and Task 3's Anthropic-backed dynamic and
// host-defined classifiers into one working pipeline. No classifier logic
// and no SQL live here — this module only decides which already-built piece
// to run and persists the result atomically via the Task 1 publish RPC.
//
// Every repository/classifier call this module makes is DI-overridable
// (mirroring highlight-generator.ts's `dependencies.generateText` seam), so
// its tests never make a real Supabase or Anthropic call.
import { RekognitionAIProvider } from "./ai-provider";
import type { DetectedLabel } from "./ai-provider";
import { classifyFallbackHighlights, shouldQueueHighlightGeneration } from "./highlight-classifier";
import type { HighlightAssignment, HighlightProposal } from "./highlight-classifier";
import { generateDynamicHighlights, generateHostDefinedAssignments } from "./highlight-generator";
import type { GenerateDynamicHighlightsInput, GenerateHostDefinedAssignmentsInput } from "./highlight-generator";
import type { HighlightGenerationMode, MemoryHighlightGeneration, MemoryHighlightGroup } from "./highlight-types";
import * as repository from "./repository";
import type { HighlightGenerationState, MemoryMediaSummary } from "./repository";
import { R2StorageProvider } from "./storage-provider";

// Mirrors highlight-classifier.ts's own private DYNAMIC_CLASSIFICATION_FLOOR.
// Not exported from there (Task 2 is a settled, reviewed module this task
// doesn't touch), so it's duplicated here — see task-4-report.md for why this
// is an accepted judgment call rather than a shared constant.
const DYNAMIC_CLASSIFICATION_FLOOR = 8;

// ---------------------------------------------------------------------------
// requestHighlightGeneration
// ---------------------------------------------------------------------------

export interface RequestHighlightGenerationDependencies {
  getHighlightGenerationState?: (eventId: string) => Promise<HighlightGenerationState | null>;
  listApprovedMemoryDescriptors?: typeof repository.listApprovedMemoryDescriptors;
  queueHighlightGeneration?: typeof repository.queueHighlightGeneration;
}

// Decides whether to queue a new generation for an event, and if so with
// which mode. `force` (e.g. a host clicking "Regenerate now") bypasses only
// shouldQueueHighlightGeneration's "not enough new media yet" heuristic — it
// can never queue a second generation on top of one that's already
// queued/processing, since that exclusivity is a hard invariant (also
// enforced by the DB's own unique index), not a heuristic to override.
export async function requestHighlightGeneration(
  eventId: string,
  force: boolean,
  dependencies: RequestHighlightGenerationDependencies = {},
): Promise<MemoryHighlightGeneration | null> {
  const getState = dependencies.getHighlightGenerationState ?? repository.getHighlightGenerationState;
  const listDescriptors = dependencies.listApprovedMemoryDescriptors ?? repository.listApprovedMemoryDescriptors;
  const queue = dependencies.queueHighlightGeneration ?? repository.queueHighlightGeneration;

  const state = await getState(eventId);
  if (!state) return null;

  const hasPendingGeneration = state.generationStatus === "queued" || state.generationStatus === "processing";
  if (hasPendingGeneration) return null;

  const approvedCount = (await listDescriptors(eventId)).length;
  const shouldQueue =
    force ||
    shouldQueueHighlightGeneration({
      approvedCount,
      lastGeneratedCount: state.lastGeneratedMediaCount,
      hasPublishedGeneration: state.publishedGenerationId !== null,
      hasPendingGeneration,
    });
  if (!shouldQueue) return null;

  // The generation's mode is fixed once, here, for the whole attempt — see
  // HighlightGenerationMode's doc comment: an event in "automatic"
  // HighlightMode may still produce a "fallback" generation while it has too
  // little media. processHighlightGeneration trusts this stored mode rather
  // than re-deriving it from a possibly-different descriptor count later.
  const mode: HighlightGenerationMode =
    state.highlightMode === "host_defined"
      ? "host_defined"
      : approvedCount >= DYNAMIC_CLASSIFICATION_FLOOR
        ? "automatic"
        : "fallback";

  return queue(eventId, mode);
}

// ---------------------------------------------------------------------------
// backfillMissingMemoryDescriptors
// ---------------------------------------------------------------------------

export interface BackfillMissingDescriptorsDependencies {
  listApprovedMediaMissingDescriptors?: typeof repository.listApprovedMediaMissingDescriptors;
  upsertMemoryMediaDescriptor?: typeof repository.upsertMemoryMediaDescriptor;
  detectLabels?: (media: MemoryMediaSummary) => Promise<DetectedLabel[]>;
}

// Catch-up utility for approved media that predates this feature (or whose
// extraction previously failed): detects labels for each and persists a
// descriptor. Best-effort per item — one failure logs and moves on rather
// than aborting the whole batch, since a partial backfill is strictly better
// than none and the same item will simply be picked up again next run.
export async function backfillMissingMemoryDescriptors(
  eventId: string,
  limit: number,
  dependencies: BackfillMissingDescriptorsDependencies = {},
): Promise<number> {
  const listMissing = dependencies.listApprovedMediaMissingDescriptors ?? repository.listApprovedMediaMissingDescriptors;
  const upsertDescriptor = dependencies.upsertMemoryMediaDescriptor ?? repository.upsertMemoryMediaDescriptor;
  const detectLabels = dependencies.detectLabels ?? defaultDetectLabelsForMedia;

  const missing = await listMissing(eventId, limit);
  let backfilled = 0;
  for (const media of missing) {
    try {
      const labels = await detectLabels(media);
      await upsertDescriptor({ mediaId: media.mediaId, labels });
      backfilled += 1;
    } catch (err) {
      console.error("[highlight-service] failed to backfill descriptor (non-fatal)", { mediaId: media.mediaId, error: err });
    }
  }
  return backfilled;
}

// The only place this module reaches R2/Rekognition directly. Lazily
// constructed inside the call (not at module load), matching
// highlight-generator.ts's own lazy-Anthropic-client pattern, so importing
// this module — or running its tests, which always inject detectLabels —
// never requires AWS/R2 env vars and never touches the network.
async function defaultDetectLabelsForMedia(media: MemoryMediaSummary): Promise<DetectedLabel[]> {
  if (!media.objectKeyDisplay) return [];
  const storage = new R2StorageProvider();
  const provider = new RekognitionAIProvider();
  const downloadUrl = await storage.getSignedDownloadUrl(media.objectKeyDisplay, 60);
  const imageResponse = await fetch(downloadUrl);
  if (!imageResponse.ok) throw new Error(`R2 download failed with status ${imageResponse.status}`);
  const bytes = new Uint8Array(await imageResponse.arrayBuffer());
  return provider.detectLabels(bytes);
}

// ---------------------------------------------------------------------------
// processHighlightGeneration
// ---------------------------------------------------------------------------

export interface ProcessHighlightGenerationDependencies {
  claimNextHighlightGeneration?: (generationId: string) => Promise<MemoryHighlightGeneration | null>;
  listApprovedMemoryDescriptors?: typeof repository.listApprovedMemoryDescriptors;
  listMemoryHighlightGroups?: typeof repository.listMemoryHighlightGroups;
  createMemoryHighlightGroup?: typeof repository.createMemoryHighlightGroup;
  updateMemoryHighlightGroup?: typeof repository.updateMemoryHighlightGroup;
  replaceHighlightGenerationMemberships?: typeof repository.replaceHighlightGenerationMemberships;
  publishHighlightGeneration?: typeof repository.publishHighlightGeneration;
  failHighlightGeneration?: typeof repository.failHighlightGeneration;
  classifyFallbackHighlights?: (descriptors: Parameters<typeof classifyFallbackHighlights>[0]) => HighlightProposal[];
  generateDynamicHighlights?: (input: GenerateDynamicHighlightsInput) => Promise<HighlightProposal[]>;
  generateHostDefinedAssignments?: (input: GenerateHostDefinedAssignmentsInput) => Promise<HighlightAssignment[]>;
}

interface ResolvedAssignment {
  groupId: string;
  mediaId: string;
}

// A short, machine-readable code recorded on the generation/event row via
// failHighlightGeneration — not a human-facing message. Kept to a small,
// closed set on purpose (see task-4-report.md's disclosed judgment call on
// this shape).
function errorCodeFor(err: unknown): string {
  if (err instanceof Error) {
    if (err.message === "EMPTY_HIGHLIGHT_OUTPUT") return "EMPTY_OUTPUT";
    if (/expected between/.test(err.message)) return "INVALID_GROUP_COUNT";
    if (/groups' array|assignments' array/.test(err.message)) return "INVALID_AI_RESPONSE";
  }
  return "GENERATION_FAILED";
}

// Upserts one classifier proposal into a persisted group, preserving
// identity (and any host edits to sortOrder/isVisible) across regenerations
// by matching on semanticKey within the group's own source category — the
// same (event_id, source, semantic_key) boundary the DB enforces uniqueness
// on. Only name/description are refreshed on an existing match; sortOrder and
// isVisible are deliberately left alone so a host's manual edits survive.
async function upsertStableGroup(
  eventId: string,
  proposal: HighlightProposal,
  sortOrder: number,
  existingGroups: MemoryHighlightGroup[],
  createGroup: NonNullable<ProcessHighlightGenerationDependencies["createMemoryHighlightGroup"]>,
  updateGroup: NonNullable<ProcessHighlightGenerationDependencies["updateMemoryHighlightGroup"]>,
): Promise<string> {
  const existing = existingGroups.find((candidate) => candidate.semanticKey === proposal.semanticKey);
  if (existing) {
    await updateGroup(eventId, existing.id, { name: proposal.name, description: proposal.description });
    return existing.id;
  }

  const created = await createGroup(eventId, {
    name: proposal.name,
    description: proposal.description,
    semanticKey: proposal.semanticKey,
    source: proposal.source,
    sortOrder,
    isVisible: true,
  });
  return created.id;
}

// Claims one queued generation and runs it end to end: loads descriptors and
// (for automatic/fallback modes) existing group definitions, selects the
// classifier the generation's own mode calls for, upserts stable group
// definitions, replaces that generation's membership rows, and publishes via
// the atomic RPC. Any thrown error or empty/invalid classifier output is
// caught and recorded as a short error code via failHighlightGeneration,
// which never touches the published pointer — so a failure here always
// leaves whatever was last published exactly as guests were seeing it.
export async function processHighlightGeneration(
  generationId: string,
  dependencies: ProcessHighlightGenerationDependencies = {},
): Promise<void> {
  const claim = dependencies.claimNextHighlightGeneration ?? repository.claimNextHighlightGeneration;
  const listDescriptors = dependencies.listApprovedMemoryDescriptors ?? repository.listApprovedMemoryDescriptors;
  const listGroups = dependencies.listMemoryHighlightGroups ?? repository.listMemoryHighlightGroups;
  const createGroup = dependencies.createMemoryHighlightGroup ?? repository.createMemoryHighlightGroup;
  const updateGroup = dependencies.updateMemoryHighlightGroup ?? repository.updateMemoryHighlightGroup;
  const replaceMemberships = dependencies.replaceHighlightGenerationMemberships ?? repository.replaceHighlightGenerationMemberships;
  const publish = dependencies.publishHighlightGeneration ?? repository.publishHighlightGeneration;
  const fail = dependencies.failHighlightGeneration ?? repository.failHighlightGeneration;
  const classifyFallback = dependencies.classifyFallbackHighlights ?? classifyFallbackHighlights;
  const generateDynamic = dependencies.generateDynamicHighlights ?? generateDynamicHighlights;
  const generateHostDefined = dependencies.generateHostDefinedAssignments ?? generateHostDefinedAssignments;

  // Atomic claim: an UPDATE ... WHERE status = 'queued' at the repository
  // layer. A null result means this generation is no longer queued (already
  // claimed by a concurrent call, or already processed to published/failed)
  // — repeated processing of it is a safe no-op, nothing further to do.
  const generation = await claim(generationId);
  if (!generation) return;

  try {
    const descriptors = await listDescriptors(generation.eventId);
    const assignments: ResolvedAssignment[] = [];

    if (generation.mode === "host_defined") {
      // Host-defined groups are created ahead of time by the host, not by
      // this service — never falls back to fallback/dynamic classification
      // regardless of descriptor count.
      const groups = await listGroups(generation.eventId, "host_defined");
      const hostAssignments = await generateHostDefined({ descriptors, groups });
      for (const assignment of hostAssignments) {
        assignments.push({ groupId: assignment.groupId, mediaId: assignment.mediaId });
      }
    } else {
      const source = generation.mode === "automatic" ? "ai_generated" : "fallback";
      const existingGroups = await listGroups(generation.eventId, source);

      const proposals: HighlightProposal[] =
        generation.mode === "automatic" ? await generateDynamic({ descriptors, existingGroups }) : classifyFallback(descriptors);

      for (let index = 0; index < proposals.length; index++) {
        const proposal = proposals[index];
        const groupId = await upsertStableGroup(generation.eventId, proposal, index, existingGroups, createGroup, updateGroup);
        for (const mediaId of proposal.mediaIds) {
          assignments.push({ groupId, mediaId });
        }
      }
    }

    if (assignments.length === 0) {
      throw new Error("EMPTY_HIGHLIGHT_OUTPUT");
    }

    const distinctMediaCount = new Set(assignments.map((assignment) => assignment.mediaId)).size;
    await replaceMemberships(generation.id, assignments);
    await publish(generation.eventId, generation.id, distinctMediaCount);
  } catch (err) {
    await fail(generation.eventId, generation.id, errorCodeFor(err));
  }
}
