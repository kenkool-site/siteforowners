export type InvitationHostRole = "primary" | "cohost";

export type InvitationHostMembershipRow = {
  event_id: string;
};

export function uniqueEventIdsForHost(rows: InvitationHostMembershipRow[]): string[] {
  return Array.from(new Set(rows.map((row) => row.event_id)));
}

export function canManageInvitationCohost(
  access: { kind: "founder" } | { kind: "owner"; ownerId: string } | null,
  primaryOwnerId: string,
): boolean {
  return access?.kind === "founder" || (access?.kind === "owner" && access.ownerId === primaryOwnerId);
}

export type InvitationCohostInput = { name: string; email: string; pin: string };
export type InvitationCohostInputResult =
  | { ok: true; value: InvitationCohostInput }
  | { ok: false; errors: Record<string, string> };

export function parseInvitationCohostInput(input: unknown): InvitationCohostInputResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, errors: { form: "Enter valid co-host details." } };
  const body = input as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const pin = typeof body.pin === "string" ? body.pin.trim() : "";
  const errors: Record<string, string> = {};
  if (!name || name.length > 120) errors.name = "Enter the co-host's name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid co-host email address.";
  if (!/^\d{6}$/.test(pin)) errors.pin = "Use exactly six digits for the co-host PIN.";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: { name, email, pin } };
}
