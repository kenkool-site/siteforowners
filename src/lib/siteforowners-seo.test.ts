import assert from "node:assert/strict";
import test from "node:test";
import { buildSiteForOwnersMetadata, buildSiteForOwnersSitemap, SITEFOROWNERS_SOCIAL_IMAGE } from "./siteforowners-seo";
import { buildMarketingSitemap } from "../app/sitemap";
import { buildInvitespotRobots } from "../app/robots";

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

test("SiteForOwners sitemap lists only its public marketing pages", () => {
  for (const host of ["siteforowners.com", "www.siteforowners.com", "www.siteforowners.com:443"]) {
    const entries = buildSiteForOwnersSitemap(host);
    assert.deepEqual(entries.map(entry => entry.url), ["https://www.siteforowners.com/", "https://www.siteforowners.com/demo", "https://www.siteforowners.com/request-site", "https://www.siteforowners.com/privacy", "https://www.siteforowners.com/terms"]);
    assert.equal(entries[0].lastModified, "2026-10-11");
    assert.ok(entries.every(entry => !entry.alternates));
  }
});

test("marketing sitemap and robots keep each brand isolated from tenants and previews", () => {
  assert.equal(buildMarketingSitemap("www.siteforowners.com").length, 5);
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
