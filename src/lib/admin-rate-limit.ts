import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export type RateLimitState = {
  failsLast15Min: number;
  failsLastHour: number;
  lockedUntil: number | null; // unix seconds
};

export type RateLimitDecision =
  | { allow: true }
  | { allow: false; reason: "cooldown_15min" | "lockout_1hour" };

export function decide(state: RateLimitState, nowSec: number): RateLimitDecision {
  if (state.lockedUntil !== null && state.lockedUntil > nowSec) {
    return { allow: false, reason: "lockout_1hour" };
  }
  if (state.failsLastHour >= 10) return { allow: false, reason: "lockout_1hour" };
  if (state.failsLast15Min >= 5) return { allow: false, reason: "cooldown_15min" };
  return { allow: true };
}

export function hashIp(ip: string): string {
  const pepper = process.env.IP_HASH_PEPPER || "";
  return createHash("sha256").update(ip + pepper).digest("hex");
}

export async function getRateLimitState(tenantId: string, ipHash: string): Promise<RateLimitState> {
  const supabase = createAdminClient();
  const now = Date.now();
  const hourAgo = new Date(now - 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("admin_login_attempts")
    .select("succeeded, attempted_at")
    .eq("tenant_id", tenantId)
    .eq("ip_hash", ipHash)
    .gte("attempted_at", hourAgo);

  if (error) {
    console.error("[admin-rate-limit] getRateLimitState query failed", { tenantId, error });
  }

  const nowSec = Math.floor(now / 1000);
  let failsLast15Min = 0;
  let failsLastHour = 0;
  for (const row of data ?? []) {
    if (row.succeeded) continue;
    const ts = Math.floor(new Date(row.attempted_at as string).getTime() / 1000);
    failsLastHour++;
    if (nowSec - ts <= 15 * 60) failsLast15Min++;
  }
  return { failsLast15Min, failsLastHour, lockedUntil: null };
}

export async function recordAttempt(
  tenantId: string | null,
  ipHash: string,
  succeeded: boolean
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("admin_login_attempts").insert({
    tenant_id: tenantId,
    ip_hash: ipHash,
    succeeded,
  });
  if (error) {
    console.error("[admin-rate-limit] recordAttempt insert failed", { tenantId, succeeded, error });
  }
}

export async function checkAndRecordAttempt(
  tenantId: string,
  ipHash: string,
  succeeded: boolean
): Promise<RateLimitDecision> {
  const state = await getRateLimitState(tenantId, ipHash);
  const decision = decide(state, Math.floor(Date.now() / 1000));
  await recordAttempt(tenantId, ipHash, succeeded);
  return decision;
}

/**
 * Count failed attempts for a tenant across ALL ips in the last
 * `withinSeconds` window. Closes the IP-rotation bypass: a botnet
 * attacker hitting from many IPs each gets fresh per-IP buckets, but
 * the per-tenant failure total still trips a global lockout.
 */
export async function getTenantFailCount(tenantId: string, withinSeconds: number): Promise<number> {
  const supabase = createAdminClient();
  const sinceISO = new Date(Date.now() - withinSeconds * 1000).toISOString();
  const { count, error } = await supabase
    .from("admin_login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("succeeded", false)
    .gte("attempted_at", sinceISO);
  if (error) {
    console.error("[admin-rate-limit] getTenantFailCount failed", { tenantId, error });
    return 0;
  }
  return count ?? 0;
}
