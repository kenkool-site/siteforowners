import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { buildInvitespotMetadata, invitespotLocale, INVITESPOT_LANGUAGE_URLS } from "./invitespot-seo";

test("English metadata has a descriptive title, canonical, and large branded sharing image", () => {
  const metadata = buildInvitespotMetadata();
  assert.equal(metadata.title, "InviteSpot | Custom Event Websites, RSVPs & Shared Photos");
  assert.equal(metadata.alternates?.canonical, INVITESPOT_LANGUAGE_URLS.en);
  assert.equal(metadata.metadataBase, null, "absolute root URLs must retain language queries in Next 14");
  assert.deepEqual(metadata.alternates?.languages, INVITESPOT_LANGUAGE_URLS);
  assert.equal(metadata.openGraph?.url, INVITESPOT_LANGUAGE_URLS.en);
  assert.deepEqual(metadata.openGraph?.images, [{ url: "https://www.invitespot.app/invitespot/social-preview-en.png", width: 1200, height: 630, alt: "InviteSpot — custom event websites, guest RSVPs and shared memories" }]);
  assert.ok(metadata.twitter && "card" in metadata.twitter);
  assert.equal(metadata.twitter.card, "summary_large_image");
});

test("Spanish metadata has its own canonical, translated copy, and reciprocal language links", () => {
  const metadata = buildInvitespotMetadata("es");
  assert.equal(metadata.alternates?.canonical, INVITESPOT_LANGUAGE_URLS.es);
  assert.deepEqual(metadata.alternates?.languages, INVITESPOT_LANGUAGE_URLS);
  assert.equal(metadata.openGraph?.url, INVITESPOT_LANGUAGE_URLS.es);
  assert.match(String(metadata.title), /Webs para eventos/);
  assert.match(String(metadata.description), /álbumes inteligentes/);
  assert.ok(JSON.stringify(metadata.twitter).includes("social-preview-es.png"));
  assert.ok(!JSON.stringify(metadata).includes("siteforowners"));
});

test("unknown and non-string languages safely default to English", () => {
  for (const lang of [undefined, null, "fr", ["es"], "<script>"]) {
    assert.equal(invitespotLocale(lang), "en");
    assert.deepEqual(buildInvitespotMetadata(lang), buildInvitespotMetadata("en"));
  }
});

test("both referenced social preview images exist as project assets", () => {
  for (const locale of ["en", "es"]) {
    assert.ok(existsSync(new URL(`../../public/invitespot/social-preview-${locale}.png`, import.meta.url)));
  }
});

test("Next 14 preserves Spanish query parameters when resolving canonical and hreflang tags", async () => {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const { resolveAlternates } = require("next/dist/lib/metadata/resolvers/resolve-basics.js") as {
    resolveAlternates: (
      alternates: ReturnType<typeof buildInvitespotMetadata>["alternates"],
      base: ReturnType<typeof buildInvitespotMetadata>["metadataBase"],
      context: { pathname: string; trailingSlash: boolean },
    ) => { canonical: { url: string }; languages: Record<string, { url: string }[]> };
  };
  for (const locale of ["en", "es"] as const) {
    const metadata = buildInvitespotMetadata(locale);
    const resolved = resolveAlternates(metadata.alternates, metadata.metadataBase, { pathname: "/invitespot", trailingSlash: false });
    assert.equal(resolved.canonical.url, INVITESPOT_LANGUAGE_URLS[locale]);
    assert.equal(resolved.languages.es[0].url, INVITESPOT_LANGUAGE_URLS.es);
    assert.equal(resolved.languages.en[0].url, INVITESPOT_LANGUAGE_URLS.en);
  }
});
