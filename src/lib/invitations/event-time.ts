type WallTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

const LOCAL_DATETIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function parseWallTime(value: string): WallTime {
  const match = LOCAL_DATETIME_PATTERN.exec(value);
  if (!match) throw new Error("Enter a valid local date and time");

  const [, year, month, day, hour, minute] = match;
  const wallTime = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
  };
  const timestamp = Date.UTC(
    wallTime.year,
    wallTime.month - 1,
    wallTime.day,
    wallTime.hour,
    wallTime.minute,
  );
  const normalized = new Date(timestamp);
  if (
    normalized.getUTCFullYear() !== wallTime.year ||
    normalized.getUTCMonth() + 1 !== wallTime.month ||
    normalized.getUTCDate() !== wallTime.day ||
    normalized.getUTCHours() !== wallTime.hour ||
    normalized.getUTCMinutes() !== wallTime.minute
  ) {
    throw new Error("Enter a valid local date and time");
  }
  return wallTime;
}

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    throw new Error("Enter a valid timezone");
  }
}

function getZonedParts(formatter: Intl.DateTimeFormat, timestamp: number): WallTime {
  const parts = formatter.formatToParts(new Date(timestamp));
  const values = new Map(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: values.get("year") ?? Number.NaN,
    month: values.get("month") ?? Number.NaN,
    day: values.get("day") ?? Number.NaN,
    hour: values.get("hour") ?? Number.NaN,
    minute: values.get("minute") ?? Number.NaN,
  };
}

function wallTimeMatches(left: WallTime, right: WallTime): boolean {
  return left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute;
}

function offsetAt(formatter: Intl.DateTimeFormat, timestamp: number): number {
  const parts = getZonedParts(formatter, timestamp);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - timestamp;
}

/**
 * Converts a datetime-local wall time in an IANA timezone to its UTC ISO instant.
 * A round-trip check rejects DST gaps instead of letting the runtime normalize them.
 */
export function zonedWallTimeToUtcIso(localDateTime: string, timeZone: string): string {
  const wallTime = parseWallTime(localDateTime);
  const formatter = formatterFor(timeZone);
  const wallTimestamp = Date.UTC(
    wallTime.year,
    wallTime.month - 1,
    wallTime.day,
    wallTime.hour,
    wallTime.minute,
  );
  const initialCandidate = wallTimestamp - offsetAt(formatter, wallTimestamp);
  const candidate = wallTimestamp - offsetAt(formatter, initialCandidate);

  if (!wallTimeMatches(getZonedParts(formatter, candidate), wallTime)) {
    throw new Error(`The selected local time does not exist in ${timeZone}`);
  }
  return new Date(candidate).toISOString();
}
