import { hashIp } from "@/lib/api-rate-limit";

export const INVITATION_PASSCODE_WINDOW_SECONDS = 60 * 60;
export const INVITATION_PASSCODE_MAX_ATTEMPTS = 10;

export type InvitationPasscodeAttempt = {
  eventId: string;
  passcode: string;
  storedHash: string;
  ip: string;
};

export type InvitationPasscodeResult = "success" | "invalid" | "rate_limited";

export type InvitationPasscodeDependencies = {
  allowAttempt(bucket: string): Promise<boolean>;
  verifyPasscode(passcode: string, storedHash: string): Promise<boolean>;
};

export function invitationPasscodeBucket(eventId: string, ip: string): string {
  return `invitation_passcode:${eventId}:${hashIp(ip)}`;
}

export async function attemptInvitationPasscode(
  input: InvitationPasscodeAttempt,
  dependencies: InvitationPasscodeDependencies,
): Promise<InvitationPasscodeResult> {
  const allowed = await dependencies.allowAttempt(invitationPasscodeBucket(input.eventId, input.ip));
  if (!allowed) return "rate_limited";
  return await dependencies.verifyPasscode(input.passcode, input.storedHash)
    ? "success"
    : "invalid";
}
