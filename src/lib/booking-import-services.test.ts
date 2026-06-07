import test from "node:test";
import assert from "node:assert/strict";
import {
  servicesFromBookingCategories,
  durationMinutesFromImportLabel,
} from "./booking-import-services";

test("durationMinutesFromImportLabel snaps human labels to 30-min steps", () => {
  assert.equal(durationMinutesFromImportLabel("45 min"), 60);
  assert.equal(durationMinutesFromImportLabel("1h 30m"), 90);
  assert.equal(durationMinutesFromImportLabel("90 min"), 90);
});

test("durationMinutesFromImportLabel caps at 480 by default (unchanged for existing callers)", () => {
  assert.equal(durationMinutesFromImportLabel("570 min"), 480);
  assert.equal(durationMinutesFromImportLabel("9h"), 480);
});

test("durationMinutesFromImportLabel respects a relaxed cap for Square's real durations", () => {
  assert.equal(durationMinutesFromImportLabel("570 min", 720), 570);
  assert.equal(durationMinutesFromImportLabel("510 min", 720), 510);
  // still snaps and still enforces the relaxed ceiling
  assert.equal(durationMinutesFromImportLabel("800 min", 720), 720);
});

test("durationMinutesFromImportLabel keeps the 30-min floor regardless of cap", () => {
  assert.equal(durationMinutesFromImportLabel("20 min", 720), 30);
});

test("servicesFromBookingCategories carries imported add_ons onto the service", () => {
  const result = servicesFromBookingCategories([
    {
      name: "Locs",
      services: [
        {
          name: "Man bun loc",
          price: "$120",
          add_ons: [
            { name: "Loc Trim/Cut", price_delta: 35, duration_delta_minutes: 15 },
            { name: "Boho curls", price_delta: 60, duration_delta_minutes: 60 },
          ],
        },
      ],
    },
  ]);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].add_ons, [
    { name: "Loc Trim/Cut", price_delta: 35, duration_delta_minutes: 15 },
    { name: "Boho curls", price_delta: 60, duration_delta_minutes: 60 },
  ]);
});

test("servicesFromBookingCategories omits add_ons when none are present", () => {
  const result = servicesFromBookingCategories([
    { name: "Locs", services: [{ name: "Man bun loc", price: "$120" }] },
  ]);
  assert.equal(result[0].add_ons, undefined);
});

test("servicesFromBookingCategories ignores malformed add_ons", () => {
  const result = servicesFromBookingCategories([
    { name: "Locs", services: [{ name: "Man bun loc", add_ons: "nope" }] },
  ]);
  assert.equal(result[0].add_ons, undefined);
});
