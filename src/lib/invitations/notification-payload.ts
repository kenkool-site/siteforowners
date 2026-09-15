import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

function key(secret: string | undefined): Buffer {
  if (!secret || secret.length < 32) throw new Error("Notification payload key unavailable");
  return Buffer.from(hkdfSync("sha256", secret, "siteforowners", "invitation-notification-payload-v1", 32));
}

export function sealNotificationPayload(payload: string, id: string, secret = process.env.SESSION_COOKIE_SECRET): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), nonce);
  cipher.setAAD(Buffer.from(`invitation-notification-v1:${id}`));
  const encrypted = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  return ["v1", nonce.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function openNotificationPayload(sealed: string, id: string, secret = process.env.SESSION_COOKIE_SECRET): string {
  const [version, nonce, tag, body, extra] = sealed.split(".");
  if (version !== "v1" || !nonce || !tag || !body || extra) throw new Error("Notification payload unavailable");
  const decipher = createDecipheriv("aes-256-gcm", key(secret), Buffer.from(nonce, "base64url"));
  decipher.setAAD(Buffer.from(`invitation-notification-v1:${id}`));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}
