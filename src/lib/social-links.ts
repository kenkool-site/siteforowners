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

function hostMatchesPlatform(hostname: string, platform: SocialPlatform): boolean {
  switch (platform) {
    case "instagram":
      return /(^|\.)instagram\.com$/i.test(hostname);
    case "facebook":
      return /(^|\.)(facebook|fb)\.com$/i.test(hostname);
    case "tiktok":
      return /(^|\.)tiktok\.com$/i.test(hostname);
  }
}

/** Stored profile URLs → editable handle/username for form fields. */
export function socialLinkToDisplayValue(value: unknown, platform: SocialPlatform): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (!/^https?:\/\//i.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    if (!hostMatchesPlatform(url.hostname, platform)) return trimmed;

    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length === 0) return trimmed;

    if (platform === "tiktok") {
      const handle = segments[0].replace(/^@+/, "");
      return handle ? `@${handle}` : trimmed;
    }

    return segments[0] || trimmed;
  } catch {
    return trimmed;
  }
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
