import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { THEMES_BY_VERTICAL } from "@/lib/templates/themes";
import type { BusinessType } from "@/lib/ai/types";

export type AdminTheme = {
  primary: string;        // e.g. #D8006B — the tenant's brand color
  primaryLight: string;   // light tint for backgrounds (~10% alpha)
  primaryHover: string;   // slightly stronger tint for hover (~18% alpha)
  primaryBorder: string;  // mid tint for outlined elements (~30% alpha)
};

const DEFAULT_PRIMARY = "#D8006B"; // pink fallback when nothing's configured

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

export function deriveTheme(primary: string): AdminTheme {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(primary) ? primary : DEFAULT_PRIMARY;
  const rgb = hexToRgb(safe) ?? hexToRgb(DEFAULT_PRIMARY)!;
  const rgba = (a: number) => `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
  return {
    primary: safe,
    primaryLight: rgba(0.10),
    primaryHover: rgba(0.18),
    primaryBorder: rgba(0.30),
  };
}

/**
 * Load the tenant's primary color from their preview row, with the same
 * resolution priority as the public site (custom override → vertical theme
 * → default). Cached per-request.
 */
export const loadAdminTheme = cache(async (previewSlug: string | null): Promise<AdminTheme> => {
  if (!previewSlug) return deriveTheme(DEFAULT_PRIMARY);
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("previews")
    .select("generated_copy, color_theme, business_type")
    .eq("slug", previewSlug)
    .maybeSingle();
  if (!data) return deriveTheme(DEFAULT_PRIMARY);

  const gc = data.generated_copy as Record<string, unknown> | null;
  const customColors = gc?.custom_colors as Record<string, unknown> | undefined;
  if (typeof customColors?.primary === "string") {
    return deriveTheme(customColors.primary);
  }

  const businessType = data.business_type as BusinessType | undefined;
  const colorThemeId = data.color_theme as string | undefined;
  if (businessType && THEMES_BY_VERTICAL[businessType]) {
    const themes = THEMES_BY_VERTICAL[businessType];
    const theme = themes.find((t) => t.id === colorThemeId) ?? themes[0];
    return deriveTheme(theme.colors.primary);
  }

  return deriveTheme(DEFAULT_PRIMARY);
});

/** CSS custom-property block to set on the admin shell root. */
export function adminThemeStyle(theme: AdminTheme): React.CSSProperties {
  return {
    "--admin-primary": theme.primary,
    "--admin-primary-light": theme.primaryLight,
    "--admin-primary-hover": theme.primaryHover,
    "--admin-primary-border": theme.primaryBorder,
  } as React.CSSProperties;
}
