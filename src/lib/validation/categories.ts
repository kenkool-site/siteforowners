export interface CategoriesValidationError {
  field: string;
  reason: string;
}

export type CategoriesValidationResult =
  | { ok: true; value: string[] }
  | { ok: false; errors: CategoriesValidationError[] };

const MAX_ENTRIES = 10;
const MAX_LENGTH = 60;

export function validateCategories(input: unknown): CategoriesValidationResult {
  if (input === undefined || input === null) return { ok: true, value: [] };
  if (!Array.isArray(input)) {
    return { ok: false, errors: [{ field: "categories", reason: "must be an array" }] };
  }
  if (input.length > MAX_ENTRIES) {
    return { ok: false, errors: [{ field: "categories", reason: `at most ${MAX_ENTRIES} entries` }] };
  }
  const errors: CategoriesValidationError[] = [];
  const value: string[] = [];
  const seen = new Set<string>();
  input.forEach((entry, i) => {
    if (typeof entry !== "string") {
      errors.push({ field: `categories[${i}]`, reason: "must be a string" });
      return;
    }
    const trimmed = entry.trim();
    // An empty category carries no meaning — silently drop it rather than
    // failing the whole save. A single stray empty entry (e.g. seeded by an
    // old import) would otherwise poison the parsed list and cascade into
    // "not in categories list" errors on every service.
    if (trimmed.length === 0) {
      return;
    }
    if (trimmed.length > MAX_LENGTH) {
      errors.push({ field: `categories[${i}]`, reason: `at most ${MAX_LENGTH} characters` });
      return;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      errors.push({ field: `categories[${i}]`, reason: "duplicate of an earlier entry" });
      return;
    }
    seen.add(key);
    value.push(trimmed);
  });
  return errors.length ? { ok: false, errors } : { ok: true, value };
}
