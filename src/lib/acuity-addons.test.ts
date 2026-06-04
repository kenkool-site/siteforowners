import test from "node:test";
import assert from "node:assert/strict";
import { buildAcuityAddonMap, acuityAddOnsForService } from "./acuity-addons";

// Real shape from Acuity's embedded BUSINESS.addons array.
const ADDONS = [
  { id: 7039259, name: "(Long) Cuban Twist  ", duration: 70, price: "110.00", active: true, private: false },
  { id: 6678543, name: "(Short) Cuban Twist ", duration: 60, price: "60.00", active: true, private: false },
  { id: 6968512, name: "Black dye(Full head)", duration: 40, price: "80.00", active: true, private: false },
  { id: 5316435, name: "Loc Trim/Cut", duration: 15, price: "35.00", active: true, private: false },
];

test("buildAcuityAddonMap indexes add-ons by id", () => {
  const map = buildAcuityAddonMap(ADDONS);
  assert.equal(map.size, 4);
  assert.equal(map.get(7039259)?.name, "(Long) Cuban Twist  ");
});

test("buildAcuityAddonMap returns empty map for non-array input", () => {
  assert.equal(buildAcuityAddonMap(undefined).size, 0);
  assert.equal(buildAcuityAddonMap({}).size, 0);
});

test("acuityAddOnsForService maps addonIDs to platform AddOn[] with price+duration", () => {
  const map = buildAcuityAddonMap(ADDONS);
  const result = acuityAddOnsForService([7039259, 6968512, 5316435], map);
  assert.deepEqual(result, [
    { name: "(Long) Cuban Twist", price_delta: 110, duration_delta_minutes: 70 },
    { name: "Black dye(Full head)", price_delta: 80, duration_delta_minutes: 40 },
    { name: "Loc Trim/Cut", price_delta: 35, duration_delta_minutes: 15 },
  ]);
});

test("acuityAddOnsForService skips unknown addon ids", () => {
  const map = buildAcuityAddonMap(ADDONS);
  const result = acuityAddOnsForService([7039259, 99999999], map);
  assert.equal(result.length, 1);
  assert.equal(result[0].name, "(Long) Cuban Twist");
});

test("acuityAddOnsForService snaps duration to a multiple of 5", () => {
  const map = buildAcuityAddonMap([
    { id: 1, name: "Odd", duration: 47, price: "10", active: true, private: false },
  ]);
  const result = acuityAddOnsForService([1], map);
  assert.equal(result[0].duration_delta_minutes, 45);
});

test("acuityAddOnsForService skips inactive and private add-ons", () => {
  const map = buildAcuityAddonMap([
    { id: 1, name: "Inactive", duration: 30, price: "10", active: false, private: false },
    { id: 2, name: "Admin only", duration: 30, price: "10", active: true, private: true },
    { id: 3, name: "Public", duration: 30, price: "10", active: true, private: false },
  ]);
  const result = acuityAddOnsForService([1, 2, 3], map);
  assert.deepEqual(result.map((a) => a.name), ["Public"]);
});

test("acuityAddOnsForService dedupes by name (case-insensitive)", () => {
  const map = buildAcuityAddonMap([
    { id: 1, name: "Boho Curls", duration: 60, price: "60", active: true, private: false },
    { id: 2, name: "boho curls", duration: 60, price: "60", active: true, private: false },
  ]);
  const result = acuityAddOnsForService([1, 2], map);
  assert.equal(result.length, 1);
});

test("acuityAddOnsForService caps at 10 add-ons", () => {
  const raw = Array.from({ length: 14 }, (_, i) => ({
    id: i + 1,
    name: `Add ${i + 1}`,
    duration: 30,
    price: "10",
    active: true,
    private: false,
  }));
  const map = buildAcuityAddonMap(raw);
  const result = acuityAddOnsForService(raw.map((a) => a.id), map);
  assert.equal(result.length, 10);
});

test("acuityAddOnsForService returns [] for non-array addonIDs", () => {
  const map = buildAcuityAddonMap(ADDONS);
  assert.deepEqual(acuityAddOnsForService(undefined, map), []);
});

test("acuityAddOnsForService skips add-ons with empty name or negative price", () => {
  const map = buildAcuityAddonMap([
    { id: 1, name: "   ", duration: 30, price: "10", active: true, private: false },
    { id: 2, name: "Negative", duration: 30, price: "-5", active: true, private: false },
  ]);
  assert.deepEqual(acuityAddOnsForService([1, 2], map), []);
});
