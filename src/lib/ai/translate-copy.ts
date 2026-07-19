/** Request validation + response filtering for POST /api/admin/translate-copy. */

export const MAX_TRANSLATE_FIELDS = 150;
export const MAX_TRANSLATE_CHARS = 20000;

export type TranslateCopyRequest = {
  from: "en" | "es";
  to: "en" | "es";
  texts: Record<string, string>;
};

export function parseTranslateCopyRequest(
  body: unknown,
): { ok: true; value: TranslateCopyRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid JSON body" };
  }
  const { from, to, texts } = body as Record<string, unknown>;
  if ((from !== "en" && from !== "es") || (to !== "en" && to !== "es") || from === to) {
    return { ok: false, error: "from and to must be 'en' and 'es' and must differ" };
  }
  if (!texts || typeof texts !== "object" || Array.isArray(texts)) {
    return { ok: false, error: "texts must be an object of strings" };
  }
  const entries = Object.entries(texts);
  if (entries.length === 0) return { ok: false, error: "texts is empty" };
  if (entries.length > MAX_TRANSLATE_FIELDS) {
    return { ok: false, error: `Too many fields (max ${MAX_TRANSLATE_FIELDS})` };
  }
  let totalChars = 0;
  const clean: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (typeof value !== "string" || value.trim() === "") {
      return { ok: false, error: `texts[${JSON.stringify(key)}] must be a non-empty string` };
    }
    totalChars += value.length;
    clean[key] = value;
  }
  if (totalChars > MAX_TRANSLATE_CHARS) {
    return { ok: false, error: `Too much text (max ${MAX_TRANSLATE_CHARS} characters)` };
  }
  return { ok: true, value: { from, to, texts: clean } };
}

/** Keep only keys that were in the request, with non-empty string values. */
export function filterTranslations(
  input: Record<string, string>,
  raw: unknown,
): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (key in input && typeof value === "string" && value.trim() !== "") out[key] = value;
  }
  return out;
}
