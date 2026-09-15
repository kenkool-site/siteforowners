import type {
  EffectiveEventState,
  InvitationEventStatus,
} from "./types";

export type { EffectiveEventState, InvitationEventStatus } from "./types";

export interface EventStateInput {
  status: InvitationEventStatus;
  rsvpDeadline: string | null;
  expireAt: string | null;
}

export function getEffectiveEventState(
  event: EventStateInput,
  now: Date,
): EffectiveEventState {
  if (event.status === "offline" || event.status === "draft") return event.status;
  if (event.status === "expired") return "expired";
  if (event.expireAt && Date.parse(event.expireAt) <= now.getTime()) return "expired";
  if (event.status === "rsvp_closed") return "rsvp_closed";
  if (event.rsvpDeadline && Date.parse(event.rsvpDeadline) <= now.getTime()) {
    return "rsvp_closed";
  }
  return "published";
}

export function canAcceptRsvp(state: EffectiveEventState): boolean {
  return state === "published";
}
