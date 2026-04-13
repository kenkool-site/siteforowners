/**
 * Dynamic contrast utilities for ensuring text readability.
 * Used by template components to pick readable text colors at runtime.
 */

function toRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Relative luminance per WCAG 2.0 */
function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colors */
export function contrastRatio(hex1: string, hex2: string): number {
  const l1 = luminance(hex1);
  const l2 = luminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Returns true if the color is perceptually light */
export function isLight(hex: string): boolean {
  return luminance(hex) > 0.35;
}

/**
 * Pick a readable text color for a given background.
 * Returns white or near-black depending on which has better contrast.
 */
export function readableTextColor(bg: string): string {
  return isLight(bg) ? "#1A1A1A" : "#FFFFFF";
}

/**
 * Given a desired text color and background, return a color guaranteed
 * to have at least `minRatio` contrast. Falls back to white or black.
 */
export function ensureReadable(
  textColor: string,
  bgColor: string,
  minRatio = 4.5
): string {
  if (contrastRatio(textColor, bgColor) >= minRatio) return textColor;
  // The desired color doesn't meet contrast — pick white or black
  const whiteContrast = contrastRatio("#FFFFFF", bgColor);
  const blackContrast = contrastRatio("#1A1A1A", bgColor);
  return whiteContrast > blackContrast ? "#FFFFFF" : "#1A1A1A";
}

/**
 * For sections with solid background colors, ensure all theme text colors
 * are readable. Returns adjusted colors object.
 */
export function readableColors(colors: {
  primary: string;
  foreground: string;
  background: string;
  muted: string;
}) {
  return {
    /** Text on background sections */
    textOnBg: ensureReadable(colors.foreground, colors.background),
    /** Primary accent on background (prices, labels) */
    primaryOnBg: ensureReadable(colors.primary, colors.background, 3),
    /** Text on muted sections (contact forms, alt sections) */
    textOnMuted: ensureReadable(colors.foreground, colors.muted),
    /** Primary on muted sections */
    primaryOnMuted: ensureReadable(colors.primary, colors.muted, 3),
    /** Text on foreground sections (inverted: footer, hero) */
    textOnFg: ensureReadable(colors.background, colors.foreground),
    /** Primary on foreground sections */
    primaryOnFg: ensureReadable(colors.primary, colors.foreground, 3),
  };
}
