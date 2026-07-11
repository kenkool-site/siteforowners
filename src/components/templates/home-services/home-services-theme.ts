import type { PreviewData } from "@/lib/ai/types";
import type { ThemeColors } from "@/lib/templates/themes";
import { THEMES_BY_VERTICAL } from "@/lib/templates/themes";
import { lightPaletteFromBrandColors } from "@/lib/templates/brand-palette";

const APPROVED_FALLBACK: ThemeColors = {
  primary: "#0C3658",
  secondary: "#13795B",
  accent: "#13795B",
  background: "#FFFFFF",
  foreground: "#102A43",
  muted: "#F0F6F8",
};

export function getHomeServicesColors(data: PreviewData): ThemeColors {
  const copy = data.generated_copy as unknown as Record<string, unknown> | undefined;
  const sectionSettings =
    (copy?.section_settings as Record<string, unknown> | undefined) ?? {};
  const sectionCustom = sectionSettings.custom_colors as ThemeColors | undefined;
  if (sectionCustom?.primary) {
    return sectionCustom;
  }

  const topCustom = copy?.custom_colors as ThemeColors | undefined;
  if (topCustom?.primary) {
    return topCustom;
  }

  const fromBrand = lightPaletteFromBrandColors(copy?.brand_colors);
  if (fromBrand) {
    return fromBrand;
  }

  return THEMES_BY_VERTICAL.home_services[0]?.colors ?? APPROVED_FALLBACK;
}
