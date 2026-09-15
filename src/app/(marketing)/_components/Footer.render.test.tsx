import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Footer } from "./Footer";

Object.assign(globalThis, { React });

test("the public footer provides a subtle invitation owner sign-in entry point", () => {
  const html = renderToStaticMarkup(<Footer />);
  assert.match(html, /href="\/invitations\/login"/);
  assert.match(html, />Invitation sign in<\/a>/);
});
