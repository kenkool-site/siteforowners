// src/lib/invitations/memories/find-me-rate-limit.ts
import { createAdminClient } from "@/lib/supabase/admin";
import { getFindMeDailyLimit } from "./repository";

const FIND_ME_WINDOW_SECONDS = 24 * 60 * 60;

type FindMeRateLimitAttempt = {
  eventId: string;
  guestSessionId: string;
  windowSeconds: number;
  maxAttempts: number;
};

type FindMeRateLimitDependencies = {
  attempt(input: FindMeRateLimitAttempt): Promise<{ data: boolean | null; error: unknown | null }>;
  // The cap itself is a founder-controlled platform setting (see
  // memories_find_me_platform_settings), not a code constant — this seam
  // lets callers/tests fix it without touching the real settings table.
  // getFindMeDailyLimit() already falls back to a safe default rather than
  // throwing, so this is never expected to reject.
  getDailyLimit(): Promise<number>;
};

// "allowed": the guest is under the limit, proceed.
// "denied": the RPC itself ran and said no — a genuine strike-out denial.
// "error": the RPC call failed (network/DB hiccup, missing function, etc.) —
// this must never be reported to the guest the same way as "denied": a
// transient infra failure isn't "you've used up your searches", and
// conflating the two previously made any RPC error look exactly like a rate
// limit hit even on a guest's very first attempt.
export type FindMeRateLimitOutcome = "allowed" | "denied" | "error";

export function createFindMeRateLimiter(dependencies: FindMeRateLimitDependencies) {
  return {
    async allowAttempt(eventId: string, guestSessionId: string): Promise<FindMeRateLimitOutcome> {
      try {
        const maxAttempts = await dependencies.getDailyLimit();
        const result = await dependencies.attempt({
          eventId,
          guestSessionId,
          windowSeconds: FIND_ME_WINDOW_SECONDS,
          maxAttempts,
        });
        if (result.error) {
          console.error("[memories/find-me] rate limit check failed", { eventId, guestSessionId, error: result.error });
          return "error";
        }
        return result.data === true ? "allowed" : "denied";
      } catch (error) {
        console.error("[memories/find-me] rate limit check failed", { eventId, guestSessionId, error });
        return "error";
      }
    },
  };
}

export async function allowFindMeAttempt(eventId: string, guestSessionId: string): Promise<FindMeRateLimitOutcome> {
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
    getDailyLimit: getFindMeDailyLimit,
  });
  return limiter.allowAttempt(eventId, guestSessionId);
}
