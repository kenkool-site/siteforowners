export type SocialLinks = {
  instagram?: string;
  facebook?: string;
  tiktok?: string;
};

const SUPPORTED_PLATFORMS = ["instagram", "facebook", "tiktok"] as const;

function normalizeUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^@/, "")}`;
}

export function buildSocialLinksPayload(input: unknown): SocialLinks | null {
  const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const out: SocialLinks = {};
  for (const platform of SUPPORTED_PLATFORMS) {
    const url = normalizeUrl(source[platform]);
    if (url) out[platform] = url;
  }
  return Object.keys(out).length > 0 ? out : null;
}
