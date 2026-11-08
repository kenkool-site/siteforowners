import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import BookingPage from "./booking-website-for-braiders/page";
import StylistPage from "./hair-stylist-website-builder/page";
import BraiderPage from "./website-for-hair-braiders/page";
import { MARKETING_GUIDES } from "@/lib/marketing-guides";

Object.assign(globalThis, { React });

test("guide pages render one H1, the target phrase, and links to each other", () => {
  const pages = [
    { Page: BraiderPage, phrase: "Website for hair braiders" },
    { Page: BookingPage, phrase: "Booking website for braiders" },
    { Page: StylistPage, phrase: "Hair stylist website builder" },
  ];
  for (const { Page, phrase } of pages) {
    const html = renderToStaticMarkup(<Page />);
    const h1s = html.match(/<h1\b/g) ?? [];
    assert.equal(h1s.length, 1, phrase);
    assert.match(html, new RegExp(phrase));
    assert.match(html, /\$50/);
    assert.doesNotMatch(html, /testimonial|5-star|trusted by|customers say/i);
    for (const guide of MARKETING_GUIDES) {
      assert.match(html, new RegExp(`href="${guide.path}"`));
    }
    assert.match(html, /href="\/request-site"/);
  }
});
