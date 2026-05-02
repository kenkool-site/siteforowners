import type { BusinessType } from "@/lib/ai/types";

/**
 * Default loopable hero backgrounds per vertical (preview + new generates).
 * Place MP4 or WebM files in `public/marketing/hero-defaults/` using these names.
 * Customer uploads or explicit URLs always take precedence at save time.
 */
const DEFAULT_HERO_VIDEO_BY_TYPE: Record<BusinessType, string> = {
  salon: "/marketing/hero-defaults/salon.mp4",
  barbershop: "/marketing/hero-defaults/barbershop.mp4",
  restaurant: "/marketing/hero-defaults/restaurant.mp4",
  nails: "/marketing/hero-defaults/nails.mp4",
  braids: "/marketing/hero-defaults/braids.mp4",
};

export function getDefaultHeroVideoUrl(businessType: BusinessType): string | null {
  const path = DEFAULT_HERO_VIDEO_BY_TYPE[businessType];
  return path ?? null;
}
