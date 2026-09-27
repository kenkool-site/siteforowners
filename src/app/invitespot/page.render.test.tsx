import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import InviteSpotLandingPage, { metadata } from "./page";

Object.assign(globalThis, { React });

test("the invitespot.app apex placeholder renders standalone, with no props and no data dependencies", () => {
  const html = renderToStaticMarkup(<InviteSpotLandingPage />);
  assert.match(html, /InviteSpot/);
});

// Next.js merges metadata down the tree, so this page inherits anything it
// doesn't declare itself. Without its own openGraph/twitter, a link preview of
// invitespot.app would show the root layout's SiteForOwners branding and
// screenshot instead. These assertions pin the page's own InviteSpot-branded
// values so that regression is caught here rather than in a link preview.
test("the invitespot.app apex page declares its own InviteSpot-branded OpenGraph and Twitter metadata, not inherited SiteForOwners values", () => {
  const alternates = metadata.alternates as { canonical?: string } | undefined;
  assert.equal(alternates?.canonical, "https://www.invitespot.app/");

  const openGraph = metadata.openGraph as { siteName?: string; title?: string | null } | undefined;
  assert.equal(openGraph?.siteName, "InviteSpot");
  assert.equal(openGraph?.title, "InviteSpot");

  const twitter = metadata.twitter as { title?: string | null } | undefined;
  assert.equal(twitter?.title, "InviteSpot");
});
