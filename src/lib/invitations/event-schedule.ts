export const MAX_EVENT_SCHEDULE_ITEMS = 20;
export const MAX_EVENT_SCHEDULE_NAME_LENGTH = 80;
export const MAX_EVENT_SCHEDULE_LOCATION_NAME_LENGTH = 120;
export const MAX_EVENT_SCHEDULE_LOCATION_ADDRESS_LENGTH = 300;

export type EventScheduleItem = {
  name: string;
  startsAt: string;
  locationName?: string;
  locationAddress?: string;
};

export type EventScheduleParseResult =
  | { ok: true; value: EventScheduleItem[] }
  | { ok: false; error: string };

export function parseInvitationEventSchedule(value: unknown): EventScheduleParseResult {
  if (!Array.isArray(value) || value.length > MAX_EVENT_SCHEDULE_ITEMS) {
    return { ok: false, error: `Add no more than ${MAX_EVENT_SCHEDULE_ITEMS} schedule items.` };
  }

  const items: EventScheduleItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, error: "Complete or remove each schedule item." };
    }
    const record = raw as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const startsAtRaw = typeof record.startsAt === "string" ? record.startsAt.trim() : "";
    const locationName = typeof record.locationName === "string" ? record.locationName.trim() : "";
    const locationAddress = typeof record.locationAddress === "string" ? record.locationAddress.trim() : "";

    if (!name && !startsAtRaw) continue;
    if (!name) return { ok: false, error: "Each schedule item needs a name." };
    if (name.length > MAX_EVENT_SCHEDULE_NAME_LENGTH) {
      return { ok: false, error: `Keep each schedule item's name under ${MAX_EVENT_SCHEDULE_NAME_LENGTH} characters.` };
    }
    if (!startsAtRaw || Number.isNaN(Date.parse(startsAtRaw))) {
      return { ok: false, error: "Each schedule item needs a valid time." };
    }
    if (locationName.length > MAX_EVENT_SCHEDULE_LOCATION_NAME_LENGTH) {
      return { ok: false, error: `Keep each location name under ${MAX_EVENT_SCHEDULE_LOCATION_NAME_LENGTH} characters.` };
    }
    if (locationAddress.length > MAX_EVENT_SCHEDULE_LOCATION_ADDRESS_LENGTH) {
      return { ok: false, error: `Keep each address under ${MAX_EVENT_SCHEDULE_LOCATION_ADDRESS_LENGTH} characters.` };
    }

    const item: EventScheduleItem = { name, startsAt: new Date(startsAtRaw).toISOString() };
    if (locationName) item.locationName = locationName;
    if (locationAddress) item.locationAddress = locationAddress;
    items.push(item);
  }

  items.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  return { ok: true, value: items };
}

export function normalizeInvitationEventSchedule(value: unknown): EventScheduleItem[] {
  const parsed = parseInvitationEventSchedule(value);
  return parsed.ok ? parsed.value : [];
}

const DEFAULT_INFERRED_DURATION_MS = 2 * 60 * 60 * 1000;

export function computeInferredScheduleRanges(
  items: EventScheduleItem[],
): Array<{ item: EventScheduleItem; startsAt: string; endsAt: string }> {
  return items.map((item, index) => {
    const next = items[index + 1];
    const endsAt = next
      ? next.startsAt
      : new Date(Date.parse(item.startsAt) + DEFAULT_INFERRED_DURATION_MS).toISOString();
    return { item, startsAt: item.startsAt, endsAt };
  });
}
