export type SocialLinks = {
  instagram?: string;
  facebook?: string;
  tiktok?: string;
};

export type SocialPlatform = keyof SocialLinks;

const SUPPORTED_PLATFORMS: SocialPlatform[] = ["instagram", "facebook", "tiktok"];

const PLATFORM_HOST =
  /^(?:www\.)?(?:instagram\.com|facebook\.com|fb\.com|tiktok\.com)(?:\/|$)/i;

function stripAt(handle: string): string {
  return handle.replace(/^@+/, "");
}

export function normalizeSocialLink(value: unknown, platform: SocialPlatform): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  const withoutScheme = trimmed.replace(/^@/, "");
  if (PLATFORM_HOST.test(withoutScheme)) {
    return `https://${withoutScheme}`;
  }

  const handle = stripAt(trimmed);
  switch (platform) {
    case "instagram":
      return `https://www.instagram.com/${handle}`;
    case "facebook":
      return `https://www.facebook.com/${handle}`;
    case "tiktok":
      return `https://www.tiktok.com/@${handle}`;
  }
}

export function buildSocialLinksPayload(input: unknown): SocialLinks | null {
  const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const out: SocialLinks = {};
  for (const platform of SUPPORTED_PLATFORMS) {
    const url = normalizeSocialLink(source[platform], platform);
    if (url) out[platform] = url;
  }
  return Object.keys(out).length > 0 ? out : null;
}
