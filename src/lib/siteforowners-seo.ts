import type { Metadata, MetadataRoute } from "next";
import messages from "../../messages/en.json";
import { isLegacySiteforownersApex } from "./host-routing";
import { MARKETING_GUIDES } from "./marketing-guides";
import { serializeJsonLd } from "./seo-localbusiness";
import { SITEMAP_SOURCES, lastModifiedIso } from "./sitemap-lastmod";

export const SITEFOROWNERS_HOME = "https://www.siteforowners.com/";
export const SITEFOROWNERS_SOCIAL_IMAGE = `${SITEFOROWNERS_HOME}marketing/siteforowners-social-preview.png`;

/** Visible homepage price and the terms page. Do not invent a second price. */
export const SITEFOROWNERS_MONTHLY_PRICE_USD = "50";

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

export function buildSiteForOwnersJsonLd(): Record<string, unknown> {
  const description = messages.marketing.seo.description;
  const organizationId = `${SITEFOROWNERS_HOME}#organization`;
  const offer = {
    "@type": "Offer",
    price: SITEFOROWNERS_MONTHLY_PRICE_USD,
    priceCurrency: "USD",
    description: "Free for one month, then $50 per month. Cancel anytime.",
    url: `${SITEFOROWNERS_HOME}#pricing`,
  };
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": organizationId,
        name: "SiteForOwners",
        url: SITEFOROWNERS_HOME,
        logo: `${SITEFOROWNERS_HOME}marketing/siteforowners-logo.png`,
        description,
      },
      {
        "@type": "SoftwareApplication",
        name: "SiteForOwners",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: SITEFOROWNERS_HOME,
        description,
        offers: offer,
        provider: { "@id": organizationId },
      },
      {
        "@type": "Service",
        name: "Done-for-you websites and booking",
        serviceType: "Website and online booking for hair stylists and braiders",
        url: SITEFOROWNERS_HOME,
        description:
          "Websites, booking, an owner dashboard, hosting, a domain registered in your name, and updates for hair stylists, salons, braiders, and barbers.",
        provider: { "@id": organizationId },
        offers: offer,
      },
    ],
  };
}

export function siteForOwnersJsonLdScript(): string {
  return serializeJsonLd(buildSiteForOwnersJsonLd());
}

function pageLastModified(path: string): Date | undefined {
  const baked = process.env.SITEMAP_LASTMOD_JSON;
  if (baked) {
    try {
      const map = JSON.parse(baked) as Record<string, string>;
      const iso = map[path];
      if (iso) {
        const date = new Date(iso);
        if (!Number.isNaN(date.getTime())) return date;
      }
    } catch {
      // Malformed bake — fall through to git or file mtime.
    }
  }
  const files = SITEMAP_SOURCES[path];
  if (!files) return undefined;
  const iso = lastModifiedIso(files);
  return iso ? new Date(iso) : undefined;
}

export function buildSiteForOwnersSitemap(host: string | null): MetadataRoute.Sitemap {
  if (!host || !isLegacySiteforownersApex(host)) return [];
  const paths = ["/", "/demo", "/request-site", "/privacy", "/terms", ...MARKETING_GUIDES.map((guide) => guide.path)];
  return paths.map((path) => {
    const page = path === "/" ? "" : path.replace(/^\//, "");
    const lastModified = pageLastModified(path);
    return {
      url: new URL(page, SITEFOROWNERS_HOME).href,
      ...(lastModified ? { lastModified } : {}),
    };
  });
}
