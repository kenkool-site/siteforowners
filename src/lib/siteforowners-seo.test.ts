import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildSiteForOwnersJsonLd, buildSiteForOwnersMetadata, buildSiteForOwnersSitemap, SITEFOROWNERS_SOCIAL_IMAGE } from "./siteforowners-seo";
import { buildMarketingSitemap } from "../app/sitemap";
import { buildInvitespotRobots } from "../app/robots";
import { MARKETING_GUIDES } from "./marketing-guides";

test("SiteForOwners metadata targets stylists and salons with its own sharing image", () => {
  const metadata = buildSiteForOwnersMetadata();
  assert.equal(metadata.title, "Websites for Stylists & Salons | SiteForOwners");
  assert.match(metadata.description ?? "", /hair stylists, salons, braiders and barbers/);
  assert.equal(metadata.alternates?.canonical, "https://www.siteforowners.com/");
  assert.ok(JSON.stringify(metadata.openGraph?.images).includes(SITEFOROWNERS_SOCIAL_IMAGE));
  assert.ok(metadata.twitter && "card" in metadata.twitter);
  assert.equal(metadata.twitter.card, "summary_large_image");
  assert.ok(!JSON.stringify(metadata).includes("invitespot"));
});

test("SiteForOwners sitemap lists public marketing pages and guide URLs with git lastmod", () => {
  const guideUrls = MARKETING_GUIDES.map((guide) => `https://www.siteforowners.com${guide.path}`);
  const privacyIso = execFileSync(
    "git",
    ["log", "-1", "--format=%cI", "--", "src/app/(marketing)/privacy/page.tsx"],
    { encoding: "utf8" },
  ).trim();
  for (const host of ["siteforowners.com", "www.siteforowners.com", "www.siteforowners.com:443"]) {
    const entries = buildSiteForOwnersSitemap(host);
    assert.deepEqual(entries.map(entry => entry.url), [
      "https://www.siteforowners.com/",
      "https://www.siteforowners.com/demo",
      "https://www.siteforowners.com/request-site",
      "https://www.siteforowners.com/privacy",
      "https://www.siteforowners.com/terms",
      ...guideUrls,
    ]);
    assert.ok(entries.every(entry => entry.lastModified instanceof Date && !Number.isNaN(entry.lastModified.getTime())));
    const privacy = entries.find(entry => entry.url.endsWith("/privacy"));
    assert.ok(privacy?.lastModified instanceof Date);
    assert.equal(privacy.lastModified.toISOString(), new Date(privacyIso).toISOString());
    assert.ok(entries.every(entry => !entry.alternates));
  }
});

test("homepage JSON-LD uses the published $50 price and no ratings", () => {
  const pricing = readFileSync(new URL("../app/(marketing)/_components/Pricing.tsx", import.meta.url), "utf8");
  const terms = readFileSync(new URL("../app/(marketing)/terms/page.tsx", import.meta.url), "utf8");
  assert.match(pricing, /\$50/);
  assert.match(terms, /\$50 per month/);
  const json = JSON.stringify(buildSiteForOwnersJsonLd());
  assert.match(json, /"@type":"Organization"/);
  assert.match(json, /"@type":"SoftwareApplication"/);
  assert.match(json, /"@type":"Service"/);
  assert.match(json, /"price":"50"/);
  assert.doesNotMatch(json, /aggregateRating|reviewCount|\$65|\$99|\$149/);
});

test("marketing sitemap and robots keep each brand isolated from tenants and previews", () => {
  assert.equal(buildMarketingSitemap("www.siteforowners.com").length, 8);
  const robots = JSON.stringify(buildInvitespotRobots("www.siteforowners.com"));
  assert.equal(robots.includes("Disallow"), false);
  assert.equal(robots.includes("/preview"), false);
  assert.equal(buildMarketingSitemap("www.invitespot.app").length, 2);
  for (const host of ["mariamhair.com", "salon.siteforowners.com", "event.invitespot.app", "localhost", "preview.vercel.app", null]) {
    assert.deepEqual(buildMarketingSitemap(host), []);
    assert.equal(buildInvitespotRobots(host).sitemap, undefined);
  }
  assert.equal(buildInvitespotRobots("www.siteforowners.com").sitemap, "https://www.siteforowners.com/sitemap.xml");
});

test("the branded social image endpoint serves a real 1200 by 630 PNG", async () => {
  const { default: image } = await import("../app/opengraph-image");
  const response = await image();
  assert.equal(response.headers.get("Content-Type"), "image/png");
  const data = Buffer.from(await response.arrayBuffer());
  assert.equal(data.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(data.readUInt32BE(16), 1200);
  assert.equal(data.readUInt32BE(20), 630);
});

test("legal pages in the sitemap have their own canonical URLs", async () => {
  const privacy = await import("../app/(marketing)/privacy/page");
  const terms = await import("../app/(marketing)/terms/page");
  for (const [slug, page] of [["privacy", privacy], ["terms", terms]] as const) {
    const metadata: import("next").Metadata = page.metadata;
    assert.equal(metadata.alternates?.canonical, `https://www.siteforowners.com/${slug}`);
  }
});
