import type { ThemeColors } from "@/lib/templates/themes";

function toRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function toHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0"))
      .join("")
  );
}

function lighten(hex: string, amount: number): string {
  try {
    const [r, g, b] = toRgb(hex);
    return toHex(
      r + (255 - r) * amount,
      g + (255 - g) * amount,
      b + (255 - b) * amount,
    );
  } catch {
    return "#FFFFFF";
  }
}

function darken(hex: string, amount: number): string {
  try {
    const [r, g, b] = toRgb(hex);
    return toHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
  } catch {
    return "#1A1A1A";
  }
}

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = luminance(hex1);
  const l2 = luminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function isLight(hex: string): boolean {
  return luminance(hex) > 0.4;
}

function ensureContrast(fg: string, bg: string, minRatio = 4.5): string {
  const bgIsLight = isLight(bg);
  let current = fg;
  for (let i = 0; i < 15; i++) {
    if (contrastRatio(current, bg) >= minRatio) return current;
    current = bgIsLight ? darken(current, 0.12) : lighten(current, 0.12);
  }
  return bgIsLight ? "#1A1A1A" : "#F5F5F5";
}

function isValidBrandHex(color: string | undefined): color is string {
  return !!color && /^#[0-9A-Fa-f]{6}$/.test(color.trim());
}

/**
 * Build two palettes from brand swatches (same rules as preview generate-copy).
 */
export function buildCustomPalettes(brandColors: string[]): [ThemeColors, ThemeColors] {
  const rawPrimary = brandColors[0].trim();
  const rawSecondary = brandColors[1]?.trim() || lighten(rawPrimary, 0.7);
  const rawAccent = brandColors[2]?.trim() || darken(rawPrimary, 0.2);

  const bgA = lighten(rawPrimary, 0.93);
  const mutedA = lighten(rawPrimary, 0.82);
  let fgA = darken(rawPrimary, 0.65);

  fgA = ensureContrast(fgA, bgA, 4.5);
  fgA = ensureContrast(fgA, mutedA, 4.5);
  if (contrastRatio(bgA, fgA) < 4.5) {
    fgA = darken(fgA, 0.15);
    fgA = ensureContrast(fgA, bgA, 4.5);
  }

  const paletteA: ThemeColors = {
    primary: rawPrimary,
    secondary: rawSecondary,
    accent: rawAccent,
    background: bgA,
    foreground: fgA,
    muted: mutedA,
  };

  const bgB = darken(rawPrimary, 0.75);
  const mutedB = darken(rawPrimary, 0.55);
  let fgB = lighten(rawPrimary, 0.93);

  fgB = ensureContrast(fgB, bgB, 4.5);

  const paletteB: ThemeColors = {
    primary: rawPrimary,
    secondary: lighten(rawPrimary, 0.3),
    accent: rawAccent,
    background: bgB,
    foreground: fgB,
    muted: mutedB,
  };

  return [paletteA, paletteB];
}

/** Light (variant A) palette — matches public site when using imported brand colors. */
export function lightPaletteFromBrandColors(brandColors: unknown): ThemeColors | null {
  if (!Array.isArray(brandColors) || brandColors.length === 0) return null;
  const first = typeof brandColors[0] === "string" ? brandColors[0].trim() : "";
  if (!isValidBrandHex(first)) return null;
  const sanitized = brandColors.filter((c): c is string => typeof c === "string" && isValidBrandHex(c.trim())).map((c) => c.trim());
  if (sanitized.length === 0) return null;
  const [light] = buildCustomPalettes(sanitized);
  return light;
}

export function primaryHexFromBrandColors(brandColors: unknown): string | null {
  if (!Array.isArray(brandColors) || brandColors.length === 0) return null;
  const first = typeof brandColors[0] === "string" ? brandColors[0].trim() : "";
  return isValidBrandHex(first) ? first : null;
}
