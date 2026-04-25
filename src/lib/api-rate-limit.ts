import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Atomic check-and-record against the Postgres `check_rate_limit` function.
 * Returns true if the request fits within the limit (and was recorded);
 * false if the bucket is over the cap.
 *
 * On Supabase error, returns true (fail-open) so a DB blip doesn't lock
 * out real users — but logs loudly so the issue surfaces.
 */
export async function checkRateLimit(
  bucket: string,
  windowSeconds: number,
  maxRequests: number
): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_bucket: bucket,
    p_window_seconds: windowSeconds,
    p_max_requests: maxRequests,
  });
  if (error) {
    console.error("[api-rate-limit] checkRateLimit RPC failed", { bucket, error });
    return true;
  }
  return data === true;
}

/** Hash an IP with the IP_HASH_PEPPER env var. */
export function hashIp(ip: string): string {
  const pepper = process.env.IP_HASH_PEPPER || "";
  return createHash("sha256").update(ip + pepper).digest("hex");
}

/** Extract the client IP from a request, preferring X-Forwarded-For. */
export function getClientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}

/** Bucket key for the per-(tenant, IP) /api/track limit. */
export function trackBucket(tenantId: string, ipHash: string): string {
  return `track:${tenantId}:${ipHash}`;
}

/** Bucket key for the per-tenant total /api/admin/login fail limit. */
export function loginTenantBucket(tenantId: string): string {
  return `login_tenant:${tenantId}`;
}
