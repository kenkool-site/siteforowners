export type InvitationHostRole = "primary" | "cohost";

export type InvitationHostMembershipRow = {
  event_id: string;
};

export function uniqueEventIdsForHost(rows: InvitationHostMembershipRow[]): string[] {
  return Array.from(new Set(rows.map((row) => row.event_id)));
}
