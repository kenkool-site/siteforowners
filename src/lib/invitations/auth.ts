import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const INVITATION_OWNER_SESSION_COOKIE = "invitation_owner_session";
export const INVITATION_OWNER_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
export const INVITATION_PASSCODE_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

export type OwnerSession = {
  ownerId: string;
  expiresAt: number;
};

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

function isOwnerSession(value: unknown): value is OwnerSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Record<string, unknown>;
  return typeof session.ownerId === "string" && typeof session.expiresAt === "number";
}

function isInvitationPasscodeSession(value: unknown): value is InvitationPasscodeSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Record<string, unknown>;
  return typeof session.eventId === "string" && typeof session.expiresAt === "number";
}

export function signOwnerSession(session: OwnerSession, secret = getSessionSecret()): string {
  const body = encodeBase64Url(JSON.stringify(session));
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyOwnerSession(
  signed: string,
  secret = getSessionSecret(),
  now = Math.floor(Date.now() / 1000),
): OwnerSession | null {
  try {
    const [body, signature, extra] = signed.split(".");
    if (!body || !signature || extra) return null;
    const expected = createHmac("sha256", secret).update(body).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

    const parsed: unknown = JSON.parse(decodeBase64Url(body));
    if (!isOwnerSession(parsed) || parsed.expiresAt <= now) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getInvitationPasscodeCookieName(eventId: string): string {
  return `invitation_passcode_${eventId}`;
}

export function signInvitationPasscodeSession(
  session: InvitationPasscodeSession,
  secret = getSessionSecret(),
): string {
  const body = encodeBase64Url(JSON.stringify(session));
  const signature = createHmac("sha256", secret).update(`passcode.${body}`).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyInvitationPasscodeSession(
  signed: string,
  eventId: string,
  secret = getSessionSecret(),
  now = Math.floor(Date.now() / 1000),
): boolean {
  try {
    const [body, signature, extra] = signed.split(".");
    if (!body || !signature || extra) return false;
    const expected = createHmac("sha256", secret).update(`passcode.${body}`).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
    const parsed: unknown = JSON.parse(decodeBase64Url(body));
    return isInvitationPasscodeSession(parsed)
      && parsed.eventId === eventId
      && parsed.expiresAt > now;
  } catch {
    return false;
  }
}

export function setInvitationPasscodeCookie(
  response: NextResponse,
  event: { id: string; slug: string; expireAt: string | null },
  now = new Date(),
): void {
  const nowSeconds = Math.floor(now.getTime() / 1_000);
  const twelveHourExpiry = nowSeconds + INVITATION_PASSCODE_SESSION_MAX_AGE_SECONDS;
  const eventExpiry = event.expireAt ? Math.floor(Date.parse(event.expireAt) / 1_000) : null;
  const expiresAt = eventExpiry && Number.isFinite(eventExpiry)
    ? Math.min(twelveHourExpiry, eventExpiry)
    : twelveHourExpiry;
  const maxAge = Math.max(0, expiresAt - nowSeconds);
  response.cookies.set(
    getInvitationPasscodeCookieName(event.id),
    signInvitationPasscodeSession({ eventId: event.id, expiresAt }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge,
      expires: new Date(expiresAt * 1_000),
      path: `/invite/${encodeURIComponent(event.slug)}`,
    },
  );
}

export function createEditToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashEditToken(token) };
}

export function hashEditToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyEditToken(token: string, storedHash: string): boolean {
  const actual = Buffer.from(hashEditToken(token), "hex");
  const expected = Buffer.from(storedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function setOwnerSessionCookie(response: NextResponse, ownerId: string): void {
  const expiresAt = Math.floor(Date.now() / 1000) + INVITATION_OWNER_SESSION_MAX_AGE_SECONDS;
  response.cookies.set(
    INVITATION_OWNER_SESSION_COOKIE,
    signOwnerSession({ ownerId, expiresAt }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: INVITATION_OWNER_SESSION_MAX_AGE_SECONDS,
      path: "/",
    },
  );
}

export function clearOwnerSessionCookie(response: NextResponse): void {
  response.cookies.set(INVITATION_OWNER_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}

export function readOwnerSession(request: NextRequest): OwnerSession | null {
  const signed = request.cookies.get(INVITATION_OWNER_SESSION_COOKIE)?.value;
  return signed ? verifyOwnerSession(signed) : null;
}

export function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const originUrl = new URL(origin);
    if (originUrl.protocol !== "http:" && originUrl.protocol !== "https:") return false;
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const host = forwardedHost || request.headers.get("host");
    const protocol = forwardedProtocol || new URL(request.url).protocol.replace(":", "");
    if (!host || (protocol !== "http" && protocol !== "https")) return false;
    return originUrl.origin === new URL(`${protocol}://${host}`).origin;
  } catch {
    return false;
  }
}
