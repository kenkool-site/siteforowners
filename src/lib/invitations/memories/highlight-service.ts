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
import { classifyFallbackHighlights, classifyIntoHostGroups, shouldQueueHighlightGeneration } from "./highlight-classifier";
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

// How long a generation may sit in 'processing' before it's considered stuck
// (e.g. the worker that claimed it crashed mid-run — a Vercel function
// timeout during the single Anthropic call this involves is a realistic
// cause) and eligible for reclaim. 10 minutes is generous for one Anthropic
// call plus a handful of DB writes — normal processing should complete in
// well under a minute — while still bounding how long an event can be stuck
// unable to queue another generation if a run genuinely dies.
const STALE_PROCESSING_TIMEOUT_MS = 10 * 60 * 1000;

// ---------------------------------------------------------------------------
// requestHighlightGeneration
// ---------------------------------------------------------------------------

export interface RequestHighlightGenerationDependencies {
  getHighlightGenerationState?: (eventId: string) => Promise<HighlightGenerationState | null>;
  listApprovedMemoryDescriptors?: typeof repository.listApprovedMemoryDescriptors;
  queueHighlightGeneration?: typeof repository.queueHighlightGeneration;
  reclaimStaleHighlightGeneration?: typeof repository.reclaimStaleHighlightGeneration;
}

// Decides whether to queue a new generation for an event, and if so with
// which mode. `force` (e.g. a host clicking "Regenerate now") bypasses only
// shouldQueueHighlightGeneration's "not enough new media yet" heuristic — it
// can never queue a second generation on top of one that's already
// queued/processing, since that exclusivity is a hard invariant (also
// enforced by the DB's own unique index), not a heuristic to override.
//
// The one exception: a generation stuck in 'processing' past
// STALE_PROCESSING_TIMEOUT_MS is reclaimed (marked failed with a TIMEOUT
// error code) so the event isn't permanently blocked from ever queuing again
// by a run that crashed mid-flight. Without this, Task 1's partial unique
// index (one queued-or-processing generation per event) would leave such an
// event stuck forever, since generationStatus would stay 'processing' with
// no code path ever resetting it.
export async function requestHighlightGeneration(
  eventId: string,
  force: boolean,
  dependencies: RequestHighlightGenerationDependencies = {},
): Promise<MemoryHighlightGeneration | null> {
  const getState = dependencies.getHighlightGenerationState ?? repository.getHighlightGenerationState;
  const listDescriptors = dependencies.listApprovedMemoryDescriptors ?? repository.listApprovedMemoryDescriptors;
  const queue = dependencies.queueHighlightGeneration ?? repository.queueHighlightGeneration;
  const reclaimStale = dependencies.reclaimStaleHighlightGeneration ?? repository.reclaimStaleHighlightGeneration;

  let state = await getState(eventId);
  if (!state) return null;

  let hasPendingGeneration = state.generationStatus === "queued" || state.generationStatus === "processing";

  if (hasPendingGeneration && state.generationStatus === "processing" && state.pendingGenerationId) {
    const reclaimed = await reclaimStale(state.pendingGenerationId, STALE_PROCESSING_TIMEOUT_MS);
    if (reclaimed) {
      // The stale generation just failed out from under us — refresh state
      // so this call can proceed to queue a fresh attempt instead of
      // returning null forever.
      state = await getState(eventId);
      if (!state) return null;
      hasPendingGeneration = state.generationStatus === "queued" || state.generationStatus === "processing";
    }
  }

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
  classifyIntoHostGroups?: (
    descriptors: Parameters<typeof classifyIntoHostGroups>[0],
    groups: Parameters<typeof classifyIntoHostGroups>[1],
  ) => HighlightAssignment[];
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

// One existing group whose name/description a successful run should refresh
// — deferred rather than applied immediately, see processHighlightGeneration.
interface DeferredGroupUpdate {
  groupId: string;
  proposal: HighlightProposal;
}

interface GroupResolution {
  groupId: string;
  deferredUpdate: DeferredGroupUpdate | null;
}

// Resolves one classifier proposal to a persisted group id, preserving
// identity across regenerations by matching on semanticKey within the
// group's own source category — the same (event_id, source, semantic_key)
// boundary the DB enforces uniqueness on. A brand-new group is created right
// away (its id is needed to write membership rows), but an EXISTING group's
// name/description is never written here — only noted as a deferred update
// the caller applies after a successful publish, so a run that fails never
// leaves an already guest-visible group's copy overwritten by content that
// was never actually published. sortOrder/isVisible are never touched on an
// existing match at all (deferred or not), so a host's manual edits to
// either always survive regeneration.
async function resolveGroupForProposal(
  eventId: string,
  proposal: HighlightProposal,
  sortOrder: number,
  existingGroups: MemoryHighlightGroup[],
  createGroup: NonNullable<ProcessHighlightGenerationDependencies["createMemoryHighlightGroup"]>,
): Promise<GroupResolution> {
  const existing = existingGroups.find((candidate) => candidate.semanticKey === proposal.semanticKey);
  if (existing) {
    return { groupId: existing.id, deferredUpdate: { groupId: existing.id, proposal } };
  }

  const created = await createGroup(eventId, {
    name: proposal.name,
    description: proposal.description,
    semanticKey: proposal.semanticKey,
    source: proposal.source,
    sortOrder,
    isVisible: true,
  });
  return { groupId: created.id, deferredUpdate: null };
}

// Claims one queued generation and runs it end to end: loads descriptors and
// (for automatic/fallback modes) existing group definitions, selects the
// classifier the generation's own mode calls for, replaces that generation's
// membership rows, and publishes via the atomic RPC. Any thrown error or
// empty/invalid classifier output is caught and recorded as a short error
// code via failHighlightGeneration, which never touches the published
// pointer — so a failure here always leaves whatever was last published
// exactly as guests were seeing it. Existing groups' name/description are
// only refreshed AFTER a successful publish (see DeferredGroupUpdate above);
// brand-new groups are created ahead of the publish (needed for their id),
// but getPublishedMemoryHighlights never surfaces a fallback/ai_generated
// group with no membership under the currently published generation, so an
// unpublished new group never leaks to guests either.
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
  const classifyExactHostGroups = dependencies.classifyIntoHostGroups ?? classifyIntoHostGroups;
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
    const deferredGroupUpdates: DeferredGroupUpdate[] = [];

    if (generation.mode === "host_defined") {
      // Host-defined groups are created and edited by the host through their
      // own UI, independent of any generation run — this branch never
      // creates or updates a group definition, and never falls back to
      // fallback/dynamic classification regardless of descriptor count.
      const groups = await listGroups(generation.eventId, "host_defined");

      // Task 2's cheap, deterministic exact-match pass runs first; its
      // output is merged with the Anthropic-backed fuzzy classifier's own
      // pass (run over the full descriptor set, not just what the exact pass
      // missed) rather than gating what reaches the AI — a photo can still
      // be fuzzily matched into a group the exact pass didn't catch.
      // Overlapping (group, media) pairs from both sources collapse below.
      const exactAssignments = classifyExactHostGroups(descriptors, groups);
      const aiAssignments = await generateHostDefined({ descriptors, groups });

      const seenPairs = new Set<string>();
      for (const assignment of [...exactAssignments, ...aiAssignments]) {
        const pairKey = `${assignment.groupId}:${assignment.mediaId}`;
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);
        assignments.push({ groupId: assignment.groupId, mediaId: assignment.mediaId });
      }
    } else {
      const source = generation.mode === "automatic" ? "ai_generated" : "fallback";
      const existingGroups = await listGroups(generation.eventId, source);

      const proposals: HighlightProposal[] =
        generation.mode === "automatic" ? await generateDynamic({ descriptors, existingGroups }) : classifyFallback(descriptors);

      // Checked before any group is written: Task 2/3 already guarantee a
      // non-empty proposal's mediaIds are non-empty and dynamic mode's own
      // count is validated to [4,8], but classifyFallbackHighlights can
      // legitimately return zero proposals (nothing matched any category) —
      // that must fail without ever touching memory_highlight_groups.
      if (proposals.length === 0) {
        throw new Error("EMPTY_HIGHLIGHT_OUTPUT");
      }

      for (let index = 0; index < proposals.length; index++) {
        const proposal = proposals[index];
        const resolution = await resolveGroupForProposal(generation.eventId, proposal, index, existingGroups, createGroup);
        if (resolution.deferredUpdate) deferredGroupUpdates.push(resolution.deferredUpdate);
        for (const mediaId of proposal.mediaIds) {
          assignments.push({ groupId: resolution.groupId, mediaId });
        }
      }
    }

    if (assignments.length === 0) {
      throw new Error("EMPTY_HIGHLIGHT_OUTPUT");
    }

    // The same quantity requestHighlightGeneration's next call compares
    // against (approvedCount, from listApprovedMemoryDescriptors) — not the
    // grouped/deduped assignment count, which can be far smaller (e.g. 50
    // approved photos but the model only groups 12 of them) and would
    // otherwise make REGENERATION_INTERVAL's cost/rate-limit guard fire on
    // every single call once above the dynamic floor.
    const mediaCountForPublish = descriptors.length;

    await replaceMemberships(generation.id, assignments);
    await publish(generation.eventId, generation.id, mediaCountForPublish);

    // Only after a successful publish do we touch an existing group's
    // AI-authored name/description — a run that fails anywhere above
    // (classifier throw, empty output, a membership/publish DB error) must
    // never leave an already guest-visible group's copy rewritten by content
    // that was never actually published. Best-effort per group: a failure
    // here doesn't undo the publish that already succeeded, it just means
    // this group's copy won't reflect this round's wording until the next
    // successful regeneration picks it up again.
    for (const { groupId, proposal } of deferredGroupUpdates) {
      try {
        await updateGroup(generation.eventId, groupId, { name: proposal.name, description: proposal.description });
      } catch (err) {
        console.error("[highlight-service] failed to refresh group copy after publish (non-fatal)", { groupId, error: err });
      }
    }
  } catch (err) {
    await fail(generation.eventId, generation.id, errorCodeFor(err));
  }
}
