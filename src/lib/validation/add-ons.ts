import type { AddOn } from "@/lib/ai/types";

export interface AddOnValidationError {
  field: string;
  reason: string;
}

export type AddOnValidationResult =
  | { ok: true; value: AddOn[] }
  | { ok: false; errors: AddOnValidationError[] };

const MAX_ENTRIES = 5;
const MAX_NAME_LENGTH = 80;

export function validateAddOns(input: unknown): AddOnValidationResult {
  if (input === undefined || input === null) return { ok: true, value: [] };
  if (!Array.isArray(input)) {
    return { ok: false, errors: [{ field: "add_ons", reason: "must be an array" }] };
  }
  // Silently truncate to MAX_ENTRIES — matches the existing pattern for
  // length-bounded fields (server is the source of truth, client UI also caps).
  const limited = input.slice(0, MAX_ENTRIES);
  const errors: AddOnValidationError[] = [];
  const value: AddOn[] = [];
  const seenNames = new Set<string>();
  limited.forEach((entry, i) => {
    if (!entry || typeof entry !== "object") {
      errors.push({ field: `add_ons[${i}]`, reason: "must be an object" });
      return;
    }
    const r = entry as Record<string, unknown>;
    let name = typeof r.name === "string" ? r.name.trim() : "";
    const priceRaw = r.price_delta;
    const durationRaw = r.duration_delta_minutes;
    if (name.length === 0) {
      errors.push({ field: `add_ons[${i}].name`, reason: "must not be empty" });
      return;
    }
    if (name.length > MAX_NAME_LENGTH) name = name.slice(0, MAX_NAME_LENGTH);
    const nameKey = name.toLowerCase();
    if (seenNames.has(nameKey)) {
      errors.push({ field: `add_ons[${i}].name`, reason: "duplicate of an earlier add-on" });
      return;
    }
    seenNames.add(nameKey);
    const price = typeof priceRaw === "number" ? priceRaw : Number(priceRaw);
    const duration = typeof durationRaw === "number" ? durationRaw : Number(durationRaw);
    if (!Number.isFinite(price) || price < 0) {
      errors.push({ field: `add_ons[${i}].price_delta`, reason: "must be a non-negative number" });
      return;
    }
    if (!Number.isInteger(duration) || duration < 0 || duration % 30 !== 0) {
      errors.push({
        field: `add_ons[${i}].duration_delta_minutes`,
        reason: "must be a non-negative integer multiple of 30",
      });
      return;
    }
    value.push({ name, price_delta: price, duration_delta_minutes: duration });
  });
  return errors.length ? { ok: false, errors } : { ok: true, value };
}
