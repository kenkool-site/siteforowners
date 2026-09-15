import { checkRateLimit } from "@/lib/api-rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export interface InvitationLoginRateLimiter {
  canAttempt(bucket: string, windowSeconds: number, maxFailures: number): Promise<boolean>;
  recordFailure(bucket: string, windowSeconds: number, maxFailures: number): Promise<boolean>;
}

async function canAttempt(
  bucket: string,
  windowSeconds: number,
  maxFailures: number,
): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("is_rate_limit_available", {
    p_bucket: bucket,
    p_window_seconds: windowSeconds,
    p_max_requests: maxFailures,
  });
  if (error) {
    console.error("[invitations/auth/login] failure rate-limit preflight failed", { bucket, error });
    return true;
  }
  return data === true;
}

export const invitationLoginRateLimiter: InvitationLoginRateLimiter = {
  canAttempt,
  recordFailure: checkRateLimit,
};
