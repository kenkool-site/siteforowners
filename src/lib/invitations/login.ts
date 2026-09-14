import { hashIp } from "@/lib/api-rate-limit";
import { normalizeInvitationEmail } from "./validation";
import type { InvitationLoginRateLimiter } from "./login-rate-limit";

const LOGIN_WINDOW_SECONDS = 60 * 60;
const IP_EMAIL_MAX_ATTEMPTS = 10;
const EMAIL_MAX_ATTEMPTS = 50;

// A fixed, valid scrypt record gives unknown-owner verification the same cost
// profile as a real PIN check without introducing a credential.
export const INVITATION_OWNER_DUMMY_PIN_HASH =
  "0cfa580ddcc7f86dd22d986f86adf645:2c39ad6883c33cc887be72d4b68e183946f5ae65b08e4bb4e40db311e0cc7c357364159a5364d1668d0702f9eb83282033430c894426ea1a95ea98fdf00f10a1";

export type InvitationLoginOwner = { id: string; pinHash: string };
export type InvitationLoginInput = { email: string; pin: string; ip: string };
export type InvitationLoginResult =
  | { kind: "success"; ownerId: string }
  | { kind: "invalid" }
  | { kind: "rate_limited" };

export interface InvitationLoginDependencies {
  findActiveOwner(email: string): Promise<InvitationLoginOwner | null>;
  verifyPin(pin: string, storedHash: string): Promise<boolean>;
  rateLimiter: InvitationLoginRateLimiter;
}

function loginBuckets(ip: string, email: string): [string, string] {
  return [
    `invitation_owner_login:ip_email:${hashIp(`${ip}:${email}`)}`,
    `invitation_owner_login:email:${hashIp(email)}`,
  ];
}

export async function attemptInvitationOwnerLogin(
  input: InvitationLoginInput,
  dependencies: InvitationLoginDependencies,
): Promise<InvitationLoginResult> {
  const email = normalizeInvitationEmail(input.email);
  if (!email || !/^\d{4,8}$/.test(input.pin)) return { kind: "invalid" };

  const [ipEmailBucket, emailBucket] = loginBuckets(input.ip, email);
  const [ipEmailAllowed, emailAllowed] = await Promise.all([
    dependencies.rateLimiter.canAttempt(ipEmailBucket, LOGIN_WINDOW_SECONDS, IP_EMAIL_MAX_ATTEMPTS),
    dependencies.rateLimiter.canAttempt(emailBucket, LOGIN_WINDOW_SECONDS, EMAIL_MAX_ATTEMPTS),
  ]);
  if (!ipEmailAllowed || !emailAllowed) return { kind: "rate_limited" };

  const owner = await dependencies.findActiveOwner(email);
  const pinMatches = await dependencies.verifyPin(
    input.pin,
    owner?.pinHash ?? INVITATION_OWNER_DUMMY_PIN_HASH,
  );
  if (owner && pinMatches) return { kind: "success", ownerId: owner.id };

  const [ipEmailRecorded, emailRecorded] = await Promise.all([
    dependencies.rateLimiter.recordFailure(ipEmailBucket, LOGIN_WINDOW_SECONDS, IP_EMAIL_MAX_ATTEMPTS),
    dependencies.rateLimiter.recordFailure(emailBucket, LOGIN_WINDOW_SECONDS, EMAIL_MAX_ATTEMPTS),
  ]);
  return ipEmailRecorded && emailRecorded ? { kind: "invalid" } : { kind: "rate_limited" };
}
