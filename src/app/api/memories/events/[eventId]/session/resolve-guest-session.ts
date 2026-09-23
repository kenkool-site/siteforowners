import { verifyEditToken } from "@/lib/invitations/auth";
import type { MemoriesGuestSession } from "@/lib/invitations/memories/types";

// ~13 months — comfortably covers the 12-month gallery-availability window
export const SESSION_LIFETIME_SECONDS = 400 * 24 * 60 * 60;

// Pure decision logic, kept out of route.ts because Next.js's generated route
// types only permit a route module to export HTTP method handlers and a small
// fixed set of config keys — any other named export fails `.next/types`
// type-checking. Extracted so the one genuinely security-relevant thing the
// session route does — deciding anonymous vs. rsvp_guest — has real unit
// coverage without needing HTTP-level route integration testing, which this
// codebase's `tsx --test` convention doesn't support.
//
// Takes the already-fetched RSVP row (repository/DB access stays in the route)
// plus the guest-provided credential and name, and returns the resulting
// session. A bad/absent/mismatched credential always falls back to
// "anonymous" rather than erroring.
export function resolveMemoriesGuestSession(
  eventId: string,
  rsvpRow: { primaryName: string | null; editTokenHash: string } | null,
  providedCredential: { rsvpId: string; editToken: string } | null,
  providedGuestName: string | undefined,
  now: number = Math.floor(Date.now() / 1000),
  sessionId?: string,
): MemoriesGuestSession {
  const expiresAt = now + SESSION_LIFETIME_SECONDS;

  if (providedCredential && rsvpRow && verifyEditToken(providedCredential.editToken, rsvpRow.editTokenHash)) {
    return {
      eventId,
      sessionId,
      level: "rsvp_guest",
      rsvpId: providedCredential.rsvpId,
      guestName: providedGuestName ?? rsvpRow.primaryName ?? undefined,
      expiresAt,
    };
  }

  return {
    eventId,
    sessionId,
    level: "anonymous",
    guestName: providedGuestName,
    expiresAt,
  };
}
