import assert from "node:assert/strict";
import test from "node:test";
import { invitationCoverPreviewUrl, invitationMemoriesUrl, invitationOgImageUrl, invitationPersonalUrl, invitationPublicUrl } from "./public-url";

test("invitation public URL prefers an assigned clean subdomain, on invitespot.app", () => {
  assert.equal(
    invitationPublicUrl({ slug: "mercy-john-lx9cwn", publicSubdomain: "mercy-john" }),
    "https://mercy-john.invitespot.app/",
  );
});

test("invitation public URL keeps the stable legacy route without a subdomain, against whatever appUrl is passed", () => {
  assert.equal(
    invitationPublicUrl(
      { slug: "mercy-john-lx9cwn", publicSubdomain: null },
      "https://www.invitespot.app",
    ),
    "https://www.invitespot.app/invite/mercy-john-lx9cwn",
  );
});

test("invitation public URL without a subdomain defaults to invitespot.app, not the shared siteforowners.com app URL", () => {
  const original = process.env.NEXT_PUBLIC_INVITESPOT_APP_URL;
  delete process.env.NEXT_PUBLIC_INVITESPOT_APP_URL;
  try {
    assert.equal(
      invitationPublicUrl({ slug: "mercy-john-lx9cwn", publicSubdomain: null }),
      "https://www.invitespot.app/invite/mercy-john-lx9cwn",
    );
  } finally {
    if (original === undefined) delete process.env.NEXT_PUBLIC_INVITESPOT_APP_URL;
    else process.env.NEXT_PUBLIC_INVITESPOT_APP_URL = original;
  }
});

test("invitation public URL without a subdomain honors NEXT_PUBLIC_INVITESPOT_APP_URL when it is set to a custom value", () => {
  const original = process.env.NEXT_PUBLIC_INVITESPOT_APP_URL;
  process.env.NEXT_PUBLIC_INVITESPOT_APP_URL = "https://custom.example.com";
  try {
    assert.equal(
      invitationPublicUrl({ slug: "mercy-john-lx9cwn", publicSubdomain: null }),
      "https://custom.example.com/invite/mercy-john-lx9cwn",
    );
  } finally {
    if (original === undefined) delete process.env.NEXT_PUBLIC_INVITESPOT_APP_URL;
    else process.env.NEXT_PUBLIC_INVITESPOT_APP_URL = original;
  }
});

test("invitation memories URL prefers an assigned clean subdomain, on invitespot.app", () => {
  assert.equal(
    invitationMemoriesUrl({ slug: "mercy-john-lx9cwn", publicSubdomain: "mercy-john" }),
    "https://mercy-john.invitespot.app/memories",
  );
});

test("invitation memories URL without a subdomain falls back to the /invite/{slug}/memories route", () => {
  assert.equal(
    invitationMemoriesUrl(
      { slug: "mercy-john-lx9cwn", publicSubdomain: null },
      "https://www.invitespot.app",
    ),
    "https://www.invitespot.app/invite/mercy-john-lx9cwn/memories",
  );
});

test("open graph images are absolute invitespot.app URLs, including the memories path", () => {
  assert.equal(
    invitationOgImageUrl({ slug: "mercy-john", publicSubdomain: "mercy-john" }),
    "https://mercy-john.invitespot.app/api/invitations/public/mercy-john/og",
  );
  assert.equal(
    invitationOgImageUrl({ slug: "mercy-john", publicSubdomain: "mercy-john" }, "memories"),
    "https://mercy-john.invitespot.app/api/invitations/public/mercy-john/og/memories",
  );
  assert.equal(
    invitationOgImageUrl({ slug: "mercy/john", publicSubdomain: null }),
    "https://www.invitespot.app/api/invitations/public/mercy%2Fjohn/og",
  );
  assert.equal(
    invitationPersonalUrl({ slug: "mercy-john", publicSubdomain: "mercy-john" }, "K7mQ2pLx9aWc4nRb"),
    "https://mercy-john.invitespot.app/i/K7mQ2pLx9aWc4nRb",
  );
});

test("a bogus public subdomain cannot move the preview image off invitespot.app", () => {
  assert.equal(
    invitationOgImageUrl({ slug: "mercy-john", publicSubdomain: "https://evil.example" }),
    "https://www.invitespot.app/api/invitations/public/mercy-john/og",
  );
});

test("cover previews stay on the shared siteforowners.com app URL, unaffected by the invitespot.app migration", () => {
  assert.equal(
    invitationCoverPreviewUrl({ slug: "mercy-john" }),
    "https://www.siteforowners.com/api/invitations/public/mercy-john/cover",
  );
});
