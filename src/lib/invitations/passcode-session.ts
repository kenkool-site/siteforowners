// Split out of ./auth so src/middleware.ts (Edge Runtime) can import the
// passcode-session helpers without pulling in that module's top-level
// `node:crypto` import (used there only by the unrelated owner-session and
// edit-token functions). Webpack's edge bundler fails the whole build with
// an UnhandledSchemeError the moment ANY module reachable from middleware.ts
// statically imports "node:crypto" — it doesn't matter that middleware never
// calls the owner-session code; the import alone is enough to break the
// build. Everything here is intentionally Web Crypto (crypto.subtle) only,
// per the Task 1 rewrite that made these functions Edge-compatible in the
// first place. ./auth re-exports all of this so its ~38 existing (Node
// runtime) consumers are unaffected.
import { NextResponse } from "next/server";

export const INVITATION_PASSCODE_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

export type InvitationPasscodeSession = {
  eventId: string;
  expiresAt: number;
};

function getSessionSecret(): string {
  const secret = process.env.SESSION_COOKIE_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_COOKIE_SECRET must be set and at least 32 chars");
  }
  return secret;
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

async function hmacSha256(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return new Uint8Array(signature);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function base64UrlToBytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

function isInvitationPasscodeSession(value: unknown): value is InvitationPasscodeSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Record<string, unknown>;
  return typeof session.eventId === "string" && typeof session.expiresAt === "number";
}

export function getInvitationPasscodeCookieName(eventId: string): string {
  return `invitation_passcode_${eventId}`;
}

export async function signInvitationPasscodeSession(
  session: InvitationPasscodeSession,
  secret = getSessionSecret(),
): Promise<string> {
  const body = encodeBase64Url(JSON.stringify(session));
  const signatureBytes = await hmacSha256(secret, `passcode.${body}`);
  return `${body}.${bytesToBase64Url(signatureBytes)}`;
}

export async function verifyInvitationPasscodeSession(
  signed: string,
  eventId: string,
  secret = getSessionSecret(),
  now = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  try {
    const [body, signature, extra] = signed.split(".");
    if (!body || !signature || extra) return false;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      // Cast needed: @types/node's Buffer-backed Uint8Array is generic over
      // ArrayBufferLike (which includes SharedArrayBuffer), while lib.dom's
      // BufferSource requires ArrayBuffer specifically. Buffer.from() never
      // actually backs onto a SharedArrayBuffer, so this is a type-level
      // mismatch only, not a runtime one.
      base64UrlToBytes(signature) as BufferSource,
      new TextEncoder().encode(`passcode.${body}`),
    );
    if (!valid) return false;
    const parsed: unknown = JSON.parse(decodeBase64Url(body));
    return isInvitationPasscodeSession(parsed) && parsed.eventId === eventId && parsed.expiresAt > now;
  } catch {
    return false;
  }
}

export async function setInvitationPasscodeCookie(
  response: NextResponse,
  event: { id: string; slug: string; expireAt: string | null },
  now = new Date(),
): Promise<void> {
  const nowSeconds = Math.floor(now.getTime() / 1_000);
  const twelveHourExpiry = nowSeconds + INVITATION_PASSCODE_SESSION_MAX_AGE_SECONDS;
  const eventExpiry = event.expireAt ? Math.floor(Date.parse(event.expireAt) / 1_000) : null;
  const expiresAt = eventExpiry && Number.isFinite(eventExpiry)
    ? Math.min(twelveHourExpiry, eventExpiry)
    : twelveHourExpiry;
  const maxAge = Math.max(0, expiresAt - nowSeconds);
  response.cookies.set(
    getInvitationPasscodeCookieName(event.id),
    await signInvitationPasscodeSession({ eventId: event.id, expiresAt }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge,
      expires: new Date(expiresAt * 1_000),
      // The signed, event-scoped cookie must reach both the public page and
      // /api/invitations/rsvp, which do not share a narrower URL prefix.
      path: "/",
    },
  );
}
