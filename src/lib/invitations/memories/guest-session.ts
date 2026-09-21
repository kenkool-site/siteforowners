// src/lib/invitations/memories/guest-session.ts
import { createHmac, timingSafeEqual } from "node:crypto";
import type { MemoriesGuestSession } from "./types";

function getSessionSecret(): string {
  const secret = process.env.SESSION_COOKIE_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_COOKIE_SECRET must be set and at least 32 chars");
  }
  return secret;
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function signMemoriesGuestSession(
  session: MemoriesGuestSession,
  secret = getSessionSecret(),
): string {
  const body = encodeBase64Url(JSON.stringify(session));
  const signature = createHmac("sha256", secret).update(`memories-guest.${body}`).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyMemoriesGuestSession(
  token: string,
  eventId: string,
  secret = getSessionSecret(),
  now = Math.floor(Date.now() / 1000),
): MemoriesGuestSession | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;

  const expectedSignature = createHmac("sha256", secret).update(`memories-guest.${body}`).digest("base64url");
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (signatureBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) return null;

  let session: MemoriesGuestSession;
  try {
    session = JSON.parse(decodeBase64Url(body)) as MemoriesGuestSession;
  } catch {
    return null;
  }

  if (session.eventId !== eventId) return null;
  if (session.expiresAt <= now) return null;

  return session;
}
