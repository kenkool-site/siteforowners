import type { ThemeColors } from "@/lib/templates/themes";
import { ensureReadable, isLight } from "@/lib/templates/contrast";

export const MAISON_AUTOPLAY_MS = 3000;
export const MAISON_RESUME_COOLDOWN_MS = 6000;
export const MAISON_MOBILE_QUERY = "(max-width: 767px)";

export type MaisonService = {
  name: string;
  price: string;
  description?: string;
  image?: string;
  durationMinutes?: number;
  bookingDeepLink?: string;
  is_featured?: boolean;
};

export type MaisonPalette = {
  paper: string;
  ink: string;
  gold: string;
  line: string;
  band: string;
  bandText: string;
  goldOnBand: string;
};

export function maisonPalette(colors: ThemeColors): MaisonPalette {
  const paper = colors.background?.trim() || "#F6F3EC";
  const foreground = colors.foreground?.trim() || "#292C27";
  const primary = colors.primary?.trim() || "#97825D";
  const ink = ensureReadable(foreground, paper);
  const gold = ensureReadable(primary, paper, 3);
  const band = isLight(foreground) ? "#292C27" : foreground;
  return {
    paper,
    ink,
    gold,
    line: `color-mix(in srgb, ${ink} 18%, ${paper})`,
    band,
    bandText: ensureReadable(paper, band),
    goldOnBand: ensureReadable(primary, band, 3),
  };
}

export function splitBusinessName(name: string): { lead: string; tail: string | null } {
  const trimmed = name.trim();
  const byline = trimmed.match(/^(.*?)\s+by\s+(.+)$/i);
  if (byline?.[1] && byline[2]) {
    return { lead: byline[1].trim(), tail: `by ${byline[2].trim()}` };
  }
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return { lead: trimmed, tail: null };
  const splitAt = Math.ceil(words.length / 2);
  return {
    lead: words.slice(0, splitAt).join(" "),
    tail: words.slice(splitAt).join(" "),
  };
}

export function signatureLine(name: string): string {
  const { tail } = splitBusinessName(name);
  if (tail && /^by\s+/i.test(tail)) {
    return `By ${tail.replace(/^by\s+/i, "")}.`;
  }
  const trimmed = name.trim();
  return trimmed.endsWith(".") ? trimmed : `${trimmed}.`;
}

export function aboutSubject(name: string): string {
  const { lead, tail } = splitBusinessName(name);
  if (tail && /^by\s+/i.test(tail)) return tail.replace(/^by\s+/i, "");
  return lead || name.trim();
}

export function placeName(address?: string | null): string {
  if (!address) return "";
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length >= 2) {
    const region = parts[parts.length - 1].replace(/\d/g, "").trim();
    if (region.length > 0 && region.length <= 14) return parts[parts.length - 2];
  }
  return parts[0];
}

export function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length !== 10) return phone.trim();
  return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
}

export function orderMaisonServices<T extends { is_featured?: boolean }>(services: T[]): T[] {
  return [
    ...services.filter((service) => service.is_featured),
    ...services.filter((service) => !service.is_featured),
  ];
}

/** Service art wins. Gallery photos fill only the cards that have none, cycling in order. */
export function assignServiceCardImages(
  services: { image?: string | null }[],
  galleryImages: string[],
): (string | undefined)[] {
  const gallery = galleryImages.map((src) => src.trim()).filter(Boolean);
  let fallback = 0;
  return services.map((service) => {
    const own = service.image?.trim();
    if (own) return own;
    if (gallery.length === 0) return undefined;
    const src = gallery[fallback % gallery.length];
    fallback += 1;
    return src;
  });
}

export function nextCarouselIndex(active: number, count: number): number {
  if (count <= 0) return 0;
  return ((active % count) + 1) % count;
}

export function activeIndexFromScroll(scrollLeft: number, step: number, count: number): number {
  if (count <= 1 || step <= 0) return 0;
  const index = Math.round(scrollLeft / step);
  return Math.min(count - 1, Math.max(0, index));
}

export function shouldAdvanceCarousel(input: {
  isMobile: boolean;
  reducedMotion: boolean;
  documentHidden: boolean;
  inView: boolean;
  userPaused: boolean;
  hovered: boolean;
  touching: boolean;
  focused: boolean;
  now: number;
  resumeAfter: number;
  count: number;
}): boolean {
  return (
    input.count > 1 &&
    input.isMobile &&
    !input.reducedMotion &&
    !input.documentHidden &&
    input.inView &&
    !input.userPaused &&
    !input.hovered &&
    !input.touching &&
    !input.focused &&
    input.now >= input.resumeAfter
  );
}
