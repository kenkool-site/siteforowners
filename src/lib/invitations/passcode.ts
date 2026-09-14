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
  allowAttempt(eventId: string, ipHash: string): Promise<boolean>;
  verifyPasscode(passcode: string, storedHash: string): Promise<boolean>;
};

export async function attemptInvitationPasscode(
  input: InvitationPasscodeAttempt,
  dependencies: InvitationPasscodeDependencies,
): Promise<InvitationPasscodeResult> {
  const allowed = await dependencies.allowAttempt(input.eventId, hashIp(input.ip));
  if (!allowed) return "rate_limited";
  return await dependencies.verifyPasscode(input.passcode, input.storedHash)
    ? "success"
    : "invalid";
}
