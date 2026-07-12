import type { GeneratedCopy } from "@/lib/ai/types";
import type { Metadata } from "next";
import { buildSharePreviewTitle } from "@/lib/share-preview-title";
import { tenantUrl, type TenantHostFields } from "@/lib/tenant-url";
import { homepagePath } from "./urls";
import type { HomeServicesLocale } from "./types";

export type HomeServicesTenantHostFields = TenantHostFields & {
  preview_slug: string;
};

export function hasSpanishHomepageCopy(
  generatedCopy: GeneratedCopy | null | undefined,
): boolean {
  const es = generatedCopy?.es;
  return Boolean(
    es?.hero_headline?.trim() &&
      es?.hero_subheadline?.trim(),
  );
}

export function buildHomeServicesHomepageAlternates(
  tenant: HomeServicesTenantHostFields,
  appUrl: string,
  locale: HomeServicesLocale,
): NonNullable<Metadata["alternates"]> {
  const enUrl = tenantUrl(appUrl, tenant, homepagePath("en"));
  const esUrl = tenantUrl(appUrl, tenant, homepagePath("es"));
  const canonical = tenantUrl(appUrl, tenant, homepagePath(locale));

  return {
    canonical,
    languages: {
      en: enUrl,
      es: esUrl,
      "x-default": enUrl,
    },
  };
}

export function buildHomeServicesHomepageSeoFields(
  businessName: string,
  generatedCopy: GeneratedCopy | null | undefined,
  locale: HomeServicesLocale,
): { title: string; description: string; shareTitle: string } {
  const localeCopy = generatedCopy?.[locale];
  const name = businessName.trim() || "Business";

  const title =
    localeCopy?.seo_title?.trim() ||
    (localeCopy?.hero_headline?.trim()
      ? `${name} — ${localeCopy.hero_headline.trim()}`
      : name);

  let description: string;
  if (locale === "es") {
    description =
      localeCopy?.seo_description?.trim() ||
      localeCopy?.hero_subheadline?.trim() ||
      name;
  } else {
    description =
      localeCopy?.seo_description?.trim() ||
      localeCopy?.hero_subheadline?.trim() ||
      `${name} — book online, see services, and get in touch.`;
  }

  const shareTitle = buildSharePreviewTitle(name, {
    seoTitle: localeCopy?.seo_title,
    heroHeadline: localeCopy?.hero_headline,
  });

  return { title, description, shareTitle };
}

export function buildHomeServicesHomepageMetadata(input: {
  businessName: string;
  generatedCopy: GeneratedCopy | null | undefined;
  images?: string[] | null;
  tenant: HomeServicesTenantHostFields;
  appUrl: string;
  locale: HomeServicesLocale;
  noindex?: boolean;
  includeHreflang?: boolean;
}): Metadata {
  const {
    businessName,
    generatedCopy,
    images,
    tenant,
    appUrl,
    locale,
    noindex = false,
    includeHreflang = true,
  } = input;

  const alternates = buildHomeServicesHomepageAlternates(tenant, appUrl, locale);
  const { title, description, shareTitle } = buildHomeServicesHomepageSeoFields(
    businessName,
    generatedCopy,
    locale,
  );
  const name = businessName.trim() || "Business";
  const image = images?.[0];
  const imageBlock = image ? { images: [{ url: image, alt: name }] } : {};

  return {
    metadataBase: new URL(alternates.canonical as string),
    applicationName: name,
    title,
    description,
    alternates: includeHreflang
      ? alternates
      : { canonical: alternates.canonical },
    ...(noindex ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      title: shareTitle,
      description,
      type: "website",
      siteName: name,
      url: alternates.canonical as string,
      ...imageBlock,
    },
    twitter: {
      card: "summary_large_image",
      title: shareTitle,
      description,
      ...imageBlock,
    },
  };
}
