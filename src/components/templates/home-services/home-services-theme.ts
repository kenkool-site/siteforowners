import type { PreviewData } from "@/lib/ai/types";
import type { ThemeColors } from "@/lib/templates/themes";
import { THEMES_BY_VERTICAL } from "@/lib/templates/themes";
import { lightPaletteFromBrandColors } from "@/lib/templates/brand-palette";
import { ensureReadable, readableColors } from "@/lib/templates/contrast";

const APPROVED_FALLBACK: ThemeColors = {
  primary: "#0C3658",
  secondary: "#13795B",
  accent: "#13795B",
  background: "#FFFFFF",
  foreground: "#102A43",
  muted: "#E8F5EE",
};

export type HomeServicesReadable = {
  headingOnBg: string;
  bodyOnBg: string;
  headingOnMuted: string;
  bodyOnMuted: string;
  cardHeadingOnMuted: string;
  cardBodyOnMuted: string;
  labelOnBg: string;
  ctaOnSecondary: string;
  outlineOnBg: string;
  iconOnMuted: string;
  navControl: string;
  drawerBody: string;
  avatarOnPrimary: string;
  estimateLinkOnMuted: string;
};

/** Surface-aware text colors for home-services sections and cards. */
export function getHomeServicesReadable(colors: ThemeColors): HomeServicesReadable {
  const rc = readableColors(colors);
  return {
    headingOnBg: rc.primaryOnBg,
    bodyOnBg: rc.textOnBg,
    headingOnMuted: rc.primaryOnMuted,
    bodyOnMuted: rc.textOnMuted,
    cardHeadingOnMuted: ensureReadable(colors.primary, colors.muted),
    cardBodyOnMuted: ensureReadable(colors.foreground, colors.muted),
    labelOnBg: ensureReadable(colors.foreground, colors.background, 3),
    ctaOnSecondary: ensureReadable(colors.background, colors.secondary, 4.5),
    outlineOnBg: ensureReadable(colors.primary, colors.background, 3),
    iconOnMuted: ensureReadable(colors.secondary, colors.muted, 3),
    navControl: ensureReadable(colors.foreground, colors.background),
    drawerBody: rc.textOnBg,
    avatarOnPrimary: ensureReadable(colors.background, colors.primary, 4.5),
    estimateLinkOnMuted: ensureReadable(colors.secondary, colors.muted, 3),
  };
}

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
