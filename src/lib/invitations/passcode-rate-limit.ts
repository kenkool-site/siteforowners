import { createAdminClient } from "@/lib/supabase/admin";
import {
  INVITATION_PASSCODE_MAX_ATTEMPTS,
  INVITATION_PASSCODE_WINDOW_SECONDS,
} from "./passcode";

type InvitationPasscodeLimitAttempt = {
  eventId: string;
  ipHash: string;
  windowSeconds: number;
  maxAttempts: number;
};

type InvitationPasscodeRateLimitDependencies = {
  attempt(input: InvitationPasscodeLimitAttempt): Promise<{ data: boolean | null; error: unknown | null }>;
};

export function createInvitationPasscodeRateLimiter(
  dependencies: InvitationPasscodeRateLimitDependencies,
) {
  return {
    async allowAttempt(eventId: string, ipHash: string): Promise<boolean> {
      try {
        const result = await dependencies.attempt({
          eventId,
          ipHash,
          windowSeconds: INVITATION_PASSCODE_WINDOW_SECONDS,
          maxAttempts: INVITATION_PASSCODE_MAX_ATTEMPTS,
        });
        if (result.error || result.data !== true) {
          console.error("[invitations/passcode] rate limit unavailable", { eventId, ipHash, error: result.error });
          return false;
        }
        return true;
      } catch (error) {
        console.error("[invitations/passcode] rate limit unavailable", { eventId, ipHash, error });
        return false;
      }
    },
  };
}

export async function allowInvitationPasscodeAttempt(eventId: string, ipHash: string): Promise<boolean> {
  const limiter = createInvitationPasscodeRateLimiter({
    attempt: async (input) => {
      const { data, error } = await createAdminClient().rpc("attempt_invitation_passcode_rate_limit", {
        p_event_id: input.eventId,
        p_ip_hash: input.ipHash,
        p_window_seconds: input.windowSeconds,
        p_max_attempts: input.maxAttempts,
      });
      return { data: data === true, error };
    },
  });
  return limiter.allowAttempt(eventId, ipHash);
}
