import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import InviteSpotLandingPage from "./page";

Object.assign(globalThis, { React });

test("the invitespot.app apex placeholder renders standalone, with no props and no data dependencies", () => {
  const html = renderToStaticMarkup(<InviteSpotLandingPage />);
  assert.match(html, /InviteSpot/);
});
