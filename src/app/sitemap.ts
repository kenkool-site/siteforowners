import { headers } from "next/headers";
import type { MetadataRoute } from "next";
import { classifyHost } from "@/lib/host-routing";
import { INVITESPOT_CONTENT_UPDATED, INVITESPOT_LANGUAGE_URLS } from "@/lib/invitespot-seo";

export function buildInvitespotSitemap(host: string | null): MetadataRoute.Sitemap {
  if (!host || classifyHost(host).kind !== "invitespot-root") return [];
  return (["en", "es"] as const).map((locale) => ({
    url: INVITESPOT_LANGUAGE_URLS[locale],
    lastModified: INVITESPOT_CONTENT_UPDATED,
    alternates: { languages: INVITESPOT_LANGUAGE_URLS },
  }));
}

export default function sitemap(): MetadataRoute.Sitemap {
  const host = headers().get("host");
  return buildInvitespotSitemap(host);
}
