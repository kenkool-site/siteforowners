import { createHash } from "node:crypto";
import type { InvitationEventStatus } from "./types";

export type PublicInvitationComment = {
  id: string;
  guestName: string;
  body: string;
  createdAt: string;
};

export type InvitationCommentForManagement = PublicInvitationComment & {
  isHidden: boolean;
  updatedAt: string;
};

export type InvitationCommentPage = {
  comments: PublicInvitationComment[];
  nextCursor: string | null;
};

export type InvitationGuestbookSummary = {
  enabled: boolean;
  totalCount: number;
  newCount: number;
};

export type InvitationCommentInput = { guestName: string; body: string; honeypot: string };
export type InvitationCommentErrorCode = "comment_wall_closed" | "rate_limited" | "invalid_request" | "event_unavailable";
export type InvitationCommentSubmitResult =
  | { ok: true; comment: PublicInvitationComment; outcome: "created" | "duplicate" }
  | { ok: false; code: InvitationCommentErrorCode };

export type InvitationCommentRow = {
  id: string;
  event_id: string;
  guest_name: string;
  body: string;
  is_hidden: boolean;
  created_at: string;
  updated_at: string;
};

export type InvitationCommentCursor = { createdAt: string; id: string };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseInvitationCommentInput(input: unknown): { ok: true; value: InvitationCommentInput } | { ok: false; errors: Record<string, string> } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, errors: { form: "invalid" } };
  const row = input as Record<string, unknown>;
  const guestName = typeof row.guestName === "string" ? row.guestName.trim() : "";
  const body = typeof row.body === "string" ? row.body.trim() : "";
  const honeypot = typeof row.website === "string" ? row.website.trim() : "";
  const errors: Record<string, string> = {};
  if (!guestName || guestName.length > 80) errors.guestName = "invalid";
  if (!body || body.length > 1_000) errors.body = "invalid";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: { guestName, body, honeypot } };
}

export function encodeCommentCursor(value: InvitationCommentCursor): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function decodeCommentCursor(value: string | null | undefined): InvitationCommentCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
    if (typeof parsed.createdAt !== "string" || Number.isNaN(Date.parse(parsed.createdAt)) || typeof parsed.id !== "string" || !UUID_PATTERN.test(parsed.id)) return null;
    return { createdAt: new Date(parsed.createdAt).toISOString(), id: parsed.id };
  } catch { return null; }
}

export function canUseInvitationCommentWall(event: { status: InvitationEventStatus; expireAt: string | null; commentWallEnabled: boolean }, now = new Date()): boolean {
  return event.commentWallEnabled
    && (event.status === "published" || event.status === "rsvp_closed")
    && (!event.expireAt || Date.parse(event.expireAt) > now.getTime());
}

export function toPublicInvitationComment(row: Pick<InvitationCommentRow, "id" | "guest_name" | "body" | "created_at">): PublicInvitationComment {
  return { id: row.id, guestName: row.guest_name, body: row.body, createdAt: row.created_at };
}

export function toManagementInvitationComment(row: InvitationCommentRow): InvitationCommentForManagement {
  return { ...toPublicInvitationComment(row), isHidden: row.is_hidden, updatedAt: row.updated_at };
}

export function invitationCommentContentHash(input: Pick<InvitationCommentInput, "guestName" | "body">): string {
  return createHash("sha256").update(`${input.guestName.toLocaleLowerCase("en-US")}\n${input.body}`).digest("hex");
}

export function buildInvitationGuestbookSummary(input: { enabled: boolean; reviewedAt: string | null; createdAt: string[] }): InvitationGuestbookSummary {
  const reviewed = input.reviewedAt ? Date.parse(input.reviewedAt) : Number.NEGATIVE_INFINITY;
  return { enabled: input.enabled, totalCount: input.createdAt.length, newCount: input.createdAt.filter((value) => Date.parse(value) > reviewed).length };
}

export function isInvitationCommentId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}
