// src/lib/invitations/memories/find-me-rate-limit.ts
import { createAdminClient } from "@/lib/supabase/admin";

const FIND_ME_WINDOW_SECONDS = 24 * 60 * 60;
const FIND_ME_MAX_ATTEMPTS = 5;

type FindMeRateLimitAttempt = {
  eventId: string;
  guestSessionId: string;
  windowSeconds: number;
  maxAttempts: number;
};

type FindMeRateLimitDependencies = {
  attempt(input: FindMeRateLimitAttempt): Promise<{ data: boolean | null; error: unknown | null }>;
};

export function createFindMeRateLimiter(dependencies: FindMeRateLimitDependencies) {
  return {
    async allowAttempt(eventId: string, guestSessionId: string): Promise<boolean> {
      try {
        const result = await dependencies.attempt({
          eventId,
          guestSessionId,
          windowSeconds: FIND_ME_WINDOW_SECONDS,
          maxAttempts: FIND_ME_MAX_ATTEMPTS,
        });
        if (result.error || result.data !== true) {
          console.error("[memories/find-me] rate limit unavailable", { eventId, guestSessionId, error: result.error });
          return false;
        }
        return true;
      } catch (error) {
        console.error("[memories/find-me] rate limit unavailable", { eventId, guestSessionId, error });
        return false;
      }
    },
  };
}

export async function allowFindMeAttempt(eventId: string, guestSessionId: string): Promise<boolean> {
  const limiter = createFindMeRateLimiter({
    attempt: async (input) => {
      const { data, error } = await createAdminClient().rpc("attempt_memories_find_me_rate_limit", {
        p_event_id: input.eventId,
        p_guest_session_id: input.guestSessionId,
        p_window_seconds: input.windowSeconds,
        p_max_attempts: input.maxAttempts,
      });
      return { data, error };
    },
  });
  return limiter.allowAttempt(eventId, guestSessionId);
}
