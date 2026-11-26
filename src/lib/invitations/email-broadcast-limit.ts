/**
 * Guest-broadcast email budget. Separate from invitation_events.email_notification_limit,
 * which caps host RSVP alert emails and guest confirmation emails.
 *
 * NULL email_broadcast_limit on the event means "use the platform default":
 * INVITATION_EMAIL_BROADCAST_LIMIT when that env var is a positive integer, otherwise 1000.
 * A founder-set per-event value replaces the platform default.
 *
 * Enforcement lives in reserve_invitation_notification (migration 071). This module
 * is the same rule for the composer budget, the RPC argument, and tests.
 */

export const EMAIL_BROADCAST_LIMIT_ENV = "INVITATION_EMAIL_BROADCAST_LIMIT";
export const DEFAULT_EMAIL_BROADCAST_LIMIT = 1000;
export const MAX_EMAIL_BROADCAST_LIMIT = 1_000_000;

export function parsePlatformEmailBroadcastLimit(raw: string | undefined | null): number {
  if (raw == null) return DEFAULT_EMAIL_BROADCAST_LIMIT;
  const trimmed = raw.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) return DEFAULT_EMAIL_BROADCAST_LIMIT;
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_EMAIL_BROADCAST_LIMIT) {
    return DEFAULT_EMAIL_BROADCAST_LIMIT;
  }
  return value;
}

export function platformEmailBroadcastLimit(env: NodeJS.ProcessEnv = process.env): number {
  return parsePlatformEmailBroadcastLimit(env[EMAIL_BROADCAST_LIMIT_ENV]);
}

export function effectiveEmailBroadcastLimit(
  eventOverride: number | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): number {
  if (
    typeof eventOverride === "number"
    && Number.isInteger(eventOverride)
    && eventOverride > 0
    && eventOverride <= MAX_EMAIL_BROADCAST_LIMIT
  ) {
    return eventOverride;
  }
  return platformEmailBroadcastLimit(env);
}

export function emailBroadcastRemaining(limit: number, used: number): number {
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  if (!Number.isFinite(used) || used <= 0) return limit;
  return Math.max(0, limit - used);
}

/**
 * True when another guest-broadcast email still fits in the guest email budget.
 * Host RSVP alerts and guest confirmations are not parameters: they spend
 * email_notification_limit and cannot block this check.
 */
export function guestEmailBroadcastAllowed(
  broadcastEmailsUsed: number,
  eventOverride: number | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const used = Number.isFinite(broadcastEmailsUsed) && broadcastEmailsUsed > 0 ? broadcastEmailsUsed : 0;
  return used < effectiveEmailBroadcastLimit(eventOverride, env);
}
