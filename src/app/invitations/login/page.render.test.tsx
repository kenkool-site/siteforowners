import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import InvitationLoginPage from "./page";

Object.assign(globalThis, { React });

test("the login page renders Spanish copy when lang is es", () => {
  const html = renderToStaticMarkup(
    <InvitationLoginPage searchParams={{ lang: "es" }} />,
  );
  assert.match(html, /Administre su invitación/);
  assert.doesNotMatch(html, /Manage your invitation/);
});
