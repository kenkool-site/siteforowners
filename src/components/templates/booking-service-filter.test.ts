import assert from "node:assert/strict";
import test from "node:test";
import { filterBookingServices } from "./booking-service-filter";

const services = [
  { name: "Medium Knotless Braids", price: "$240" },
  { name: "Stitch Braids", price: "$120+" },
  { name: "Cornrows", price: "$180+" },
];

test("filterBookingServices returns the original services for an empty query", () => {
  assert.equal(filterBookingServices(services, ""), services);
  assert.equal(filterBookingServices(services, "   "), services);
});

test("filterBookingServices matches service names case-insensitively", () => {
  assert.deepEqual(filterBookingServices(services, "BRAIDS"), services.slice(0, 2));
});

test("filterBookingServices uses deterministic Unicode case matching", () => {
  const originalToLocaleLowerCase = String.prototype.toLocaleLowerCase;
  String.prototype.toLocaleLowerCase = () => {
    throw new Error("locale-sensitive casing should not be used");
  };

  try {
    const unicodeServices = [{ name: "CAFÉ BRAIDS" }];
    assert.deepEqual(filterBookingServices(unicodeServices, "café"), unicodeServices);
  } finally {
    String.prototype.toLocaleLowerCase = originalToLocaleLowerCase;
  }
});

test("filterBookingServices trims the query before matching", () => {
  assert.deepEqual(filterBookingServices(services, " stitch "), [services[1]]);
});

test("filterBookingServices returns an empty list when nothing matches", () => {
  assert.deepEqual(filterBookingServices(services, "locs"), []);
});
