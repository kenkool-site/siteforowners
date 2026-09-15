export function isInvitationE2EFixturesEnabled(
  env: Partial<Pick<NodeJS.ProcessEnv, "NODE_ENV" | "INVITATION_E2E_FIXTURES">> = process.env,
): boolean {
  return env.NODE_ENV !== "production" && env.INVITATION_E2E_FIXTURES === "1";
}
