import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Hero } from "./Hero";
import { LeadsSlide } from "./OwnerDashboardSlides/LeadsSlide";
import { ScheduleSlide } from "./OwnerDashboardSlides/ScheduleSlide";
import { ServicesSlide } from "./OwnerDashboardSlides/ServicesSlide";

Object.assign(globalThis, { React });

test("the homepage hero has one niche H1 and keeps the slogan as supporting copy", () => {
  const html = renderToStaticMarkup(<Hero />);
  const h1s = html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/g) ?? [];
  assert.equal(h1s.length, 1);
  assert.match(h1s[0], /Done-for-you websites and booking for hair stylists and braiders/);
  assert.doesNotMatch(h1s[0], /Get booked without the back-and-forth/);
  assert.match(html, /<p[^>]*>Get booked without the back-and-forth\.<\/p>/);
});

test("dashboard mockup labels are not headings", () => {
  for (const html of [
    renderToStaticMarkup(<ScheduleSlide />),
    renderToStaticMarkup(<ServicesSlide />),
    renderToStaticMarkup(<LeadsSlide />),
  ]) {
    assert.equal(html.includes("<h1"), false);
  }
  assert.match(renderToStaticMarkup(<ScheduleSlide />), />Schedule</);
  assert.match(renderToStaticMarkup(<ServicesSlide />), />Services</);
  assert.match(renderToStaticMarkup(<LeadsSlide />), />Leads</);
});
