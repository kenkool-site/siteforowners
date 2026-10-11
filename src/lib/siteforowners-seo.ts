import type { Metadata, MetadataRoute } from "next";
import messages from "../../messages/en.json";
import { isLegacySiteforownersApex } from "./host-routing";

export const SITEFOROWNERS_HOME = "https://www.siteforowners.com/";
export const SITEFOROWNERS_CONTENT_UPDATED = "2026-10-11";
export const SITEFOROWNERS_SOCIAL_IMAGE = `${SITEFOROWNERS_HOME}marketing/siteforowners-social-preview.png`;

export function buildSiteForOwnersMetadata(): Metadata {
  const copy = messages.marketing.seo;
  const image = { url: SITEFOROWNERS_SOCIAL_IMAGE, width: 1200, height: 630, alt: copy.imageAlt };
  return {
    metadataBase: new URL(SITEFOROWNERS_HOME),
    applicationName: "SiteForOwners",
    title: copy.title,
    description: copy.description,
    alternates: { canonical: SITEFOROWNERS_HOME },
    openGraph: {
      type: "website", url: SITEFOROWNERS_HOME, siteName: "SiteForOwners",
      title: copy.title, description: copy.description, locale: "en_US", images: [image],
    },
    twitter: { card: "summary_large_image", title: copy.title, description: copy.description, images: [image] },
  };
}

export function buildSiteForOwnersSitemap(host: string | null): MetadataRoute.Sitemap {
  if (!host || !isLegacySiteforownersApex(host)) return [];
  // Only existing public marketing pages; private previews are not landing pages.
  return ["", "demo", "request-site", "privacy", "terms"].map((page) => ({
    url: new URL(page, SITEFOROWNERS_HOME).href,
    ...(page === "" ? { lastModified: SITEFOROWNERS_CONTENT_UPDATED } : {}),
  }));
}
