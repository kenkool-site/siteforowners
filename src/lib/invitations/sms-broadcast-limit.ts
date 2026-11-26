/**
 * Guest-broadcast SMS budget. Separate from invitation_events.sms_notification_limit,
 * which caps texts to the host when someone RSVPs (and guest confirmation texts).
 *
 * NULL sms_broadcast_limit on the event means "use the platform default":
 * INVITATION_SMS_BROADCAST_LIMIT when that env var is a positive integer, otherwise 500.
 * A founder-set per-event value replaces the platform default.
 */

export const SMS_BROADCAST_LIMIT_ENV = "INVITATION_SMS_BROADCAST_LIMIT";
export const DEFAULT_SMS_BROADCAST_LIMIT = 500;
export const MAX_SMS_BROADCAST_LIMIT = 1_000_000;

export function parsePlatformSmsBroadcastLimit(raw: string | undefined | null): number {
  if (raw == null) return DEFAULT_SMS_BROADCAST_LIMIT;
  const trimmed = raw.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) return DEFAULT_SMS_BROADCAST_LIMIT;
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_SMS_BROADCAST_LIMIT) {
    return DEFAULT_SMS_BROADCAST_LIMIT;
  }
  return value;
}

export function platformSmsBroadcastLimit(env: NodeJS.ProcessEnv = process.env): number {
  return parsePlatformSmsBroadcastLimit(env[SMS_BROADCAST_LIMIT_ENV]);
}

export function effectiveSmsBroadcastLimit(
  eventOverride: number | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): number {
  if (
    typeof eventOverride === "number"
    && Number.isInteger(eventOverride)
    && eventOverride > 0
    && eventOverride <= MAX_SMS_BROADCAST_LIMIT
  ) {
    return eventOverride;
  }
  return platformSmsBroadcastLimit(env);
}

export function smsBroadcastRemaining(limit: number, used: number): number {
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  if (!Number.isFinite(used) || used <= 0) return limit;
  return Math.max(0, limit - used);
}
