export function hasFounderInvitationSession(
  adminPassword: string | undefined,
  sessionCookie: string | undefined,
): boolean {
  return Boolean(adminPassword && sessionCookie === adminPassword);
}
