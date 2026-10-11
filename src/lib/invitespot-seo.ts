import type { Metadata } from "next";
import enMessages from "../../messages/en.json";
import esMessages from "../../messages/es.json";

export type InvitespotLocale = "en" | "es";
export const INVITESPOT_HOME = "https://www.invitespot.app/";
// Update only when the marketing content changes, never on each request.
export const INVITESPOT_CONTENT_UPDATED = "2026-10-11";
export const INVITESPOT_LANGUAGE_URLS = {
  en: INVITESPOT_HOME,
  es: `${INVITESPOT_HOME}?lang=es`,
  "x-default": INVITESPOT_HOME,
};

export function invitespotLocale(lang: unknown): InvitespotLocale {
  return lang === "es" ? "es" : "en";
}

export function invitespotSeoCopy(locale: InvitespotLocale) {
  return (locale === "es" ? esMessages : enMessages).invitespot.seo;
}

export function buildInvitespotMetadata(lang?: unknown): Metadata {
  const locale = invitespotLocale(lang);
  const copy = invitespotSeoCopy(locale);
  const canonical = INVITESPOT_LANGUAGE_URLS[locale];
  const image = new URL(`invitespot/social-preview-${locale}.png`, INVITESPOT_HOME).href;
  return {
    // Next 14 strips search parameters from root-path URLs when resolving
    // against metadataBase. Every URL here is absolute; clear the inherited
    // SiteForOwners base to preserve the Spanish canonical and alternates.
    metadataBase: null,
    title: copy.title,
    description: copy.description,
    applicationName: "InviteSpot",
    alternates: { canonical, languages: INVITESPOT_LANGUAGE_URLS },
    openGraph: {
      type: "website",
      url: canonical,
      siteName: "InviteSpot",
      title: copy.title,
      description: copy.description,
      locale: locale === "es" ? "es_ES" : "en_US",
      alternateLocale: locale === "es" ? "en_US" : "es_ES",
      images: [{ url: image, width: 1200, height: 630, alt: copy.imageAlt }],
    },
    twitter: {
      card: "summary_large_image",
      title: copy.title,
      description: copy.description,
      images: [{ url: image, alt: copy.imageAlt }],
    },
  };
}
