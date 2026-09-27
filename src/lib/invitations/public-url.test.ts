import assert from "node:assert/strict";
import test from "node:test";
import { invitationCoverPreviewUrl, invitationPublicUrl } from "./public-url";

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

test("cover previews stay on the shared siteforowners.com app URL, unaffected by the invitespot.app migration", () => {
  assert.equal(
    invitationCoverPreviewUrl({ slug: "mercy-john" }),
    "https://www.siteforowners.com/api/invitations/public/mercy-john/cover",
  );
});
