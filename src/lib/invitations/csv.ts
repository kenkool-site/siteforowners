import type { InvitationLocale } from "./types";

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

const CSV_COPY: Record<InvitationLocale, {
  headers: readonly string[];
  attending: string;
  declined: string;
}> = {
  en: {
    headers: [
      "Response status", "Primary name", "Email", "Phone", "Party size",
      "Additional guests", "Dietary or accessibility notes", "Message",
      "Created time", "Updated time",
    ],
    attending: "Attending",
    declined: "Declined",
  },
  es: {
    headers: [
      "Estado de respuesta", "Nombre principal", "Correo", "Teléfono", "Tamaño del grupo",
      "Invitados adicionales", "Notas de dieta o accesibilidad", "Mensaje",
      "Fecha de creación", "Fecha de actualización",
    ],
    attending: "Asistirá",
    declined: "No asistirá",
  },
};

function neutralizeFormula(value: string): string {
  return value.replace(/^(\s*)([=+\-@])/, "$1'$2");
}

function csvCell(value: string | number | null): string {
  const safe = neutralizeFormula(value === null ? "" : String(value));
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function responsesToCsv(
  rows: readonly InvitationResponseCsvRow[],
  locale: InvitationLocale = "en",
): string {
  const copy = CSV_COPY[locale];
  const lines = [
    copy.headers.map(csvCell).join(","),
    ...rows.map((row) => [
      row.attending ? copy.attending : copy.declined,
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
