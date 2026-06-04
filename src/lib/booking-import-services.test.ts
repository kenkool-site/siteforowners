import test from "node:test";
import assert from "node:assert/strict";
import { servicesFromBookingCategories } from "./booking-import-services";

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
