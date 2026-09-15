export type InvitationAirport = {
  name: string;
  note: string | null;
  directionsUrl: string | null;
};

export type InvitationHotel = {
  name: string;
  address: string;
  recommended: boolean;
};

export type InvitationTravelInfo = {
  airports: InvitationAirport[];
  hotels: InvitationHotel[];
};

export const EMPTY_INVITATION_TRAVEL_INFO: InvitationTravelInfo = { airports: [], hotels: [] };

type TravelResult =
  | { ok: true; value: InvitationTravelInfo }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function trimmed(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}

function safeWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function parseInvitationTravelInfo(input: unknown): TravelResult {
  if (!isRecord(input) || !Array.isArray(input.airports) || !Array.isArray(input.hotels)) {
    return { ok: false, error: "Enter valid travel information." };
  }
  if (input.airports.length > 3 || input.hotels.length > 5) {
    return { ok: false, error: "Add no more than 3 airports and 5 hotels." };
  }

  const airports: InvitationAirport[] = [];
  for (const row of input.airports) {
    if (!isRecord(row)) return { ok: false, error: "Enter valid airport information." };
    const name = trimmed(row.name);
    const note = trimmed(row.note);
    const directionsUrl = trimmed(row.directionsUrl);
    if (!name && !note && !directionsUrl) continue;
    if (!name || name.length > 120 || (note?.length ?? 0) > 240) {
      return { ok: false, error: "Each airport needs a name and valid optional details." };
    }
    if (directionsUrl && (directionsUrl.length > 2048 || !safeWebUrl(directionsUrl))) {
      return { ok: false, error: "Use a valid airport directions link." };
    }
    airports.push({ name, note, directionsUrl });
  }

  const hotels: InvitationHotel[] = [];
  for (const row of input.hotels) {
    if (!isRecord(row) || typeof row.recommended !== "boolean") {
      return { ok: false, error: "Enter valid hotel information." };
    }
    const name = trimmed(row.name);
    const address = trimmed(row.address);
    if (!name && !address) continue;
    if (!name || !address || name.length > 120 || address.length > 240) {
      return { ok: false, error: "Each hotel needs a name and address." };
    }
    hotels.push({ name, address, recommended: row.recommended });
  }
  if (hotels.filter((hotel) => hotel.recommended).length > 1) {
    return { ok: false, error: "Choose no more than one recommended hotel." };
  }
  return { ok: true, value: { airports, hotels } };
}

export function normalizeInvitationTravelInfo(input: unknown): InvitationTravelInfo {
  const parsed = parseInvitationTravelInfo(input);
  return parsed.ok ? parsed.value : { airports: [], hotels: [] };
}

export function hotelMapUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
