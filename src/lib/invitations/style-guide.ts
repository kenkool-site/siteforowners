export type InvitationEventColor = {
  name: string;
  color: string;
};

export type InvitationStyleGuide = {
  note: string | null;
  colors: InvitationEventColor[];
};

export type InvitationStyleGuideResult =
  | { ok: true; value: InvitationStyleGuide | null }
  | { ok: false };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseInvitationStyleGuide(input: unknown): InvitationStyleGuideResult {
  if (input === null) return { ok: true, value: null };
  if (!isRecord(input) || !Array.isArray(input.colors)) return { ok: false };
  if (input.note !== null && typeof input.note !== "string") return { ok: false };
  const note = typeof input.note === "string" ? input.note.trim() || null : null;
  if ((note?.length ?? 0) > 500 || input.colors.length > 8) return { ok: false };

  const colors: InvitationEventColor[] = [];
  for (const item of input.colors) {
    if (!isRecord(item) || typeof item.name !== "string" || typeof item.color !== "string") return { ok: false };
    const name = item.name.trim();
    const color = item.color.trim();
    if (!name && !color) continue;
    if (!name || name.length > 60 || !/^#[0-9a-f]{6}$/i.test(color)) return { ok: false };
    colors.push({ name, color: color.toUpperCase() });
  }
  return { ok: true, value: note || colors.length ? { note, colors } : null };
}

export function normalizeInvitationStyleGuide(input: unknown): InvitationStyleGuide | null {
  const parsed = parseInvitationStyleGuide(input);
  return parsed.ok ? parsed.value : null;
}
