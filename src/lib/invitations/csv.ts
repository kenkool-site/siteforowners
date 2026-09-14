export type InvitationResponseCsvRow = {
  attending: boolean;
  primaryName: string;
  email: string | null;
  phone: string | null;
  partySize: number;
  additionalGuestNames: string[];
  dietaryOrAccessibilityNotes: string | null;
  message: string | null;
  createdAt: string;
  updatedAt: string;
};

const HEADERS = [
  "Response status",
  "Primary name",
  "Email",
  "Phone",
  "Party size",
  "Additional guests",
  "Dietary or accessibility notes",
  "Message",
  "Created time",
  "Updated time",
] as const;

function neutralizeFormula(value: string): string {
  return value.replace(/^(\s*)([=+\-@])/, "$1'$2");
}

function csvCell(value: string | number | null): string {
  const safe = neutralizeFormula(value === null ? "" : String(value));
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function responsesToCsv(rows: readonly InvitationResponseCsvRow[]): string {
  const lines = [
    HEADERS.map(csvCell).join(","),
    ...rows.map((row) => [
      row.attending ? "Attending" : "Declined",
      row.primaryName,
      row.email,
      row.phone,
      row.partySize,
      row.additionalGuestNames.join("; "),
      row.dietaryOrAccessibilityNotes,
      row.message,
      row.createdAt,
      row.updatedAt,
    ].map(csvCell).join(",")),
  ];
  return `${lines.join("\r\n")}\r\n`;
}
