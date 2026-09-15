import assert from "node:assert/strict";
import test from "node:test";
import { invitationPublicUrl } from "./public-url";

test("invitation public URL prefers an assigned clean subdomain", () => {
  assert.equal(
    invitationPublicUrl({ slug: "mercy-john-lx9cwn", publicSubdomain: "mercy-john" }),
    "https://mercy-john.siteforowners.com/",
  );
});

test("invitation public URL keeps the stable legacy route without a subdomain", () => {
  assert.equal(
    invitationPublicUrl(
      { slug: "mercy-john-lx9cwn", publicSubdomain: null },
      "https://www.siteforowners.com",
    ),
    "https://www.siteforowners.com/invite/mercy-john-lx9cwn",
  );
});
