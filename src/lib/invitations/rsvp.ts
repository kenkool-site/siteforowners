import { createAdminClient } from "@/lib/supabase/admin";
import { createEditToken, hashEditToken } from "./auth";
import { getEffectiveEventState } from "./state";
import type { EffectiveEventState, InvitationEventStatus, RsvpMutationResult } from "./types";
import { parseRsvpInput, type ParsedRsvpInput } from "./validation";

export const INVITATION_RSVP_WINDOW_SECONDS = 10 * 60;
export const INVITATION_RSVP_MAX_ATTEMPTS = 20;

export type RsvpMutationKind = "create" | "update";
export type RsvpErrorCode =
  | "event_unavailable"
  | "rsvp_closed"
  | "capacity_reached"
  | "submission_limit_reached"
  | "duplicate_contact"
  | "invalid_edit_token"
  | "rate_limited";

type CapacityDeltaInput = {
  oldAttending: boolean;
  oldPartySize: number;
  attending: boolean;
  partySize: number;
};

export function capacityDelta(input: CapacityDeltaInput): number {
  const before = input.oldAttending ? input.oldPartySize : 0;
  const after = input.attending ? input.partySize : 0;
  return after - before;
}

export function canMutateRsvp(
  state: EffectiveEventState,
  mutation: RsvpMutationKind,
): boolean {
  return state === "published" || (state === "rsvp_closed" && mutation === "update");
}

const RPC_ERROR_CODES: Readonly<Record<string, RsvpErrorCode>> = {
  INVITE_EVENT_UNAVAILABLE: "event_unavailable",
  INVITE_RSVP_CLOSED: "rsvp_closed",
  INVITE_CAPACITY_REACHED: "capacity_reached",
  INVITE_SUBMISSION_LIMIT_REACHED: "submission_limit_reached",
  INVITE_DUPLICATE_CONTACT: "duplicate_contact",
  INVITE_INVALID_EDIT_TOKEN: "invalid_edit_token",
  INVITE_RATE_LIMITED: "rate_limited",
};

export function mapRsvpRpcError(error: unknown): RsvpErrorCode {
  if (!error || typeof error !== "object") return "event_unavailable";
  const message = (error as Record<string, unknown>).message;
  return typeof message === "string" && message in RPC_ERROR_CODES
    ? RPC_ERROR_CODES[message]!
    : "event_unavailable";
}

export type SubmitRsvpRpcInput = {
  eventId: string;
  existingRsvpId: string | null;
  editTokenHash: string;
  input: ParsedRsvpInput;
};

type SubmitRsvpRpcRow = {
  rsvp_id: string;
  mutation_kind: "created" | "updated";
  attending_total: number;
  declined_party_total: number;
  remaining_capacity: number | null;
};

type SubmitRsvpDependencies = {
  createToken(): { token: string; hash: string };
  hashToken(token: string): string;
  mutate(input: SubmitRsvpRpcInput): Promise<{ data: unknown; error: unknown | null }>;
};

export type SubmitRsvpRequest = {
  eventId: string;
  rsvpId?: string;
  editToken?: string;
  input: ParsedRsvpInput;
};

export type SubmitRsvpResult =
  | { ok: true; value: RsvpMutationResult }
  | { ok: false; code: RsvpErrorCode };

function isSubmitRsvpRpcRow(value: unknown): value is SubmitRsvpRpcRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.rsvp_id === "string"
    && (row.mutation_kind === "created" || row.mutation_kind === "updated")
    && typeof row.attending_total === "number"
    && typeof row.declined_party_total === "number"
    && (row.remaining_capacity === null || typeof row.remaining_capacity === "number");
}

export async function submitRsvp(
  request: SubmitRsvpRequest,
  dependencies: SubmitRsvpDependencies,
): Promise<SubmitRsvpResult> {
  const isUpdate = request.rsvpId !== undefined || request.editToken !== undefined;
  if (isUpdate && (!request.rsvpId || !request.editToken)) {
    return { ok: false, code: "invalid_edit_token" };
  }

  const credential = isUpdate
    ? { token: null, hash: dependencies.hashToken(request.editToken!) }
    : dependencies.createToken();
  const rpcInput: SubmitRsvpRpcInput = {
    eventId: request.eventId,
    existingRsvpId: request.rsvpId ?? null,
    editTokenHash: credential.hash,
    input: request.input,
  };
  const result = await dependencies.mutate(rpcInput);
  if (result.error) return { ok: false, code: mapRsvpRpcError(result.error) };
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!isSubmitRsvpRpcRow(row)) return { ok: false, code: "event_unavailable" };

  return {
    ok: true,
    value: {
      rsvp: {
        id: row.rsvp_id,
        eventId: request.eventId,
        ...request.input,
      },
      rsvpId: row.rsvp_id,
      created: row.mutation_kind === "created",
      attendingTotal: row.attending_total,
      declinedPartyTotal: row.declined_party_total,
      remainingCapacity: row.remaining_capacity,
      editToken: credential.token,
    },
  };
}

export async function submitInvitationRsvp(request: SubmitRsvpRequest): Promise<SubmitRsvpResult> {
  return submitRsvp(request, {
    createToken: createEditToken,
    hashToken: hashEditToken,
    mutate: async ({ eventId, existingRsvpId, editTokenHash, input }) => {
      const { data, error } = await createAdminClient().rpc("submit_invitation_rsvp", {
        p_event_id: eventId,
        p_primary_name: input.primaryName,
        p_email: input.email,
        p_phone: input.phone,
        p_attending: input.attending,
        p_party_size: input.partySize,
        p_additional_guest_names: input.additionalGuestNames,
        p_dietary_or_accessibility_notes: input.dietaryOrAccessibilityNotes,
        p_message: input.message,
        p_edit_token_hash: editTokenHash,
        p_existing_rsvp_id: existingRsvpId,
      });
      return { data, error };
    },
  });
}

type InvitationRsvpLimitAttempt = {
  eventId: string;
  ipHash: string;
  windowSeconds: number;
  maxAttempts: number;
};

type InvitationRsvpRateLimitDependencies = {
  attempt(input: InvitationRsvpLimitAttempt): Promise<{ data: boolean | null; error: unknown | null }>;
};

export function createInvitationRsvpRateLimiter(
  dependencies: InvitationRsvpRateLimitDependencies,
) {
  return {
    async allowAttempt(eventId: string, ipHash: string): Promise<boolean> {
      try {
        const result = await dependencies.attempt({
          eventId,
          ipHash,
          windowSeconds: INVITATION_RSVP_WINDOW_SECONDS,
          maxAttempts: INVITATION_RSVP_MAX_ATTEMPTS,
        });
        if (result.error || result.data !== true) {
          console.error("[invitations/rsvp] rate limit unavailable", { eventId, ipHash, error: result.error });
          return false;
        }
        return true;
      } catch (error) {
        console.error("[invitations/rsvp] rate limit unavailable", { eventId, ipHash, error });
        return false;
      }
    },
  };
}

export async function allowInvitationRsvpAttempt(eventId: string, ipHash: string): Promise<boolean> {
  const limiter = createInvitationRsvpRateLimiter({
    attempt: async (input) => {
      const { data, error } = await createAdminClient().rpc("attempt_invitation_rsvp_rate_limit", {
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

type PublicRsvpEventLookup = {
  event: {
    id: string;
    slug: string;
    status: InvitationEventStatus;
    rsvpDeadline: string | null;
    expireAt: string | null;
    showPublicRsvpCount: boolean;
  };
  passcodeHash: string | null;
};

type ProcessPublicRsvpContext = {
  body: unknown;
  ipHash: string;
  readPasscodeCookie(eventId: string): string | null;
  origin: string;
  now: Date;
};

type ProcessPublicRsvpDependencies = {
  findInvitation(slug: string): Promise<PublicRsvpEventLookup | null>;
  verifyPasscode(signed: string, eventId: string): boolean;
  allowAttempt(eventId: string, ipHash: string): Promise<boolean>;
  submit(request: SubmitRsvpRequest): Promise<SubmitRsvpResult>;
};

export type PublicRsvpResponse = {
  status: number;
  body: Record<string, unknown>;
};

type ParsedPublicRsvpRequest = {
  slug: string;
  rsvpId?: string;
  editToken?: string;
  rsvp: ParsedRsvpInput;
};

function parsePublicRsvpRequest(value: unknown):
  | { ok: true; value: ParsedPublicRsvpRequest }
  | { ok: false; code: "invalid_request" | "invalid_edit_token"; errors?: Record<string, string> } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, code: "invalid_request" };
  }
  const body = value as Record<string, unknown>;
  if (typeof body.slug !== "string" || !body.slug || body.slug.length > 100 || !("rsvp" in body)) {
    return { ok: false, code: "invalid_request" };
  }
  const hasRsvpId = body.rsvpId !== undefined;
  const hasEditToken = body.editToken !== undefined;
  if (hasRsvpId !== hasEditToken) return { ok: false, code: "invalid_edit_token" };
  if (hasRsvpId && (
    typeof body.rsvpId !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.rsvpId)
    || typeof body.editToken !== "string"
    || !body.editToken
    || body.editToken.length > 256
  )) return { ok: false, code: "invalid_edit_token" };
  const parsed = parseRsvpInput(body.rsvp);
  if (!parsed.ok) return { ok: false, code: "invalid_request", errors: parsed.errors };
  return {
    ok: true,
    value: {
      slug: body.slug,
      rsvpId: body.rsvpId as string | undefined,
      editToken: body.editToken as string | undefined,
      rsvp: parsed.value,
    },
  };
}

const HTTP_STATUS_BY_RSVP_CODE: Readonly<Record<RsvpErrorCode, number>> = {
  event_unavailable: 404,
  rsvp_closed: 409,
  capacity_reached: 409,
  submission_limit_reached: 409,
  duplicate_contact: 409,
  invalid_edit_token: 401,
  rate_limited: 429,
};

export function editUrl(origin: string, slug: string, rsvpId: string, token: string): string {
  const url = new URL(`/invite/${encodeURIComponent(slug)}`, origin);
  url.hash = new URLSearchParams({ rsvpId, editToken: token }).toString();
  return url.toString();
}

export async function processPublicRsvpRequest(
  context: ProcessPublicRsvpContext,
  dependencies: ProcessPublicRsvpDependencies,
): Promise<PublicRsvpResponse> {
  const parsed = parsePublicRsvpRequest(context.body);
  if (!parsed.ok) {
    return {
      status: 400,
      body: { ok: false, code: parsed.code, ...(parsed.errors ? { errors: parsed.errors } : {}) },
    };
  }
  const request = parsed.value;
  const invitation = await dependencies.findInvitation(request.slug);
  if (!invitation) return { status: 404, body: { ok: false, code: "event_unavailable" } };

  const state = getEffectiveEventState(invitation.event, context.now);
  if (state === "draft" || state === "expired" || state === "offline") {
    return { status: 404, body: { ok: false, code: "event_unavailable" } };
  }
  if (invitation.passcodeHash) {
    const signed = context.readPasscodeCookie(invitation.event.id);
    if (!signed || !dependencies.verifyPasscode(signed, invitation.event.id)) {
      return { status: 403, body: { ok: false, code: "event_unavailable" } };
    }
  }

  const mutation: RsvpMutationKind = request.rsvpId ? "update" : "create";
  if (!canMutateRsvp(state, mutation)) {
    return { status: 409, body: { ok: false, code: "rsvp_closed" } };
  }
  if (!await dependencies.allowAttempt(invitation.event.id, context.ipHash)) {
    return { status: 429, body: { ok: false, code: "rate_limited" } };
  }

  const result = await dependencies.submit({
    eventId: invitation.event.id,
    rsvpId: request.rsvpId,
    editToken: request.editToken,
    input: request.rsvp,
  });
  if (!result.ok) {
    return { status: HTTP_STATUS_BY_RSVP_CODE[result.code], body: { ok: false, code: result.code } };
  }

  const response: Record<string, unknown> = {
    ok: true,
    rsvpId: result.value.rsvpId,
    created: result.value.created,
  };
  if (result.value.editToken) {
    response.editUrl = editUrl(
      context.origin,
      invitation.event.slug,
      result.value.rsvpId,
      result.value.editToken,
    );
  }
  if (invitation.event.showPublicRsvpCount) {
    response.summary = {
      attendingPeople: result.value.attendingTotal,
      declinedParties: result.value.declinedPartyTotal,
      remainingCapacity: result.value.remainingCapacity,
    };
  }
  return { status: 200, body: response };
}
