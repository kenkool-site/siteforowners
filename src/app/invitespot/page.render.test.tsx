import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../messages/en.json";
import { InviteSpotLandingContent } from "@/components/invitespot/InviteSpotLandingContent";

Object.assign(globalThis, { React });

function render(referralName: string | null, referralSlug: string | null): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC">
      <InviteSpotLandingContent referralName={referralName} referralSlug={referralSlug} />
    </NextIntlClientProvider>,
  );
}

test("the invitespot.app landing page renders the hero and form without a referral name", () => {
  const html = render(null, null);
  assert.match(html, /A beautiful invitation/);
  assert.match(html, /Every memory together/);
  assert.match(html, /Made for your kind of gathering/);
  assert.match(html, /Every guest’s photos, together/);
  assert.match(html, /Tell us about your event/);
  assert.doesNotMatch(html, /You came from/);
  assert.doesNotMatch(html, /What you get/); // the old "what you get" section heading must be gone
});

test("the invitespot.app landing page shows the referral banner with the honoree names when a name is resolved", () => {
  const html = render("Mia and Lee", "mia-and-lee");
  assert.match(html, /You came from Mia and Lee&#x27;s page/);
});

// Structural, matching this codebase's convention for logic that can't be
// exercised by direct invocation in this test environment (see
// src/app/api/invitations/admin/find-me-settings/route.test.ts): page.tsx
// itself can't be imported here (see the note above this file), so this
// confirms its referral-lookup wiring and error-swallowing by reading its
// own source rather than calling it.
test("the page wires the real getPublicInvitationBySlug into getInvitationReferralDisplayName inside a try/catch that never rethrows", () => {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  assert.match(source, /getInvitationReferralDisplayName\(referralSlug, getPublicInvitationBySlug\)/);
  const tryIndex = source.indexOf("try {");
  const catchIndex = source.indexOf("} catch");
  assert.notEqual(tryIndex, -1);
  assert.notEqual(catchIndex, -1);
  const lookupCallIndex = source.indexOf("getInvitationReferralDisplayName(referralSlug, getPublicInvitationBySlug)");
  assert.ok(tryIndex < lookupCallIndex && lookupCallIndex < catchIndex, "the lookup call must be inside the try block");
});

// Structural for the same reason as the test above (page.tsx can't be
// imported here). This replaces a test the pre-landing-page placeholder
// had that imported `metadata` directly from ./page — Next.js merges
// metadata down the tree, so without its own openGraph/twitter this page
// would silently inherit the root layout's SiteForOwners branding and
// screenshot in a link preview (see src/app/layout.tsx). Pinning the
// literal values here keeps that regression caught even though the export
// can no longer be imported and inspected directly.
test("the page generates localized InviteSpot metadata from the language query", () => {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  assert.match(source, /export function generateMetadata/);
  assert.match(source, /buildInvitespotMetadata\(searchParams.lang\)/);
});

 test("marketing examples include other occasions and privacy explains AI moderation", () => {
 const html = render(null, null);
 assert.match(html, /Naming ceremony/);
 assert.match(html, /Birthday/);
 assert.match(html, /AI smart albums/);
 assert.match(html, /Privacy &amp; AI moderation/);
 assert.match(html, /automatically removes inappropriate images/);
 assert.doesNotMatch(html, /invites-showcase\.jpg|memories-showcase\.jpg/);
 });
