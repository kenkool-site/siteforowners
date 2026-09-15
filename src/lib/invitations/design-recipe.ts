export const DISPLAY_STYLES = ["formal-script", "editorial-serif", "classic-serif", "geometric-sans", "humanist-sans"] as const;
export const BODY_STYLES = ["classic-serif", "humanist-sans", "geometric-sans"] as const;
export const COMPOSITION_FAMILIES = ["framed", "centered", "asymmetric", "editorial", "layered"] as const;
export const CONTENT_SECTIONS = ["intro", "details", "gallery", "counts", "rsvp"] as const;

export type InvitationDesignRecipe = {
  version: 1;
  palette: { background: string; surface: string; text: string; mutedText: string; accent: string; overlay: string };
  typography: { display: typeof DISPLAY_STYLES[number]; body: typeof BODY_STYLES[number]; weight: 400 | 500 | 600 | 700; tracking: number; scale: "restrained" | "balanced" | "dramatic" };
  composition: { family: typeof COMPOSITION_FAMILIES[number]; alignment: "left" | "center"; maxWidth: number; rhythm: "compact" | "balanced" | "airy"; heroTextPlacement: "top" | "center" | "bottom" };
  frame: { style: "none" | "line" | "double" | "botanical" | "floral" | "ornamental"; width: number; radius: "none" | "soft" | "rounded"; inset: boolean };
  decoration: { motif: "none" | "botanical" | "floral" | "geometric" | "ribbon" | "ornamental"; density: "minimal" | "balanced" | "rich"; symmetry: "none" | "balanced" | "mirrored"; divider: "none" | "line" | "dots" | "flourish" };
  hero: { overlayStrength: number; textColor: string; focalX: number; focalY: number; minHeightVh: number };
  contentOrder: Array<typeof CONTENT_SECTIONS[number]>;
};

export const DEFAULT_INVITATION_DESIGN_RECIPE: InvitationDesignRecipe = {
  version: 1,
  palette: { background: "#F7F5EF", surface: "#FCFBF7", text: "#172238", mutedText: "#59616E", accent: "#B58A55", overlay: "#172238" },
  typography: { display: "editorial-serif", body: "humanist-sans", weight: 500, tracking: 0, scale: "balanced" },
  composition: { family: "framed", alignment: "center", maxWidth: 880, rhythm: "balanced", heroTextPlacement: "center" },
  frame: { style: "line", width: 1, radius: "none", inset: true },
  decoration: { motif: "none", density: "minimal", symmetry: "balanced", divider: "line" },
  hero: { overlayStrength: 0.42, textColor: "#FFFFFF", focalX: 0.5, focalY: 0.5, minHeightVh: 100 },
  contentOrder: ["intro", "details", "gallery", "counts", "rsvp"],
};

type Result = { ok: true; value: InvitationDesignRecipe } | { ok: false; errors: string[] };
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const oneOf = <T extends readonly unknown[]>(value: unknown, values: T): value is T[number] => values.includes(value);
const number = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : null;
const color = (value: unknown) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : null;

function channel(hex: string, offset: number): number {
  const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}
function luminance(hex: string): number { return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5); }
function contrast(a: string, b: string): number { const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (high + 0.05) / (low + 0.05); }
export function readableTextColor(background: string): "#FFFFFF" | "#111111" {
  return contrast(background, "#FFFFFF") >= contrast(background, "#111111") ? "#FFFFFF" : "#111111";
}

export function neutralOverlayColor(color: string): string {
  const red = parseInt(color.slice(1, 3), 16);
  const green = parseInt(color.slice(3, 5), 16);
  const blue = parseInt(color.slice(5, 7), 16);
  const neutral = Math.round(0.2126 * red + 0.7152 * green + 0.0722 * blue)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
  return `#${neutral}${neutral}${neutral}`;
}

export function ensureReadableRecipe(recipe: InvitationDesignRecipe): InvitationDesignRecipe {
  const copy = structuredClone(recipe);
  if (contrast(copy.palette.background, copy.palette.text) < 4.5) copy.palette.text = readableTextColor(copy.palette.background);
  if (contrast(copy.palette.overlay, copy.hero.textColor) < 4.5) copy.hero.textColor = readableTextColor(copy.palette.overlay);
  return copy;
}

export function normalizeInvitationDesignRecipe(input: unknown): Result {
  if (!isRecord(input) || input.version !== 1) return { ok: false, errors: ["version"] };
  const p = input.palette, t = input.typography, c = input.composition, f = input.frame, d = input.decoration, h = input.hero;
  if (![p, t, c, f, d, h].every(isRecord) || !Array.isArray(input.contentOrder)) return { ok: false, errors: ["shape"] };
  const palette = isRecord(p) ? { background: color(p.background), surface: color(p.surface), text: color(p.text), mutedText: color(p.mutedText), accent: color(p.accent), overlay: color(p.overlay) } : null;
  if (!palette || Object.values(palette).some((value) => !value)) return { ok: false, errors: ["palette"] };
  if (!isRecord(t) || !oneOf(t.display, DISPLAY_STYLES) || !oneOf(t.body, BODY_STYLES) || !oneOf(t.weight, [400, 500, 600, 700] as const) || !oneOf(t.scale, ["restrained", "balanced", "dramatic"] as const)) return { ok: false, errors: ["typography"] };
  if (!isRecord(c) || !oneOf(c.family, COMPOSITION_FAMILIES) || !oneOf(c.alignment, ["left", "center"] as const) || !oneOf(c.rhythm, ["compact", "balanced", "airy"] as const) || !oneOf(c.heroTextPlacement, ["top", "center", "bottom"] as const)) return { ok: false, errors: ["composition"] };
  if (!isRecord(f) || !oneOf(f.style, ["none", "line", "double", "botanical", "floral", "ornamental"] as const) || !oneOf(f.radius, ["none", "soft", "rounded"] as const) || typeof f.inset !== "boolean") return { ok: false, errors: ["frame"] };
  if (!isRecord(d) || !oneOf(d.motif, ["none", "botanical", "floral", "geometric", "ribbon", "ornamental"] as const) || !oneOf(d.density, ["minimal", "balanced", "rich"] as const) || !oneOf(d.symmetry, ["none", "balanced", "mirrored"] as const) || !oneOf(d.divider, ["none", "line", "dots", "flourish"] as const)) return { ok: false, errors: ["decoration"] };
  if (!isRecord(h)) return { ok: false, errors: ["hero"] };
  const tracking = number(t.tracking, -0.08, 0.12), maxWidth = number(c.maxWidth, 320, 1120), width = number(f.width, 0, 8), overlayStrength = number(h.overlayStrength, 0.2, 0.8), focalX = number(h.focalX, 0, 1), focalY = number(h.focalY, 0, 1), minHeightVh = number(h.minHeightVh, 80, 100), textColor = color(h.textColor);
  if ([tracking, maxWidth, width, overlayStrength, focalX, focalY, minHeightVh].some((value) => value === null) || !textColor) return { ok: false, errors: ["numbers"] };
  if (!input.contentOrder.every((value) => oneOf(value, CONTENT_SECTIONS))) return { ok: false, errors: ["contentOrder"] };
  return { ok: true, value: ensureReadableRecipe({
    version: 1, palette: palette as InvitationDesignRecipe["palette"],
    typography: { display: t.display, body: t.body, weight: t.weight, tracking: tracking!, scale: t.scale },
    composition: { family: c.family, alignment: c.alignment, maxWidth: maxWidth!, rhythm: c.rhythm, heroTextPlacement: c.heroTextPlacement },
    frame: { style: f.style, width: width!, radius: f.radius, inset: f.inset },
    decoration: { motif: d.motif, density: d.density, symmetry: d.symmetry, divider: d.divider },
    hero: { overlayStrength: overlayStrength!, textColor, focalX: focalX!, focalY: focalY!, minHeightVh: minHeightVh! },
    contentOrder: Array.from(new Set(input.contentOrder)) as InvitationDesignRecipe["contentOrder"],
  }) };
}
