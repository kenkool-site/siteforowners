// src/app/api/invitations/events/[eventId]/memories/highlights/highlight-validation.ts
//
// Pure validation/lookup helpers for the host Highlights route, pulled out of
// route.ts so they can be unit-tested directly under tsx --test without a
// real Supabase instance — mirrors the sibling
// .../memories/session/resolve-guest-session.ts pattern of a pure decision
// module next to its route.ts.
import type { HighlightMode, MemoryHighlightGroup } from "@/lib/invitations/memories/highlight-types";

export const MAX_GROUP_NAME_LENGTH = 80;
export const MAX_GROUP_DESCRIPTION_LENGTH = 300;

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

// Required, non-blank, at most 80 characters after trimming. Unlike
// OwnerMomentsManager's Moments name field (moments/route.ts silently
// truncates via .slice(0, 80)), an over-length highlight group name is
// rejected outright rather than silently shortened.
export function validateGroupName(input: unknown): ValidationResult<string> {
  if (typeof input !== "string") return { ok: false, error: "name is required" };
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: "name is required" };
  if (trimmed.length > MAX_GROUP_NAME_LENGTH) {
    return { ok: false, error: `name must be ${MAX_GROUP_NAME_LENGTH} characters or fewer` };
  }
  return { ok: true, value: trimmed };
}

// Optional. undefined/null/blank-after-trim all normalize to null ("no
// description" / "clear the description"); anything else must be a string of
// at most 300 characters after trimming.
export function validateGroupDescription(input: unknown): ValidationResult<string | null> {
  if (input === null || input === undefined) return { ok: true, value: null };
  if (typeof input !== "string") return { ok: false, error: "description must be text" };
  const trimmed = input.trim();
  if (trimmed.length > MAX_GROUP_DESCRIPTION_LENGTH) {
    return { ok: false, error: `description must be ${MAX_GROUP_DESCRIPTION_LENGTH} characters or fewer` };
  }
  return { ok: true, value: trimmed || null };
}

export function isValidHighlightMode(input: unknown): input is HighlightMode {
  return input === "automatic" || input === "host_defined";
}

export function isValidSortOrder(input: unknown): input is number {
  return typeof input === "number" && Number.isFinite(input) && input >= 0;
}

// Host-defined-group ownership check shared by PATCH's update_group action
// and DELETE. `groups` must already be pre-scoped to this event AND
// source = 'host_defined' (via listMemoryHighlightGroups(eventId,
// "host_defined")) — this function only does the id lookup within that
// pre-scoped list, so a group id belonging to a different event, or a
// same-event automatic/fallback group, both correctly resolve to undefined
// ("not found") rather than ever being mutated.
export function findHostDefinedGroup(groups: MemoryHighlightGroup[], id: unknown): MemoryHighlightGroup | undefined {
  if (typeof id !== "string" || !id) return undefined;
  return groups.find((group) => group.id === id);
}
