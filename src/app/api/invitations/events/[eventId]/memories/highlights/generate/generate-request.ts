// src/app/api/invitations/events/[eventId]/memories/highlights/generate/generate-request.ts
//
// The actual decision logic behind POST .../highlights/generate, pulled out
// of route.ts so it can be unit-tested with injected fakes rather than a real
// Supabase instance — this codebase's tsx --test convention has no seam for
// that inside a route.ts file directly (see repository.test.ts's header
// comment). Mirrors highlight-service.ts's own dependencies-object DI
// pattern one layer up.
import { requestHighlightGeneration } from "@/lib/invitations/memories/highlight-service";
import { getHighlightGenerationState } from "@/lib/invitations/memories/repository";
import type { MemoryHighlightGeneration } from "@/lib/invitations/memories/highlight-types";

export interface ResolveHighlightGenerationDependencies {
  requestHighlightGeneration?: typeof requestHighlightGeneration;
  getHighlightGenerationState?: typeof getHighlightGenerationState;
}

export interface HighlightGenerationSummary {
  id: string | null;
  status: string;
  mediaCount: number;
}

export type ResolvedHighlightGenerationRequest =
  | { status: 202; body: { generation: HighlightGenerationSummary; alreadyPending?: true } }
  | { status: 404; body: { error: string } }
  | { status: 500; body: { error: string } };

// requestHighlightGeneration(eventId, true, ...) is always called with
// force: true — a host clicking Generate/Regenerate should always attempt a
// fresh run, bypassing only the "not enough new media yet" heuristic. force
// can still never queue a SECOND generation on top of one already
// queued/processing (a hard invariant, also enforced by the DB's own unique
// index) — that case returns null from requestHighlightGeneration, which is
// otherwise indistinguishable from "this event doesn't exist" (also null).
// This function disambiguates the two via getHighlightGenerationState, and
// reports the ALREADY-PENDING generation's own id/status back to the host as
// a 202 (not an error) rather than failing a request that is, from the
// host's perspective, harmlessly redundant.
export async function resolveHighlightGenerationRequest(
  eventId: string,
  dependencies: ResolveHighlightGenerationDependencies = {},
): Promise<ResolvedHighlightGenerationRequest> {
  const request = dependencies.requestHighlightGeneration ?? requestHighlightGeneration;
  const getState = dependencies.getHighlightGenerationState ?? getHighlightGenerationState;

  const generation = await request(eventId, true);
  if (generation) {
    return { status: 202, body: { generation: serializeGeneration(generation) } };
  }

  const state = await getState(eventId);
  if (!state) {
    return { status: 404, body: { error: "event not found" } };
  }

  if (state.pendingGenerationId) {
    return {
      status: 202,
      body: {
        generation: {
          id: state.pendingGenerationId,
          status: state.generationStatus,
          mediaCount: state.lastGeneratedMediaCount,
        },
        alreadyPending: true,
      },
    };
  }

  // force: true only fails to queue when a pending generation already exists
  // (handled above) — reaching here means requestHighlightGeneration
  // returned null for some other reason, which would be a violation of its
  // own documented contract. Surfaced as a 500 rather than silently
  // reporting success.
  return { status: 500, body: { error: "failed to queue highlight generation" } };
}

function serializeGeneration(generation: MemoryHighlightGeneration): HighlightGenerationSummary {
  return { id: generation.id, status: generation.status, mediaCount: generation.mediaCount };
}
